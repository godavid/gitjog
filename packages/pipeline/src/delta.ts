// Napi delta: az adat-repo meglévő állapotához képest új, MA már hatályos
// időállapotok letöltése, commitolása és pusholása. Idempotens: ha nincs új
// állapot, nem hoz létre commitot. GitHub Actionsben fut (lásd az adat-repo
// .github/workflows/napi-delta.yml-jét), de lokálisan is futtatható.
//
// Hiba esetén: SEMMIT nem commitol, riaszt (GitHub Issue) és 1-es kóddal lép ki.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NJT_BASE, teljesJogszabalyLista, type Jogszabaly } from "./config.js";
import {
  getIdoallapotok,
  getTeljesSnapshot,
  maiNapBudapest,
  napiGyoztesek,
  UresVerziolistaHiba,
  type Idoallapot,
} from "./crawl.js";
import {
  maiHalmaz,
  retegBesorolas,
  retegOsszefoglalo,
  retegTerkepJson,
  retegTerkepOlvas,
  RETEG_FAJL,
  type RetegTerkep,
} from "./enumeralas.js";
import { markdownGeneralas } from "./normalize.js";
import { megjelolesIllesztes, parsolSnapshot } from "./parse.js";
import { riaszt, terjedelemEllenorzes } from "./health.js";
import {
  ADAT_REPO_DIR,
  allapotShaTerkep,
  commit,
  fajlIras,
  git,
  metaJson,
  pushRebase,
  type AllapotBejegyzes,
} from "./commit.js";

const push = !process.argv.includes("--no-push");
const ma = maiNapBudapest();

/**
 * Biztonsági szelep: egy normál napon néhány (max pár tucat) új állapot jön.
 * Ennél sokkal több azt jelzi, hogy a config és a repo szétcsúszott (pl. a
 * generált lista bővült backfill nélkül) — ilyenkor riasztunk, nem commitolunk.
 */
const MAX_NAPI_UJ = 200;

/**
 * Ennyi sikertelen verziólista-kérésig (a retry+backoff kimerülése UTÁN) nem
 * riasztunk: egy-két kiesés az njt normál üzemi zaja. Fölötte viszont
 * kimaradásra vagy blokkolásra gyanakszunk, és inkább leállunk.
 */
const MAX_HALOZATI_HIBA = 20;

interface UjEsemeny {
  js: Jogszabaly;
  allapot: Idoallapot;
}

async function retegTerkepMentes(terkep: RetegTerkep): Promise<void> {
  await fajlIras(RETEG_FAJL, retegTerkepJson(terkep));
}

