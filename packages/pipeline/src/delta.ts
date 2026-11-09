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
import { naploIras, type FelvetelTetel } from "./felvetel.js";
import {
  bekerultAllapot,
  helyreallitasKell,
  modositoBlokkValtozas,
  modositoTorveny,
  regebbiAllapot,
  riaszt,
  szetcsuszasGyanu,
  TerjedelemAnomalia,
  terjedelemEllenorzes,
} from "./health.js";
import { ERVENYES_SHA, type AllapotBejegyzes as IndexAllapot } from "./index-ellenorzes-lib.js";
import { kihagyottakSzuro, type KihagyottTetel } from "./kihagyottak.js";
import { AGENTS_MD } from "./sablonok.js";
import type { IndexTetel } from "./kereso-index.js";
import {
  ADAT_REPO_DIR,
  allapotShaTerkep,
  commit,
  fajlIras,
  git,
  metaJson,
  pushRebase,
} from "./commit.js";

const push = !process.argv.includes("--no-push");
const ma = maiNapBudapest();

/**
 * Egyszeri átengedés a terjedelem-őrnek: `--anomalia-ok=<slug>[,<slug>]`.
 * Csak akkor használd, ha KÉZZEL ellenőrizted az njt-n, hogy a zsugorodás valós
 * (a verzió szövege tényleg rövidebb, nem lazy-blokk hiányzik). Kézi futtatásra
 * való eszköz — a napi Actions-futás soha nem adja meg.
 */
