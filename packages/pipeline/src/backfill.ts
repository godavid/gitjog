// Egyszeri backfill: a teljes MVP-lista összes múltbeli időállapotának
// visszajátszása dátumhelyes commit-streamként az adat-repóba.
// NEM idempotens: üres data/repo könyvtárat vár (szándékosan — a history
// egyszer épül; a napi növekményt a delta.ts kezeli).
//
// Futtatás:  pnpm backfill            # lokális repo-építés
//            pnpm backfill --push     # a végén push is

import { existsSync } from "node:fs";
import { JOGSZABALYOK, NJT_BASE, type Jogszabaly } from "./config.js";
import {
  getIdoallapotok,
  getTeljesSnapshot,
  maiNapBudapest,
  napiGyoztesek,
  type Idoallapot,
} from "./crawl.js";
import { markdownGeneralas } from "./normalize.js";
import { parsolSnapshot } from "./parse.js";
import {
  ADAT_REPO_DIR,
  allapotShaTerkep,
  commit,
  fajlIras,
  git,
  metaJson,
  repoInit,
  type AllapotBejegyzes,
} from "./commit.js";
import { DISCLAIMER_MD, GITATTRIBUTES, LICENSE_TXT, README_MD } from "./sablonok.js";

const push = process.argv.includes("--push");
const ma = maiNapBudapest();

// füstteszthez: NYILT_CSAK="2012-1-00-00,2013-5-00-00" — csak e documentId-k
const csak = process.env.NYILT_CSAK?.split(",").map((s) => s.trim());
const KIVALASZTOTT = csak ? JOGSZABALYOK.filter((j) => csak.includes(j.documentId)) : JOGSZABALYOK;

if (existsSync(ADAT_REPO_DIR)) {
  console.error(`HIBA: ${ADAT_REPO_DIR} már létezik — a backfill üres könyvtárat vár.`);
  process.exit(1);
}

// ── 1. váz ──────────────────────────────────────────────────────────────────
await repoInit();
await fajlIras("README.md", README_MD);
await fajlIras("DISCLAIMER.md", DISCLAIMER_MD);
await fajlIras("LICENSE", LICENSE_TXT);
await fajlIras(".gitattributes", GITATTRIBUTES);
await commit("Adat-repo váz: README, DISCLAIMER, LICENSE");
console.log("Váz commitolva.");

// ── 2. enumerálás ───────────────────────────────────────────────────────────
interface Esemeny {
  js: Jogszabaly;
  allapot: Idoallapot;
}

const esemenyek: Esemeny[] = [];
const osszesMult = new Map<string, AllapotBejegyzes[]>(); // slug → múltbeli állapotok

for (const js of KIVALASZTOTT) {
  const mind = await getIdoallapotok(js.documentId);
  const mult = napiGyoztesek(mind.filter((a) => a.hatalyba <= ma));
  osszesMult.set(
    js.slug,
    mult.map((a) => ({ datum: a.hatalyba, verzio: a.version })),
  );
  for (const allapot of mult) esemenyek.push({ js, allapot });
  console.log(`${js.slug}: ${mult.length} múltbeli állapot (össz: ${mind.length})`);
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
    // validálás: jó jogszabályt, jó időállapotban kaptunk-e
    // (régi törvényeknél a h1 nagybetűs — "1988. évi I. TÖRVÉNY" —, ezért
    // kis-nagybetű-függetlenül hasonlítunk)
    if (p.megjeloles.toLowerCase() !== js.megjeloles.toLowerCase()) {
      throw new Error(`Cím-eltérés: ${js.slug} — várt "${js.megjeloles}", kapott "${p.megjeloles}"`);
    }
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
    cimek.set(js.slug, p.cim);
    const eddigiek = osszesMult.get(js.slug)!.filter((a) => a.datum <= datum);
    await fajlIras(`jogszabalyok/${js.slug}/szoveg.md`, markdownGeneralas(p));
    await fajlIras(`jogszabalyok/${js.slug}/meta.json`, metaJson(js, p.cim, eddigiek));
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
  await commit(uzenet.length > 60_000 ? cim : uzenet, datum);
  console.log(`[${kesz}/${esemenyek.length}] ${datum}: ${nevek.join(", ")}`);
}

// ── 4. index-utócommit ──────────────────────────────────────────────────────
const lista = KIVALASZTOTT.map((js) => ({
  slug: js.slug,
  documentId: js.documentId,
  megjeloles: js.megjeloles,
  cim: cimek.get(js.slug) ?? js.cim,
  rovidites: js.rovidites ?? null,
}));
await fajlIras("index/jogszabalyok.json", JSON.stringify(lista, null, 2) + "\n");

const allapotIndex: Record<string, { datum: string; verzio: number; sha: string }[]> = {};
for (const js of KIVALASZTOTT) {
  const shak = await allapotShaTerkep(js.slug);
  allapotIndex[js.slug] = osszesMult
    .get(js.slug)!
    .map((a) => ({ ...a, sha: shak.get(a.datum) ?? "" }))
    .filter((a) => a.sha !== "");
}
await fajlIras("index/allapotok.json", JSON.stringify(allapotIndex, null, 2) + "\n");
await commit("Index frissítés (jogszabalyok.json, allapotok.json)");
console.log("Index commitolva.");

if (ismeretlenOsztalyNaplo.size > 0) {
  console.log("\nFIGYELEM — ismeretlen osztályok (bekezdés-fallbackkel renderelve):");
  for (const [o, hol] of [...ismeretlenOsztalyNaplo.entries()].sort()) {
    console.log(`  ${o}  ←  ${hol.join(", ")}`);
  }
}

const commitDb = (await git(["rev-list", "--count", "HEAD"])).trim();
console.log(`Backfill KÉSZ: ${commitDb} commit, ${kesz} időállapot.`);

if (push) {
  await git(["push", "-u", "origin", "main"]);
  console.log("Push KÉSZ → origin/main");
}
