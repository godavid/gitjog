// A `valtozasok` napló-ágának veszteségmentes keyset-cursora (#26).
//
// A régi cursor csak a `felveve` időbélyeg volt: a lap a legújabb N sort
// tartalmazta, a cursor a lap maximumára ugrott, és minden régebbi sor
// elveszett (2026-10-21: 221 sorból 171). Az új cursor a lap UTOLSÓ sorának
// hármasa: `<felveve ISO-8601 UTC másodpercre>_<slug>_<datum>`, pl.
// `2026-10-06T17:43:08Z_2013-evi-v-torveny-ptk_2026-10-01`. A kliens
// átlátszatlan szövegként tárolja és változtatás nélkül adja vissza. A puszta
// ISO-időbélyeg továbbra is érvényes bemenet: „szigorúan ez után a felveve után".
//
// A modul import nélküli, hogy a `node --test lib/api/kurzor.test.ts`
// közvetlenül futtathassa (ezért a regexek is itt élnek).

export interface Kurzor {
  /** a bemenet változtatás nélkül: üres lapon ezt adjuk vissza */
  nyers: string;
  /** `YYYY-MM-DDTHH:MM:SSZ` */
  felveve: string;
  slug?: string;
  datum?: string;
}

export interface KurzorSor {
  felveve: string;
  slug: string;
  datum: string;
}

const SLUG = /^[a-z0-9-]+$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function isoMasodperc(s: string): string | null {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Cursor-szöveg → kulcs; `null`, ha alakilag rossz. */
export function kurzorParse(s: string): Kurzor | null {
  const reszek = s.split("_");
  if (reszek.length === 1) {
    const felveve = isoMasodperc(s);
    return felveve ? { nyers: s, felveve } : null;
  }
  if (reszek.length !== 3) return null;
  const [iso, slug, datum] = reszek as [string, string, string];
  const felveve = isoMasodperc(iso);
  if (!felveve || !SLUG.test(slug) || !DATUM.test(datum)) return null;
  return { nyers: s, felveve, slug, datum };
}

export function kurzorKiir(sor: KurzorSor): string {
  return `${sor.felveve}_${sor.slug}_${sor.datum}`;
}

function hasonlit(a: KurzorSor, b: KurzorSor): number {
  const kulcsok = ["felveve", "slug", "datum"] as const;
  for (const kulcs of kulcsok) {
    if (a[kulcs] < b[kulcs]) return -1;
    if (a[kulcs] > b[kulcs]) return 1;
  }
  return 0;
}

/** Szigorúan a cursor után van-e a sor (puszta időbélyegnél csak a felveve számít). */
function kurzorUtan(sor: KurzorSor, k: Kurzor): boolean {
  if (k.slug === undefined || k.datum === undefined) return sor.felveve > k.felveve;
  return hasonlit(sor, { felveve: k.felveve, slug: k.slug, datum: k.datum }) > 0;
}

/**
 * A cursor utáni legrégebbi `darab` sor (felveve, slug, datum) szerint
 * növekvően; `kovetkezo` az utolsó sor cursora, üres lapon a bemenet.
 */
export function lapoz<T extends KurzorSor>(sorok: T[], kurzor: Kurzor, darab: number): { lap: T[]; kovetkezo: string } {
  const lap = sorok
    .filter((s) => kurzorUtan(s, kurzor))
    .sort(hasonlit)
    .slice(0, darab);
  const utolso = lap[lap.length - 1];
  return { lap, kovetkezo: utolso ? kurzorKiir(utolso) : kurzor.nyers };
}

/**
 * A felvételi napló első hónapja (`index/felvetel/2026-09.jsonl`): régebbi
 * hónaphoz nincs napló (a backfill nem ír naplót), ezért a hónaplista innen
 * indul, hiába régebbi a cursor (#39).
 */
export const NAPLO_KEZDET = "2026-09";

/**
 * UTC-hónapkulcsok (`ÉÉÉÉ-HH`) a `tol` (ISO-időbélyeg vagy hónapkulcs) hónapjától,
 * de legkorábban a `NAPLO_KEZDET`-től, a `most` UTC-hónapjáig. Jövőbeli cursornál
 * üres a lista (nincs mit lapozni, a cursor változatlan marad).
 */
export function honapok(tol: string, most: Date = new Date()): string[] {
  const [tolEv, tolHo] = tol.slice(0, 7).split("-").map(Number) as [number, number];
  const [kezdEv, kezdHo] = NAPLO_KEZDET.split("-").map(Number) as [number, number];
  const tolHonap = tolEv * 12 + tolHo;
  const kezdHonap = kezdEv * 12 + kezdHo;
  let honap = Math.max(tolHonap, kezdHonap);
  const veg = most.getUTCFullYear() * 12 + most.getUTCMonth() + 1;
  const lista: string[] = [];
  // a felső korlát védőháló: a naplóval rendelkező idő így is jóval rövidebb
  while (honap <= veg && lista.length < 240) {
    const ev = Math.floor((honap - 1) / 12);
    const ho = ((honap - 1) % 12) + 1;
    lista.push(`${ev}-${String(ho).padStart(2, "0")}`);
    honap++;
  }
  return lista;
}