const anomaliaOk = new Set(
  process.argv
    .filter((a) => a.startsWith("--anomalia-ok="))
    .flatMap((a) => a.slice("--anomalia-ok=".length).split(","))
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Biztonsági szelep: ha a config és a repo szétcsúszott (pl. a generált lista
 * bővült backfill nélkül), régi vagy előzmény nélküli állapotok tömege jön —
 * ilyenkor riasztunk, nem commitolunk. Mit számol gyanúsnak: szetcsuszasGyanu.
 */
const MAX_GYANUS_UJ = 50;

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

/**
 * HEAD-helyreállításra váró jogszabály: ma egy, a legutóbb ismert állapotánál
 * RÉGEBBI állapota kerül be, ami a HEAD szövegét a régi szövegre állítaná.
 */
interface Helyreallitas {
  js: Jogszabaly;
  utolso: IndexAllapot;
}

async function retegTerkepMentes(terkep: RetegTerkep): Promise<void> {
  await fajlIras(RETEG_FAJL, retegTerkepJson(terkep));
}

/**
 * Terjedelem-anomáliára futott jogszabályok (slug → az anomáliás állapot napja
 * és a hiba üzenete). Az anomáliás állapotot a futás kihagyja — a jogszabály
 * mai további állapotaival együtt, hogy a HEAD ne egy későbbi állapotot
 * mutasson, miközben egy korábbi hiányzik. Az anomália előtti mai állapotai
 * viszont már commitolódtak, ezek bekerülnek (bekerultAllapot()), ahogy a többi
 * jogszabály is. A végén riasztunk. Egy jogszabály tartalmi anomáliája nem
 * állíthatja le az egész napi frissítést: 2026-08-26-tól kilenc napig egyetlen
 * módosító törvény miatt 37 új időállapot nem került be.
 */
const anomaliak = new Map<string, { datum: string; uzenet: string }>();

/** A mai esemény ténylegesen bekerült-e (commitolódott-e) az adat-repóba. */
function bekerultEsemeny(e: UjEsemeny): boolean {
  return bekerultAllapot(e.allapot.hatalyba, anomaliak.get(e.js.slug)?.datum);
}

async function fut(): Promise<void> {
  if (!existsSync(join(ADAT_REPO_DIR, "index", "allapotok.json"))) {
    throw new Error(`Nem adat-repo: ${ADAT_REPO_DIR} (hiányzó index/allapotok.json)`);
  }
  const ismertNyers = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "allapotok.json"), "utf8"),
  ) as Record<string, IndexAllapot[]>;

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
  const helyreallitasok = new Map<string, Helyreallitas>();
  let halozatiHiba = 0;
  for (const js of maiak) {
    const ismertAllapotok = ismertNyers[js.slug] ?? [];
    const ismertek = new Set(ismertAllapotok.map((a) => a.datum));
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
      if (ismertek.has(a.hatalyba)) continue;
      ujak.push({ js, allapot: a });
      // régebbi-állapot-őr: a késve bekerülő régi állapot a HEAD-et is
      // visszaállítaná (így tört el a 1930-evi-xxxvii-torveny) — lásd a 2. lépés után
      const utolso = regebbiAllapot(ismertAllapotok, a.hatalyba);
      if (utolso) {
        console.warn(
          `[régebbi állapot] ${js.slug}: ${a.hatalyba} régebbi a legutóbb ismert ${utolso.datum}-nál — HEAD-helyreállítás jön`,
        );
        helyreallitasok.set(js.slug, { js, utolso });
      }
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
  const gyanus = szetcsuszasGyanu(
    ujak.map((u) => ({
      datum: u.allapot.hatalyba,
      vanElozmeny: (ismertNyers[u.js.slug] ?? []).length > 0,
    })),
    ma,
  );
  if (gyanus > MAX_GYANUS_UJ) {
    throw new Error(
      `Gyanúsan sok (${gyanus}/${ujak.length}) régi vagy előzmény nélküli új állapot — config/repo szétcsúszás? Nem commitolok.`,
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
      if (anomaliak.has(js.slug)) continue; // egy korábbi állapota ma kimaradt — ez sem mehet be
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
        if (anomaliaOk.has(js.slug)) {
          console.warn(
            `[terjedelem-őr átengedve: --anomalia-ok] ${js.slug}: ${regi.length} → ${md.length} kar`,
          );
        } else {
          try {
            // a generált listából jövő tételeknél a config-beli cím üres,
            // ezért a ténylegesen parse-olt cím az elsődleges
            // beágyazott módosító blokkot (nem „…módosításáról” című
            // törvényben) a fordulatok ugrása jelez
            terjedelemEllenorzes(regi.length, md.length, js.slug, {
              zsugorodhat: modositoTorveny(cim || js.cim) || modositoBlokkValtozas(regi, md),
            });
          } catch (e) {
            if (!(e instanceof TerjedelemAnomalia)) throw e;
            anomaliak.set(js.slug, { datum: allapot.hatalyba, uzenet: e.message });
            console.error(`[kihagyva] ${e.message}`);
            continue;
          }
        }
      }
      // Az index bejegyzései sha-t is hordoznak; a meta.json állapotlistájába
      // csak (datum, verzio) való — különben a sha beszivárog a meta.json-ba.
      const allapotok = [
        ...(ismertNyers[js.slug] ?? []).filter((a) => a.datum !== allapot.hatalyba),
        { datum: allapot.hatalyba, verzio: allapot.version },
      ]
        .map(({ datum, verzio }) => ({ datum, verzio }))
        .sort((a, b) => (a.datum < b.datum ? -1 : 1));
      ismertNyers[js.slug] = allapotok;
      await fajlIras(`jogszabalyok/${js.slug}/szoveg.md`, md);
      await fajlIras(`jogszabalyok/${js.slug}/meta.json`, metaJson(js, cim, allapotok));
      uzenetSorok.push(
        `${js.rovidites ?? js.megjeloles}: ${NJT_BASE}/jogszabaly/${js.documentId}.${allapot.version}`,
      );
    }
    if (uzenetSorok.length === 0) continue; // a nap minden tétele kimaradt
    const nevek = napiak.filter(bekerultEsemeny).map((n) => n.js.rovidites ?? n.js.megjeloles);
    const cim =
      nevek.length === 1
        ? `${nevek[0]} — időállapot ${datum}`
        : `Időállapotok ${datum}: ${nevek.join(", ")}`;
    await commit(`${cim}\n\nForrás (njt):\n${uzenetSorok.map((s) => `- ${s}`).join("\n")}`, datum);
    console.log(`Commit: ${datum} — ${nevek.join(", ")}`);
  }
  const bekerult = esemenyek.filter(bekerultEsemeny);

  // 2b. HEAD-helyreállítás: ha egy jogszabálynak ma csak a legutóbb ismert
  // állapotánál régebbi állapota került be, a HEAD szövege a régi szöveg lett.
  // A legutóbbi állapot szövegét a saját commitjából visszaírjuk és a saját
  // dátumával újra commitoljuk, így a HEAD soha nem áll vissza régebbi
  // szövegre. (Ez a git-ág teszteletlen: a regebbiAllapot() és a
  // helyreallitasKell() döntése tesztelt.)
  for (const { js, utolso } of helyreallitasok.values()) {
    // anomáliás jogszabálynál is: az anomália előtti mai állapota már commitolódott
    const maiDatumok = bekerult.filter((e) => e.js.slug === js.slug).map((e) => e.allapot.hatalyba);
    if (!helyreallitasKell(maiDatumok, utolso.datum)) continue;
    if (!utolso.sha) {
      throw new Error(`HEAD-helyreállítás sikertelen: ${js.slug} ${utolso.datum} állapotához az indexben nincs sha`);
    }
    // Az sha az adat-repo indexéből jön, és a `git show` argumentuma lesz: csak
    // teljes hex commit-azonosítót engedünk, különben egy `-`-kezdetű érték
    // opcióként (pl. `--output=…`) futna.
    if (!ERVENYES_SHA.test(utolso.sha)) {
      throw new Error(`HEAD-helyreállítás sikertelen: ${js.slug} ${utolso.datum} index-sha-ja érvénytelen`);
    }
    const szoveg = await git(["show", `${utolso.sha}:jogszabalyok/${js.slug}/szoveg.md`]);
    await fajlIras(`jogszabalyok/${js.slug}/szoveg.md`, szoveg);
    const nev = js.rovidites ?? js.megjeloles;
    if (await commit(`${nev} — időállapot ${utolso.datum} (HEAD-helyreállítás)`, utolso.datum)) {
      console.log(`Commit: ${utolso.datum} — ${nev} (HEAD-helyreállítás)`);
    }
  }

  // Az állapot-commitok pusha MÉG az index előtt: egy elutasított push rebase-e
  // minden helyi SHA-t átír, az index és a felvételi napló viszont SHA-kra
  // hivatkozik — ezért azokat csak a végleges (pusholt) commitokból számoljuk.
  if (push) await pushRebase();

  // 3. index frissítése külön utócommitban — CSAK a változott jogszabályokra
  // (5585 jogszabálynál a teljes újraépítés naponta fölösleges git-log-ezrek lenne)
  const valtozottSlugok = [...new Set(bekerult.map((e) => e.js.slug))];
  const allapotIndex = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "allapotok.json"), "utf8"),
  ) as Record<string, { datum: string; verzio: number; sha: string }[]>;
  // A felvételi napló a „mikor került be" kérdés cursora (lásd felvetel.ts):
  // a ma bekerült állapotok a friss SHA-térképből kapják a commitjukat.
  const naploTetelek: FelvetelTetel[] = [];
  for (const slug of valtozottSlugok) {
    const shak = await allapotShaTerkep(slug);
    const sajat = (ismertNyers[slug] ?? [])
      .map((a) => ({ datum: a.datum, verzio: a.verzio, sha: shak.get(a.datum) ?? "" }))
      .filter((a) => a.sha !== "");
    allapotIndex[slug] = sajat;
    await fajlIras(`jogszabalyok/${slug}/allapotok.json`, JSON.stringify(sajat, null, 2) + "\n");
    for (const e of bekerult) {
      const sha = e.js.slug === slug ? shak.get(e.allapot.hatalyba) : undefined;
      if (sha) naploTetelek.push({ slug, datum: e.allapot.hatalyba, sha });
    }
  }
  // vadonatúj jogszabály (pl. friss kihirdetés) bekerül a listaindexbe is
  const listaIndex = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "jogszabalyok.json"), "utf8"),
  ) as IndexTetel[];
  const listaSlugok = new Set(listaIndex.map((t) => t.slug));
  for (const { js } of bekerult) {
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
  await kihagyottakTisztitas(listaIndex);
  await retegTerkepMentes(retegTerkep);
  await naploIras(new Date(), naploTetelek);
  await fajlIras("AGENTS.md", AGENTS_MD);
  await commit("Index frissítés (allapotok.json, enumeralas.json, felvételi napló)");

  if (push) {
    const rebaselt = await pushRebase();
    if (rebaselt) {
      // Az index-commit saját SHA-jára semmi nem hivatkozik, az állapot-commitok
      // viszont már pusholva voltak — a rebase-nek érintetlenül kellett hagynia őket.
      for (const t of naploTetelek) {
        try {
          await git(["merge-base", "--is-ancestor", t.sha, "HEAD"]);
        } catch {
          throw new Error(
            `Rebase után a naplózott ${t.slug}@${t.datum} commit (${t.sha}) nem a HEAD őse — az index hivatkozásai érvénytelenek`,
          );
        }
      }
    }
    console.log("Push KÉSZ.");
  }

  await keresoIndexSzinkron(valtozottSlugok, listaIndex, retegTerkep);

  if (anomaliak.size > 0) {
    const sorok = [...anomaliak.values()].map((a) => `- ${a.uzenet}`).join("\n");
    console.error(`${anomaliak.size} jogszabály terjedelem-anomália miatt kimaradt:\n${sorok}`);
    await riaszt(
      "Terjedelem-anomália — kézi ellenőrzés kell",
      `A napi delta lefutott, a többi jogszabály bekerült, de az alábbiak kimaradtak, ` +
        `mert a szövegük terjedelme gyanúsan változott:\n\n${sorok}\n\n` +
        `Teendő: ellenőrizd az njt-n, hogy a változás valós-e. Ha igen, egyszeri kézi futás:\n` +
        `\`pnpm --filter @gitjog/pipeline delta -- --anomalia-ok=${[...anomaliak.keys()].join(",")}\`\n` +
        `(a kimaradt állapotokat a következő futások addig minden nap újra megpróbálják).`,
    );
  }
}