async function fut(): Promise<void> {
  if (!existsSync(join(ADAT_REPO_DIR, "index", "allapotok.json"))) {
    throw new Error(`Nem adat-repo: ${ADAT_REPO_DIR} (hiányzó index/allapotok.json)`);
  }
  const ismertNyers = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "allapotok.json"), "utf8"),
  ) as Record<string, AllapotBejegyzes[]>;

  // 1. friss verziólisták + új állapotok kigyűjtése — csak a ma esedékes
  // jogszabályokra (réteges enumerálás, lásd enumeralas.ts)
  const jogszabalyok = await teljesJogszabalyLista();
  const retegTerkep = await retegTerkepOlvas(ADAT_REPO_DIR);
  const vanTerkep = Object.keys(retegTerkep).length > 0;
  const maiak = maiHalmaz(jogszabalyok, retegTerkep, ma);
  console.log(
    `Enumerálás: ${maiak.length}/${jogszabalyok.length} jogszabály esedékes ma` +
      (vanTerkep
        ? ` (${retegOsszefoglalo(retegTerkep)})`
        : " — nincs réteg-térkép, teljes végigjárás"),
  );

  const ujak: UjEsemeny[] = [];
  let halozatiHiba = 0;
  for (const js of maiak) {
    const ismertek = new Set((ismertNyers[js.slug] ?? []).map((a) => a.datum));
    let mind;
    try {
      mind = await getIdoallapotok(js.documentId, { fresh: true });
    } catch (e) {
      if (e instanceof UresVerziolistaHiba) {
        // nincs konszolidált szöveg (kihagyottak-listás jogszabály) — tartós tény
        retegTerkep[js.documentId] = "nincs-szoveg";
        continue;
      }
      // átmeneti njt-hiba a retry+backoff kimerülése után: a réteget NEM
      // írjuk át, mert egy téves besorolás napokra kiejtené a napi körből
      halozatiHiba++;
      continue;
    }
    retegTerkep[js.documentId] = retegBesorolas(mind, ma);
    // ugyanaz a napi-győztes logika, mint a backfillben (0 napot élt állapot veszít)
    for (const a of napiGyoztesek(mind.filter((x) => x.hatalyba <= ma))) {
      if (!ismertek.has(a.hatalyba)) ujak.push({ js, allapot: a });
    }
  }
  if (halozatiHiba > MAX_HALOZATI_HIBA) {
    throw new Error(
      `${halozatiHiba} verziólista-kérés hiúsult meg ${maiak.length}-ből — njt-kimaradás vagy blokkolás? Nem commitolok.`,
    );
  }
  if (halozatiHiba > 0) {
    console.log(`(${halozatiHiba} verziólista nem jött le — a következő futás újrapróbálja)`);
  }

  if (ujak.length === 0) {
    // a réteg-térkép akkor is változhatott, ha nincs új időállapot
    await retegTerkepMentes(retegTerkep);
    if (await commit("Enumerálás-térkép frissítés")) {
      console.log(`Enumerálás-térkép frissítve (${retegOsszefoglalo(retegTerkep)}).`);
      if (push) await pushRebase();
    }
    console.log("Nincs új hatályos időállapot — nincs teendő.");
    return;
  }
  if (ujak.length > MAX_NAPI_UJ) {
    throw new Error(
      `Gyanúsan sok (${ujak.length}) új állapot egy napi futásban — config/repo szétcsúszás? Nem commitolok.`,
    );
  }

  const esemenyek = ujak.sort((a, b) =>
    a.allapot.hatalyba < b.allapot.hatalyba
      ? -1
      : a.allapot.hatalyba > b.allapot.hatalyba
        ? 1
        : a.js.slug.localeCompare(b.js.slug),
  );
  console.log(`${esemenyek.length} új időállapot: ${esemenyek.map((e) => `${e.js.slug}@${e.allapot.hatalyba}`).join(", ")}`);

  // 2. napi csoportokban: letöltés, validálás, írás, commit
  let i = 0;
  while (i < esemenyek.length) {
    const datum = esemenyek[i]!.allapot.hatalyba;
    const napiak: UjEsemeny[] = [];
    while (i < esemenyek.length && esemenyek[i]!.allapot.hatalyba === datum) {
      napiak.push(esemenyek[i]!);
      i++;
    }
    const uzenetSorok: string[] = [];
    for (const { js, allapot } of napiak) {
      const s = await getTeljesSnapshot(js.documentId, allapot.version);
      const p = parsolSnapshot(s, js.documentId);
      const illesztes = megjelolesIllesztes(js.megjeloles, p.megjeloles);
      if (!illesztes.ok) {
        throw new Error(`Cím-eltérés: ${js.slug} — várt "${js.megjeloles}", kapott "${p.megjeloles}"`);
      }
      const cim = p.cim || illesztes.maradekCim;
      if (p.hatalyDatum && p.hatalyDatum !== allapot.hatalyba) {
        throw new Error(
          `Hatálydátum-eltérés: ${js.slug} v${allapot.version} — várt ${allapot.hatalyba}, oldal: ${p.hatalyDatum}`,
        );
      }
      if (p.ismeretlenOsztalyok.length > 0) {
        throw new Error(
          `Ismeretlen njt-osztályok (${js.slug} v${allapot.version}): ${p.ismeretlenOsztalyok.join(", ")} — a normalize.ts bővítése kell`,
        );
      }
      const md = markdownGeneralas(p);
      const szovegUt = join(ADAT_REPO_DIR, "jogszabalyok", js.slug, "szoveg.md");
      if (existsSync(szovegUt)) {
        const regi = await readFile(szovegUt, "utf8");
        terjedelemEllenorzes(regi.length, md.length, js.slug);
      }
      const allapotok = [
        ...(ismertNyers[js.slug] ?? []).filter((a) => a.datum !== allapot.hatalyba),
        { datum: allapot.hatalyba, verzio: allapot.version },
      ].sort((a, b) => (a.datum < b.datum ? -1 : 1));
      ismertNyers[js.slug] = allapotok;
      await fajlIras(`jogszabalyok/${js.slug}/szoveg.md`, md);
      await fajlIras(`jogszabalyok/${js.slug}/meta.json`, metaJson(js, cim, allapotok));
      uzenetSorok.push(
        `${js.rovidites ?? js.megjeloles}: ${NJT_BASE}/jogszabaly/${js.documentId}.${allapot.version}`,
      );
    }
    const nevek = napiak.map((n) => n.js.rovidites ?? n.js.megjeloles);
    const cim =
      nevek.length === 1
        ? `${nevek[0]} — időállapot ${datum}`
        : `Időállapotok ${datum}: ${nevek.join(", ")}`;
    await commit(`${cim}\n\nForrás (njt):\n${uzenetSorok.map((s) => `- ${s}`).join("\n")}`, datum);
    console.log(`Commit: ${datum} — ${nevek.join(", ")}`);
  }

  // 3. index frissítése külön utócommitban — CSAK a változott jogszabályokra
  // (5585 jogszabálynál a teljes újraépítés naponta fölösleges git-log-ezrek lenne)
  const valtozottSlugok = [...new Set(esemenyek.map((e) => e.js.slug))];
  const allapotIndex = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "allapotok.json"), "utf8"),
  ) as Record<string, { datum: string; verzio: number; sha: string }[]>;
  for (const slug of valtozottSlugok) {
    const shak = await allapotShaTerkep(slug);
    const sajat = (ismertNyers[slug] ?? [])
      .map((a) => ({ datum: a.datum, verzio: a.verzio, sha: shak.get(a.datum) ?? "" }))
      .filter((a) => a.sha !== "");
    allapotIndex[slug] = sajat;
    await fajlIras(`jogszabalyok/${slug}/allapotok.json`, JSON.stringify(sajat, null, 2) + "\n");
  }
  // vadonatúj jogszabály (pl. friss kihirdetés) bekerül a listaindexbe is
  const listaIndex = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "jogszabalyok.json"), "utf8"),
  ) as { slug: string; documentId: string; megjeloles: string; cim: string; rovidites: string | null }[];
  const listaSlugok = new Set(listaIndex.map((t) => t.slug));
  for (const { js } of esemenyek) {
    if (listaSlugok.has(js.slug)) continue;
    const meta = JSON.parse(
      await readFile(join(ADAT_REPO_DIR, "jogszabalyok", js.slug, "meta.json"), "utf8"),
    ) as { cim: string; rovidites: string | null };
    listaIndex.push({
      slug: js.slug,
      documentId: js.documentId,
      megjeloles: js.megjeloles,
      cim: meta.cim,
      rovidites: meta.rovidites ?? null,
    });
    listaSlugok.add(js.slug);
  }
  listaIndex.sort((a, b) => a.slug.localeCompare(b.slug));
  await fajlIras("index/jogszabalyok.json", JSON.stringify(listaIndex, null, 2) + "\n");
  await fajlIras("index/allapotok.json", JSON.stringify(allapotIndex, null, 2) + "\n");
  await retegTerkepMentes(retegTerkep);
  await commit("Index frissítés (allapotok.json, enumeralas.json)");

  if (push) {
    await pushRebase();
    console.log("Push KÉSZ.");
  }

  await keresoIndexSzinkron(valtozottSlugok, jogszabalyok, retegTerkep);
}

