// Backfill: jogszabályok múltbeli időállapotainak visszajátszása dátumhelyes
// commit-streamként az adat-repóba.
//
// Két mód:
//   pnpm backfill                  # friss építés: ÜRES data/repo-t vár (MVP-mód)
//   pnpm backfill -- --folytat     # append: meglévő repóban a MÉG HIÁNYZÓ
//                                  # jogszabályokat dolgozza fel, kötegenként pushol
//   (+ --push: normál módban a végén pushol; --folytat mindig pushol kötegenként)
//
// Az append-mód nem ír át historyt: az új (visszadátumozott) commitok a meglévő
// history végére fűződnek — a GitHub committer-dátum szerint rendez, a
// `git log --since/--until` pedig dátumra szűr, így mindkettő jól viselkedik.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JOGSZABALYOK, NJT_BASE, teljesJogszabalyLista, type Jogszabaly } from "./config.js";
import {
  getIdoallapotok,
  getTeljesSnapshot,
  maiNapBudapest,
  napiGyoztesek,
  type Idoallapot,
} from "./crawl.js";
import { markdownGeneralas } from "./normalize.js";
import { megjelolesIllesztes, parsolSnapshot } from "./parse.js";
import {
  ADAT_REPO_DIR,
  commit,
  fajlIras,
  git,
  indexEpites,
  metaJson,
  repoInit,
  type AllapotBejegyzes,
} from "./commit.js";
import { DISCLAIMER_MD, GITATTRIBUTES, LICENSE_TXT, README_MD } from "./sablonok.js";

const push = process.argv.includes("--push");
const folytat = process.argv.includes("--folytat");
const ma = maiNapBudapest();
/** ennyi feldolgozott jogszabályonként közbenső push (append-módban) */
const KOTEG_MERET = 500;

const teljesLista = await teljesJogszabalyLista();

// füstteszthez: NYILT_CSAK="2012-1-00-00,2013-5-00-00" — csak e documentId-k
const csak = process.env.NYILT_CSAK?.split(",").map((s) => s.trim());
let KIVALASZTOTT = csak ? teljesLista.filter((j) => csak.includes(j.documentId)) : teljesLista;

if (folytat) {
  // append-mód: meglévő repo, csak az indexben MÉG NEM szereplő jogszabályok
  const indexUt = join(ADAT_REPO_DIR, "index", "allapotok.json");
  if (!existsSync(indexUt)) {
    console.error(`HIBA: --folytat módhoz meglévő adat-repo kell (${indexUt} hiányzik).`);
    process.exit(1);
  }
  // megszakadt futás fél kész, commitolatlan fájljai nem szivâroghatnak be egy
  // korábbi dátumú commitba — tiszta worktree-ről indulunk (a determinisztikus
  // kimenet miatt minden a saját napjánál újraíródik)
  await git(["checkout", "--", "."]);
  await git(["clean", "-fdq"]);
  const ismertek = new Set(Object.keys(JSON.parse(await readFile(indexUt, "utf8"))));
  KIVALASZTOTT = KIVALASZTOTT.filter((j) => !ismertek.has(j.slug));
  console.log(`Append-mód: ${ismertek.size} jogszabály már a repóban, ${KIVALASZTOTT.length} új jön.`);
} else {
  if (existsSync(ADAT_REPO_DIR)) {
    console.error(`HIBA: ${ADAT_REPO_DIR} már létezik — friss építéshez üres könyvtár kell (vagy --folytat).`);
    process.exit(1);
  }
  // ── 1. váz ────────────────────────────────────────────────────────────────
  await repoInit();
  await fajlIras("README.md", README_MD);
  await fajlIras("DISCLAIMER.md", DISCLAIMER_MD);
  await fajlIras("LICENSE", LICENSE_TXT);
  await fajlIras(".gitattributes", GITATTRIBUTES);
  await commit("Adat-repo váz: README, DISCLAIMER, LICENSE");
  console.log("Váz commitolva.");
}

// ── 2. enumerálás ───────────────────────────────────────────────────────────
interface Esemeny {
  js: Jogszabaly;
  allapot: Idoallapot;
}

const esemenyek: Esemeny[] = [];
const osszesMult = new Map<string, AllapotBejegyzes[]>(); // slug → múltbeli állapotok
const kihagyottak: { documentId: string; slug: string; ok: string }[] = [];

let enumSzam = 0;
for (const js of KIVALASZTOTT) {
  enumSzam++;
  let mind;
  try {
    mind = await getIdoallapotok(js.documentId);
  } catch (e) {
    // üres verziólista = nincs konszolidált szöveg az njt-n → listázva kihagyjuk
    kihagyottak.push({ documentId: js.documentId, slug: js.slug, ok: String(e instanceof Error ? e.message : e) });
    continue;
  }
  const mult = napiGyoztesek(mind.filter((a) => a.hatalyba <= ma));
  if (mult.length === 0) {
    kihagyottak.push({ documentId: js.documentId, slug: js.slug, ok: "csak jövőbeli állapotok" });
    continue;
  }
  osszesMult.set(
    js.slug,
    mult.map((a) => ({ datum: a.hatalyba, verzio: a.version })),
  );
  for (const allapot of mult) esemenyek.push({ js, allapot });
  console.log(`[enum ${enumSzam}/${KIVALASZTOTT.length}] ${js.slug}: ${mult.length} múltbeli állapot (össz: ${mind.length})`);
}
console.log(`Kihagyva (nincs szöveg): ${kihagyottak.length}`);

