// Konzisztencia-ellenőrző: összeveti az adat-repo index-fájljait
// (index/jogszabalyok.json, index/allapotok.json) a per-jogszabály fájlokkal
// (jogszabalyok/<slug>/meta.json, allapotok.json), és jelenti az eltéréseket.
// Csak olvas: nem ír fájlt, nem hív gitet, nem megy hálózatra.
// Futtatás: pnpm index-ellenorzes
//   (vagy: NYILT_ADAT_REPO_DIR=<adat-repo> pnpm exec tsx src/index-ellenorzes.ts)

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { ADAT_REPO_DIR } from "./commit.js";

/** egy sor az index/jogszabalyok.json tömbből */
interface IndexJogszabaly {
  slug: string;
  documentId: string;
  megjeloles: string;
  cim: string;
  rovidites: string | null;
}

/** egy állapot-bejegyzés az index/allapotok.json-ban és a per-jogszabály fájlban */
interface AllapotBejegyzes {
  datum: string;
  verzio: number;
  sha?: string;
}

/** a per-jogszabály meta.json szerkezete */
interface MetaJson {
  documentId: string;
  megjeloles: string;
  cim: string;
  rovidites: string | null;
  slug: string;
  forras: string;
  megjegyzes: string;
  allapotok: { datum: string; verzio: number }[];
}

/** egy jelentett eltérés: slug + rövid magyar indoklás */
interface Elteres {
  slug: string;
  indoklas: string;
}

const MAX_PELDA = 20;
const MAX_HIANYZO_DATUM = 5;

async function jsonOlvas<T>(ut: string): Promise<T> {
  return JSON.parse(await readFile(ut, "utf8")) as T;
}

/** datum+verzio+sha hármasok sorrendhelyes összehasonlításához rendezett másolat */
function rendezett(allapotok: AllapotBejegyzes[]): AllapotBejegyzes[] {
  return [...allapotok].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      a.verzio - b.verzio ||
      (a.sha ?? "").localeCompare(b.sha ?? ""),
  );
}

function azonosLista(a: AllapotBejegyzes[], b: AllapotBejegyzes[]): boolean {
  const ra = rendezett(a);
  const rb = rendezett(b);
  if (ra.length !== rb.length) return false;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i]!;
    const y = rb[i]!;
    if (x.datum !== y.datum || x.verzio !== y.verzio || (x.sha ?? "") !== (y.sha ?? "")) {
      return false;
    }
  }
  return true;
}

const indexJogszabalyok = await jsonOlvas<IndexJogszabaly[]>(
  join(ADAT_REPO_DIR, "index", "jogszabalyok.json"),
);
const indexAllapotok = await jsonOlvas<Record<string, AllapotBejegyzes[]>>(
  join(ADAT_REPO_DIR, "index", "allapotok.json"),
);
const indexSlugok = new Set(indexJogszabalyok.map((j) => j.slug));

const alkonyvtarak = await readdir(join(ADAT_REPO_DIR, "jogszabalyok"), { withFileTypes: true });
const slugok = alkonyvtarak.filter((e) => e.isDirectory()).map((e) => e.name);

const hianyzoIndex: Elteres[] = [];
const hianyzoAllapot: Elteres[] = [];
const uresSha: Elteres[] = [];
const elteroFajl: Elteres[] = [];
const olvashatatlan: Elteres[] = [];

