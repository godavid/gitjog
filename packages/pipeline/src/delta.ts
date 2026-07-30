// Napi delta: az adat-repo meglévő állapotához képest új, MA már hatályos
// időállapotok letöltése, commitolása és pusholása. Idempotens: ha nincs új
// állapot, nem hoz létre commitot. GitHub Actionsben fut (lásd az adat-repo
// .github/workflows/napi-delta.yml-jét), de lokálisan is futtatható.
//
// Hiba esetén: SEMMIT nem commitol, riaszt (GitHub Issue) és 1-es kóddal lép ki.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JOGSZABALYOK, NJT_BASE } from "./config.js";
import { getIdoallapotok, getTeljesSnapshot, type Idoallapot } from "./crawl.js";
import { markdownGeneralas } from "./normalize.js";
import { parsolSnapshot } from "./parse.js";
import { riaszt, terjedelemEllenorzes } from "./health.js";
import {
  ADAT_REPO_DIR,
  allapotShaTerkep,
  commit,
  fajlIras,
  git,
  metaJson,
  type AllapotBejegyzes,
} from "./commit.js";

const push = !process.argv.includes("--no-push");
const ma = new Date().toISOString().slice(0, 10);

interface UjEsemeny {
  js: (typeof JOGSZABALYOK)[number];
  allapot: Idoallapot;
}

async function fut(): Promise<void> {
  if (!existsSync(join(ADAT_REPO_DIR, "index", "allapotok.json"))) {
    throw new Error(`Nem adat-repo: ${ADAT_REPO_DIR} (hiányzó index/allapotok.json)`);
  }
  const ismertNyers = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "index", "allapotok.json"), "utf8"),
  ) as Record<string, AllapotBejegyzes[]>;

  // 1. friss verziólisták + új állapotok kigyűjtése
  const ujak: UjEsemeny[] = [];
  const ismertTerkep = new Map<string, Set<string>>();
  for (const js of JOGSZABALYOK) {
    const ismertek = new Set((ismertNyers[js.slug] ?? []).map((a) => a.datum));
    ismertTerkep.set(js.slug, ismertek);
    const mind = await getIdoallapotok(js.documentId, { fresh: true });
    for (const a of mind) {
      if (a.hatalyba <= ma && !ismertek.has(a.hatalyba)) ujak.push({ js, allapot: a });
    }
  }
  if (ujak.length === 0) {
    console.log("Nincs új hatályos időállapot — nincs teendő.");
    return;
  }

  // azonos (jogszabály, nap) duplikátumok: a magasabb verzió győz
  const kulcsTerkep = new Map<string, UjEsemeny>();
  for (const u of ujak) {
    const kulcs = `${u.js.slug}|${u.allapot.hatalyba}`;
    const eddigi = kulcsTerkep.get(kulcs);
    if (!eddigi || u.allapot.version > eddigi.allapot.version) kulcsTerkep.set(kulcs, u);
  }
  const esemenyek = [...kulcsTerkep.values()].sort((a, b) =>
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
      if (p.megjeloles.toLowerCase() !== js.megjeloles.toLowerCase()) {
        throw new Error(`Cím-eltérés: ${js.slug} — várt "${js.megjeloles}", kapott "${p.megjeloles}"`);
      }
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
        ...(ismertNyers[js.slug] ?? []),
        { datum: allapot.hatalyba, verzio: allapot.version },
      ].sort((a, b) => (a.datum < b.datum ? -1 : 1));
      ismertNyers[js.slug] = allapotok;
      await fajlIras(`jogszabalyok/${js.slug}/szoveg.md`, md);
      await fajlIras(`jogszabalyok/${js.slug}/meta.json`, metaJson(js, p.cim, allapotok));
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

  // 3. index frissítése (SHA-kkal) külön utócommitban
  const allapotIndex: Record<string, { datum: string; verzio: number; sha: string }[]> = {};
  for (const js of JOGSZABALYOK) {
    const shak = await allapotShaTerkep(js.slug);
    allapotIndex[js.slug] = (ismertNyers[js.slug] ?? [])
      .map((a) => ({ datum: a.datum, verzio: a.verzio, sha: shak.get(a.datum) ?? "" }))
      .filter((a) => a.sha !== "");
  }
  await fajlIras("index/allapotok.json", JSON.stringify(allapotIndex, null, 2) + "\n");
  await commit("Index frissítés (allapotok.json)");

  if (push) {
    await git(["push", "origin", "main"]);
    console.log("Push KÉSZ.");
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