/**
 * A backfill kihagyott-listájából (index/kihagyottak.json) kiveszi az azóta
 * bekerült jogszabályokat. Csak akkor ír, ha változott — az Index-commit része.
 */
async function kihagyottakTisztitas(listaIndex: IndexTetel[]): Promise<void> {
  const ut = join(ADAT_REPO_DIR, "index", "kihagyottak.json");
  if (!existsSync(ut)) return;
  const lista = JSON.parse(await readFile(ut, "utf8")) as KihagyottTetel[];
  const szurt = kihagyottakSzuro(
    lista,
    new Set(listaIndex.map((t) => t.documentId)),
    new Set(listaIndex.map((t) => t.slug)),
  );
  if (szurt.length === lista.length) return;
  console.log(`kihagyottak.json: ${lista.length - szurt.length} bekerült jogszabály kivéve`);
  await fajlIras("index/kihagyottak.json", JSON.stringify(szurt, null, 2) + "\n");
}

/**
 * Keresőindex-szinkron a változott jogszabályokra. KÜLÖN hibaágon fut: az
 * index származtatott adat, a hibája nem ronthatja el a delta kilépési
 * kódját — az adat-repo integritása előbbre való. Riasztunk a pótló
 * paranccsal: a következő futás csak a SAJÁT változásait szinkronizálja,
 * az itt kimaradt jogszabályokat magától nem pótolja.
 */