for (const slug of slugok) {
  let meta: MetaJson;
  try {
    meta = await jsonOlvas<MetaJson>(join(ADAT_REPO_DIR, "jogszabalyok", slug, "meta.json"));
  } catch {
    olvashatatlan.push({ slug, indoklas: "hiányzó vagy JSON-hibás meta.json" });
    continue;
  }

  const indexBejegyzes = indexAllapotok[slug];

  // hianyzo-index: nincs a jogszabály-indexben vagy az állapot-indexben
  if (!indexSlugok.has(slug) || indexBejegyzes === undefined) {
    const okok: string[] = [];
    if (!indexSlugok.has(slug)) okok.push("nincs a jogszabalyok.json-ban");
    if (indexBejegyzes === undefined) okok.push("nincs kulcs az allapotok.json-ban");
    hianyzoIndex.push({ slug, indoklas: okok.join(", ") });
  }

  if (indexBejegyzes !== undefined) {
    // hianyzo-allapot: a meta.json dátumai közül hiányzik az indexből
    const indexDatumok = new Set(indexBejegyzes.map((a) => a.datum));
    const hianyzok = meta.allapotok.map((a) => a.datum).filter((d) => !indexDatumok.has(d));
    if (hianyzok.length > 0) {
      hianyzoAllapot.push({
        slug,
        indoklas: `${hianyzok.length} hiányzó: ${hianyzok.slice(0, MAX_HIANYZO_DATUM).join(", ")}`,
      });
    }

    // ures-sha: üres vagy hiányzó sha az indexben
    const rosszak = indexBejegyzes.filter((a) => a.sha === undefined || a.sha === "");
    if (rosszak.length > 0) {
      uresSha.push({ slug, indoklas: `${rosszak.length} bejegyzésnek üres a sha-ja` });
    }
  }

  // elteres-per-torveny: a per-jogszabály állapotfájl vs. az index-szelet
  let fajlAllapotok: AllapotBejegyzes[] | null = null;
  try {
    fajlAllapotok = await jsonOlvas<AllapotBejegyzes[]>(
      join(ADAT_REPO_DIR, "jogszabalyok", slug, "allapotok.json"),
    );
  } catch {
    fajlAllapotok = null; // hiányzó vagy JSON-hibás fájl
  }
  if (fajlAllapotok === null) {
    if (indexBejegyzes !== undefined) {
      elteroFajl.push({ slug, indoklas: "hiányzó vagy olvashatatlan allapotok.json" });
    }
    // ha az index-bejegyzés sem létezik, az nem hiba
  } else if (indexBejegyzes === undefined) {
    elteroFajl.push({ slug, indoklas: "van állapotfájl, de nincs index-bejegyzés" });
  } else if (!azonosLista(fajlAllapotok, indexBejegyzes)) {
    elteroFajl.push({
      slug,
      indoklas:
        fajlAllapotok.length !== indexBejegyzes.length
          ? `a fájl ${fajlAllapotok.length} állapotot tartalmaz, az index ${indexBejegyzes.length}-et`
          : `azonos darabszám (${fajlAllapotok.length}), de eltérő dátum/verzió/SHA`,
    });
  }
}

const kategoriak: [string, Elteres[]][] = [
  ["hiányzó index-bejegyzés", hianyzoIndex],
  ["hiányzó állapot az indexből", hianyzoAllapot],
  ["üres SHA", uresSha],
  ["eltérő per-törvény állapotfájl", elteroFajl],
  ["olvashatatlan meta.json", olvashatatlan],
];

console.log(`Ellenőrzött jogszabály: ${slugok.length}`);
for (const [nev, lista] of kategoriak) {
  console.log(`  ${nev}: ${lista.length}`);
}
for (const [nev, lista] of kategoriak) {
  if (lista.length === 0) continue;
  console.log();
  console.log(`${nev} (első ${MAX_PELDA}):`);
  for (const e of lista.slice(0, MAX_PELDA)) {
    console.log(`  ${e.slug} — ${e.indoklas}`);
  }
}

const osszesElteres = kategoriak.reduce((n, [, lista]) => n + lista.length, 0);
console.log();
if (osszesElteres > 0) {
  console.log(
    `HIBA: ${osszesElteres} eltérés — az index újraépítése kell (pnpm exec tsx src/index-ujraepites.ts).`,
  );
  process.exitCode = 1;
} else {
  console.log("RENDBEN: az index konzisztens.");
}