if (folytat && esemenyek.length === 0) {
  console.log("Append-mód: nincs új feldolgozandó jogszabály — nincs teendő.");
  process.exit(0);
}

esemenyek.sort((a, b) =>
  a.allapot.hatalyba < b.allapot.hatalyba
    ? -1
    : a.allapot.hatalyba > b.allapot.hatalyba
      ? 1
      : a.js.slug.localeCompare(b.js.slug),
);
console.log(`Összesen ${esemenyek.length} esemény, ${new Set(esemenyek.map((e) => e.allapot.hatalyba)).size} commit-nap.`);

// ── 3. visszajátszás dátum szerint ──────────────────────────────────────────
const cimek = new Map<string, string>(); // slug → oldalról olvasott cím
const ismeretlenOsztalyNaplo = new Map<string, string[]>();
let kesz = 0;
let commitSzamlalo = 0;
let utolsoPushnal = 0;

let i = 0;
while (i < esemenyek.length) {
  const datum = esemenyek[i]!.allapot.hatalyba;
  const napiak: Esemeny[] = [];
  while (i < esemenyek.length && esemenyek[i]!.allapot.hatalyba === datum) {
    napiak.push(esemenyek[i]!);
    i++;
  }

  const uzenetSorok: string[] = [];
  for (const { js, allapot } of napiak) {
    const s = await getTeljesSnapshot(js.documentId, allapot.version);
    const p = parsolSnapshot(s, js.documentId);
    // validálás: jó jogszabályt, jó időállapotban kaptunk-e (kis-nagybetű-független,
    // a régi "törvénycikk"/"törvény-czikk" végződést is elfogadva; a legrégebbi
    // törvényeknél a h1 hordozza a címet is — azt címként hasznosítjuk
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
    // Ismeretlen osztály a backfillben nem végzetes: bekezdés-fallbackkel
    // renderelődik, a futás végén összesített figyelmeztetést kapunk.
    // (A napi delta ezzel szemben szigorú — ott riasztás megy.)
    for (const o of p.ismeretlenOsztalyok) {
      const hol = ismeretlenOsztalyNaplo.get(o) ?? [];
      if (hol.length < 5) hol.push(`${js.slug}@v${allapot.version}`);
      ismeretlenOsztalyNaplo.set(o, hol);
    }
    cimek.set(js.slug, cim);
    const eddigiek = osszesMult.get(js.slug)!.filter((a) => a.datum <= datum);
    await fajlIras(`jogszabalyok/${js.slug}/szoveg.md`, markdownGeneralas(p));
    await fajlIras(`jogszabalyok/${js.slug}/meta.json`, metaJson(js, cim, eddigiek));
    uzenetSorok.push(
      `${js.rovidites ?? js.megjeloles}: ${NJT_BASE}/jogszabaly/${js.documentId}.${allapot.version}`,
    );
    kesz++;
  }

  const nevek = napiak.map((n) => n.js.rovidites ?? n.js.megjeloles);
  const cim =
    nevek.length === 1
      ? `${nevek[0]} — időállapot ${datum}`
      : `Időállapotok ${datum}: ${nevek.join(", ")}`;
  const uzenet = `${cim}\n\nForrás (njt):\n${uzenetSorok.map((s) => `- ${s}`).join("\n")}`;
  const commitolt = await commit(uzenet.length > 60_000 ? cim : uzenet, datum);
  if (commitolt) commitSzamlalo++;
  console.log(
    `[${kesz}/${esemenyek.length}] ${datum}: ${nevek.length > 8 ? `${nevek.length} jogszabály` : nevek.join(", ")}${commitolt ? "" : " (már megvolt)"}`,
  );

  // append-módban kötegenként pusholunk (2 GB push-limit + megszakíthatóság)
  if (folytat && commitSzamlalo - utolsoPushnal >= KOTEG_MERET) {
    await git(["push", "origin", "main"]);
    utolsoPushnal = commitSzamlalo;
    console.log(`— közbenső push (${commitSzamlalo} commit) —`);
  }
}

// ── 4. index-utócommit (a teljes állományra, meta.json-okból — idempotens) ──
await indexEpites(teljesLista);
if (kihagyottak.length > 0) {
  let regiek: typeof kihagyottak = [];
  try {
    regiek = JSON.parse(await readFile(join(ADAT_REPO_DIR, "index", "kihagyottak.json"), "utf8"));
  } catch {}
  const terkep = new Map([...regiek, ...kihagyottak].map((k) => [k.documentId, k]));
  const osszes = [...terkep.values()].sort((a, b) => a.documentId.localeCompare(b.documentId));
  await fajlIras("index/kihagyottak.json", JSON.stringify(osszes, null, 2) + "\n");
}
await commit("Index frissítés (jogszabalyok.json, allapotok.json, per-jogszabály állapotfájlok)");
console.log("Index commitolva.");

if (ismeretlenOsztalyNaplo.size > 0) {
  console.log("\nFIGYELEM — ismeretlen osztályok (bekezdés-fallbackkel renderelve):");
  for (const [o, hol] of [...ismeretlenOsztalyNaplo.entries()].sort()) {
    console.log(`  ${o}  ←  ${hol.join(", ")}`);
  }
}

const commitDb = (await git(["rev-list", "--count", "HEAD"])).trim();
console.log(`Backfill KÉSZ: ${commitDb} commit, ${kesz} időállapot, ${kihagyottak.length} kihagyva.`);

if (push || folytat) {
  await git(["push", "-u", "origin", "main"]);
  console.log("Push KÉSZ → origin/main");
}
