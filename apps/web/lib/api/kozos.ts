// Az API szolgáltatásrétegének közös darabjai: hibatípus, korlátok, URL-építők.
// A REST-route-ok és az MCP-toolok ugyanezeket a függvényeket hívják, ezért a
// korlátok és a válaszalak itt dőlnek el, nem a burkolatokban.

import { getJogszabalyok, nyersUrl, type JogszabalyTetel } from "@/lib/adat";
import { OLDAL_URL } from "@/lib/sitemap";

export class ApiHiba extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly mezo?: string,
  ) {
    super(message);
  }
}

/** Token-költség a szűk keresztmetszet: minden válasz korlátos méretű. */
export const KORLAT = {
  keresesAlap: 10,
  keresesMax: 40,
  /** a `kereses` találatában a § szövege ennyi karakterig jön, fölötte csonkolva */
  keresesSzoveg: 4_000,
  valtozasokAlap: 20,
  valtozasokMax: 50,
  /** a `valtozasok` tételében ennyi § fér, a maradék csak számként */
  valtozasSzakasz: 20,
  /** a `valtozasok` §-onkénti régi/új szövege ennyi karakterig */
  valtozasSzoveg: 1_500,
  /** act-szintű találatnál a bevezető részlet hossza */
  bevezeto: 600,
} as const;

export const MEGJEGYZES =
  "Nem hiteles jogforrás — a hiteles szöveg az njt.jog.gov.hu-n és a Magyar Közlönyben van. " +
  "Dátum-érzékeny kérdésnél mindig add meg, melyik időállapotról beszélsz.";

export function jogszabalyUrl(slug: string, horgony = ""): string {
  return `${OLDAL_URL}/jogszabaly/${slug}${horgony ? `#${horgony}` : ""}`;
}

export function diffUrl(slug: string, tol: string, ig: string): string {
  return `${OLDAL_URL}/jogszabaly/${slug}/diff/${tol}/${ig}`;
}

export { nyersUrl };

export function csonkol(szoveg: string, max: number): { szoveg: string; csonkolt: boolean } {
  if (szoveg.length <= max) return { szoveg, csonkolt: false };
  // szóhatáron vágunk, hogy a csonk ne fél szóval végződjön
  const vagas = szoveg.lastIndexOf(" ", max);
  return { szoveg: `${szoveg.slice(0, vagas > max / 2 ? vagas : max)} […]`, csonkolt: true };
}

/** kisbetű, ékezet nélkül, záró pont nélkül — rövidítés- és címillesztéshez */
export function normalizal(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function jogszabalyTerkep(): Promise<Map<string, JogszabalyTetel>> {
  const lista = await getJogszabalyok();
  return new Map(lista.map((t) => [t.slug, t]));
}

export async function jogszabalyVagy404(slug: string): Promise<JogszabalyTetel> {
  const tetel = (await jogszabalyTerkep()).get(slug);
  if (!tetel) throw new ApiHiba(404, `Nincs ilyen jogszabály: ${slug}`, "slug");
  return tetel;
}

export interface JogszabalyMeta {
  slug: string;
  megjeloles: string;
  rovidites: string | null;
  cim: string;
  hatalyos: boolean;
  url: string;
}

export function jogszabalyMeta(t: JogszabalyTetel): JogszabalyMeta {
  return {
    slug: t.slug,
    megjeloles: t.megjeloles,
    rovidites: t.rovidites,
    cim: t.cim,
    hatalyos: t.reteg !== "lezart",
    url: jogszabalyUrl(t.slug),
  };
}

export const DATUM_MINTA = /^\d{4}-\d{2}-\d{2}$/;

/** legfeljebb `n` párhuzamos feldolgozás — a raw GitHub 429-e ellen */
export async function korlatozottParhuzam<T, R>(
  tetelek: T[],
  n: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const eredmeny: R[] = new Array(tetelek.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tetelek.length) }, async () => {
      while (i < tetelek.length) {
        const sajat = i++;
        eredmeny[sajat] = await fn(tetelek[sajat]!);
      }
    }),
  );
  return eredmeny;
}
