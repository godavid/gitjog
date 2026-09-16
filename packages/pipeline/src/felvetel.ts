// Felvételi napló: MIKOR került be egy időállapot a repóba. A commit-dátum a
// hatálybalépés napja (author és committer is), ezért a git-history nem
// mondja meg, hogy egy késve felvett, régi dátumú állapot új-e a repóban.
// A napló a „mi új azóta, hogy utoljára néztem?" kérdés cursora — az API
// `valtozasok` végpontja és a git-natív fogyasztók (`tail -n`) is ezt olvassák.
//
// Havi fájl (a futás UTC-hónapja), soronként egy JSON: kicsi, cache-elhető,
// append-only. Csak a napi delta ír bele; a backfill nem.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ADAT_REPO_DIR, fajlIras } from "./commit.js";

export interface FelvetelTetel {
  slug: string;
  datum: string;
  sha: string;
}

export interface FelvetelSor extends FelvetelTetel {
  /** a delta-futás időbélyege, ISO-8601 UTC, másodpercre */
  felveve: string;
}

export const NAPLO_KONYVTAR = "index/felvetel";

export function naploFajl(futas: Date): string {
  return `${NAPLO_KONYVTAR}/${futas.toISOString().slice(0, 7)}.jsonl`;
}

export function naploSorok(futas: Date, tetelek: FelvetelTetel[]): string {
  const felveve = futas.toISOString().replace(/\.\d{3}Z$/, "Z");
  return tetelek
    .map(({ slug, datum, sha }) => JSON.stringify({ felveve, slug, datum, sha } satisfies FelvetelSor))
    .map((s) => `${s}\n`)
    .join("");
}

/** hozzáfűzés a havi fájlhoz; üres tétellistára nem nyúl a repóhoz */
export async function naploIras(futas: Date, tetelek: FelvetelTetel[]): Promise<void> {
  if (tetelek.length === 0) return;
  const rel = naploFajl(futas);
  let eddigi = "";
  try {
    eddigi = await readFile(join(ADAT_REPO_DIR, rel), "utf8");
  } catch {
    // első bejegyzés a hónapban
  }
  await fajlIras(rel, eddigi + naploSorok(futas, tetelek));
}
