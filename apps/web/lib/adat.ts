// Adatréteg: a magyar-jogtar adat-repo tartalma raw.githubusercontent.com-ról.
// A HEAD-re mutató kérések naponta revalidálódnak (ISR), a commit-SHA-s
// kérések változhatatlanok, ezért örökre cache-elhetők.

import { unstable_cache } from "next/cache";

export const ADAT_REPO = "godavid/magyar-jogtar";
const RAW = `https://raw.githubusercontent.com/${ADAT_REPO}`;

// A tartalom naponta egyszer frissül (napi delta workflow), ezért ennél
// sűrűbb revalidálás csak fölösleges kimenő kérés a GitHub felé. Ez a szám
// minden route cache-ablakát meghatározza, mert mindegyik ezen a fetch-en át
// éri el az adatot.
const REVALIDATE = 21_600; // 6 óra

/**
 * Az `unstable_cache` bejegyzései átélik a deployokat: ha a belőlük épített adat
 * SZERKEZETE változik (más mezők, más URL-halmaz), a régi eredmény a revalidate
 * ablak végéig kiszolgálódik — a friss kód ellenére. Ilyenkor ezt kell léptetni.
 */
export const CACHE_VERZIO = "3";

export interface JogszabalyTetel {
  slug: string;
  documentId: string;
  megjeloles: string;
  cim: string;
  rovidites: string | null;
}

export interface Allapot {
  datum: string; // YYYY-MM-DD
  verzio: number;
  sha: string; // az adott állapotot rögzítő commit
}

const varj = (ms: number) => new Promise((kesz) => setTimeout(kesz, ms));

/**
 * - `napi`: a HEAD-re mutató, revalidálódó kérések.
 * - `orokre`: commit-SHA-ra pinnelt, megváltoztathatatlan tartalom.
 * - `friss`: a Next adat-cache teljes kikerülése. A 2 MB fölötti válaszokat a
 *   cache nem tudja eltárolni, viszont egy korábbi, még beférő válasz ott
 *   ragadhat és stale-ként visszajönne — ez élesben hetekig régi adatot
 *   szolgálna ki. Az ilyen fájlokat ezért mindig frissen kérjük le, és az
 *   eredményt a hívó oldalán `unstable_cache` tartja el (kis méretben).
 */
type Mod = "napi" | "orokre" | "friss";

/**
 * A `null` kizárólag azt jelenti, hogy a fájl nem létezik (HTTP 404) — a hívók
 * ebből `notFound()`-ot csinálnak. Átmeneti hibánál (429 rate limit, 5xx) ezért
 * NEM adhatunk `null`-t: a kereső a 404-et véglegesnek veszi és kiindexeli az
 * oldalt, míg a dobott hiba (500) csak annyit üzen neki, hogy jöjjön vissza.
 * Egy crawl-hullám alatt ez a különbség dönti el, megmarad-e az indexeltség.
 */
async function rawFetch(utvonal: string, mod: Mod = "napi"): Promise<string | null> {
  const url = `${RAW}/${utvonal}`;
  for (let probalkozas = 0; ; probalkozas++) {
    const valasz = await fetch(
      url,
      mod === "friss"
        ? { cache: "no-store" }
        : { next: { revalidate: mod === "orokre" ? false : REVALIDATE } },
    );
    if (valasz.status === 404) return null;
    if (valasz.ok) return valasz.text();

    const atmeneti = valasz.status === 429 || valasz.status >= 500;
    if (atmeneti && probalkozas < 2) {
      await varj(500 * 2 ** probalkozas);
      continue;
    }
    throw new Error(`Adat-repo fetch hiba: HTTP ${valasz.status} — ${utvonal}`);
  }
}

/** a kihirdetés éve a documentId-ből („2013-5-00-00" → 2013) */
export function evOf(j: JogszabalyTetel): number {
  return Number(j.documentId.slice(0, 4));
}

export async function getJogszabalyok(): Promise<JogszabalyTetel[]> {
  const nyers = await rawFetch("main/index/jogszabalyok.json");
  if (!nyers) throw new Error("Hiányzó index/jogszabalyok.json az adat-repóban");
  return JSON.parse(nyers) as JogszabalyTetel[];
}

/**
 * A teljes időállapot-térkép (~4,4 MB). Nem fér a Next adat-cache-ébe, ezért
 * mindig frissen jön — csak `unstable_cache`-elt függvényből hívd, hogy az
 * eredmény kis méretben mégis eltárolható legyen.
 */
export async function getAllapotok(): Promise<Record<string, Allapot[]>> {
  const nyers = await rawFetch("main/index/allapotok.json", "friss");
  if (!nyers) throw new Error("Hiányzó index/allapotok.json az adat-repóban");
  return JSON.parse(nyers) as Record<string, Allapot[]>;
}