/**
 * Keresőindex-szinkron a változott jogszabályokra. KÜLÖN hibaágon fut: az
 * index származtatott adat, a hibája nem ronthatja el a delta kilépési
 * kódját — az adat-repo integritása előbbre való. Riasztunk, és a
 * következő futás úgyis újraírja a változott jogszabályokat.
 */
async function keresoIndexSzinkron(
  valtozottSlugok: string[],
  jogszabalyok: Jogszabaly[],
  retegTerkep: RetegTerkep,
): Promise<void> {
  const dbUrl = process.env.NYILT_DB_URL;
  if (!dbUrl) {
    console.log("NYILT_DB_URL nincs beállítva — keresőindex-szinkron kihagyva.");
    return;
  }
  try {
    const { default: postgres } = await import("postgres");
    const { szinkronizal } = await import("./kereso-index.js");
    const terkep = new Map(jogszabalyok.map((j) => [j.slug, j]));
    const tetelek = valtozottSlugok.flatMap((slug) => {
      const js = terkep.get(slug);
      if (!js) return [];
      return [
        {
          tetel: {
            slug: js.slug,
            documentId: js.documentId,
            megjeloles: js.megjeloles,
            cim: js.cim,
            rovidites: js.rovidites ?? null,
          },
          hatalyos: retegTerkep[js.documentId] !== "lezart",
        },
      ];
    });
    const sql = postgres(dbUrl, { max: 2 });
    try {
      const db = await szinkronizal(sql, tetelek);
      console.log(`Keresőindex frissítve: ${tetelek.length} jogszabály, ${db} szakasz.`);
    } finally {
      await sql.end();
    }
  } catch (e) {
    const uzenet = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error(`Keresőindex-szinkron HIBA (a delta adata rendben van):\n${uzenet}`);
    await riaszt(
      "Keresőindex-szinkron hiba",
      `A napi delta adata rendben bekerült a repóba, de a keresőindex frissítése elhasalt.\n\n` +
        `\`\`\`\n${uzenet}\n\`\`\`\n\n` +
        `Teendő: a következő futás újrapróbálja. Ha ismétlődik, teljes újraépítés:\n` +
        `\`NYILT_DB_URL=... pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes\``,
    );
  }
}

try {
  await fut();
} catch (e) {
  const uzenet = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(uzenet);
  await riaszt(
    "Napi delta hiba — kézi beavatkozás kell",
    `A napi delta-futás hibával állt le, adat NEM került a repóba.\n\n\`\`\`\n${uzenet}\n\`\`\`\n\nTeendő: lásd a gitjog repo docs/uzemeltetes.md fájlját.`,
  );
  process.exit(1);
}