async function keresoIndexSzinkron(
  valtozottSlugok: string[],
  listaIndex: IndexTetel[],
  retegTerkep: RetegTerkep,
): Promise<void> {
  const dbUrl = process.env.NYILT_DB_URL;
  if (!dbUrl) {
    console.log("NYILT_DB_URL nincs beállítva — keresőindex-szinkron kihagyva.");
    return;
  }
  try {
    const { default: postgres } = await import("postgres");
    const { deltaSzinkronTetelek, szinkronizal } = await import("./kereso-index.js");
    const tetelek = deltaSzinkronTetelek(valtozottSlugok, listaIndex, retegTerkep);
    const sql = postgres(dbUrl, { max: 2 });
    try {
      const db = await szinkronizal(sql, tetelek);
      console.log(`Keresőindex frissítve: ${tetelek.length} jogszabály, ${db} szakasz.`);
    } finally {
      await sql.end();
    }
  } catch (e) {
    const uzenet = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error(
      `Keresőindex-szinkron HIBA (a delta adata rendben van), kimaradt: ${valtozottSlugok.join(",")}\n${uzenet}`,
    );
    await riaszt(
      "Keresőindex-szinkron hiba",
      `A napi delta adata rendben bekerült a repóba, de a keresőindex frissítése elhasalt.\n\n` +
        `\`\`\`\n${uzenet}\n\`\`\`\n\n` +
        `Kimaradt jogszabályok (a következő futás ezeket NEM pótolja): ${valtozottSlugok.join(", ")}\n\n` +
        `Teendő: a hiba javítása után célzott pótlás:\n` +
        `\`NYILT_DB_URL=... pnpm --filter @gitjog/pipeline kereso-feltoltes -- --slugok=${valtozottSlugok.join(",")}\`\n\n` +
        `Ha a riasztás már nyitva volt, a későbbi napok kimaradt slugjai csak az Actions logban látszanak.`,
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