export interface ValtozasTetel {
  tetel: JogszabalyTetel;
  datum: string;
  /** az előző időállapot dátuma; `null`, ha ez a jogszabály hatálybalépése */
  elozoDatum: string | null;
}

/**
 * A legutóbb hatályba lépett módosítások, dátum szerint csökkenően.
 * Az állapot-térkép ~27 000 bejegyzését futtatja végig, majd a rövid eredményt
 * `unstable_cache` tartja el: a nagy forrásfájl így nem terheli a cache-t, a
 * hívó oldal viszont statikusan prerenderelhető marad.
 */
export async function legutobbiValtozasokFrissen(limit: number): Promise<ValtozasTetel[]> {
  const [jogszabalyok, allapotok] = await Promise.all([getJogszabalyok(), getAllapotok()]);
  const nevek = new Map(jogszabalyok.map((j) => [j.slug, j]));

  const sorok: ValtozasTetel[] = [];
  for (const [slug, sajat] of Object.entries(allapotok)) {
    const tetel = nevek.get(slug);
    if (!tetel) continue;
    for (let i = 0; i < sajat.length; i++) {
      sorok.push({
        tetel,
        datum: sajat[i]!.datum,
        elozoDatum: i > 0 ? sajat[i - 1]!.datum : null,
      });
    }
  }
  sorok.sort((a, b) => b.datum.localeCompare(a.datum));
  return sorok.slice(0, limit);
}

export const getLegutobbiValtozasok = unstable_cache(
  legutobbiValtozasokFrissen,
  ["legutobbi-valtozasok", CACHE_VERZIO],
  { revalidate: REVALIDATE },
);

/**
 * Az egész korpusz havi bontása, kompakt alakban (~0,9 MB): a slugra indexszel
 * hivatkozunk, nem a ~40 karakteres szöveggel. A nyers állapot-térkép 4,4 MB, ami
 * NEM fér a Next adat-cache 2 MB-os korlátjába — ez a származtatott alak viszont
 * igen, így mind a ~400 havi oldal EGYETLEN cache-bejegyzésből dolgozik, és a nagy
 * fájl a revalidate-ablakonként csak egyszer jön le.
 *
 * Ha ez az alak valaha a 2 MB fölé nőne, a régi hónapokat kell kihagyni belőle
 * (a kereslet úgyis a friss hónapokra esik) — nem a `revalidate`-et emelni.
 */
export interface HaviBontas {
  slugok: string[];
  /** hónapkulcs („2026-07") → [slug indexe, dátum, előző időállapot dátuma] */
  honapok: Record<string, [number, string, string | null][]>;
}

export const getHaviBontas = unstable_cache(
  async (): Promise<HaviBontas> => {
    const allapotok = await getAllapotok();
    const slugok = Object.keys(allapotok).sort();
    const helye = new Map(slugok.map((s, i) => [s, i]));
    const honapok: HaviBontas["honapok"] = {};
    for (const [slug, sajat] of Object.entries(allapotok)) {
      const i = helye.get(slug)!;
      for (let n = 0; n < sajat.length; n++) {
        const datum = sajat[n]!.datum;
        const kulcs = datum.slice(0, 7);
        (honapok[kulcs] ??= []).push([i, datum, n > 0 ? sajat[n - 1]!.datum : null]);
      }
    }
    return { slugok, honapok };
  },
  ["havi-bontas", CACHE_VERZIO],
  { revalidate: REVALIDATE },
);

/** Darabszámok az /adatok oldalhoz — a nagy állapot-térképből, kis eredménnyel. */
export const getAllomanyStatisztika = unstable_cache(
  async (): Promise<{ jogszabalySzam: number; allapotSzam: number }> => {
    const [jogszabalyok, allapotok] = await Promise.all([getJogszabalyok(), getAllapotok()]);
    return {
      jogszabalySzam: jogszabalyok.length,
      allapotSzam: Object.values(allapotok).reduce((n, a) => n + a.length, 0),
    };
  },
  ["allomany-statisztika", CACHE_VERZIO],
  { revalidate: REVALIDATE },
);

/** egy jogszabály állapotlistája a kis per-törvény fájlból */
export async function getAllapotokSlug(slug: string): Promise<Allapot[]> {
  const nyers = await rawFetch(`main/jogszabalyok/${slug}/allapotok.json`);
  if (!nyers) return [];
  return JSON.parse(nyers) as Allapot[];
}

export async function getSzoveg(slug: string): Promise<string | null> {
  return rawFetch(`main/jogszabalyok/${slug}/szoveg.md`);
}

/** egy múltbeli időállapot szövege az azt rögzítő commit SHA-jánál (immutábilis) */
export async function getSzovegAt(sha: string, slug: string): Promise<string | null> {
  return rawFetch(`${sha}/jogszabalyok/${slug}/szoveg.md`, "orokre");
}

export function nyersUrl(sha: string, slug: string): string {
  return `${RAW}/${sha}/jogszabalyok/${slug}/szoveg.md`;
}
