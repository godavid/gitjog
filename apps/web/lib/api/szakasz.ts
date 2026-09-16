// `szakasz`: egy § szövege egy időállapotban (pár KB, nem az egész törvény);
// § nélkül a jogszabály metaadata, időállapotai és tartalomjegyzéke.

import { szakaszKeres, szakaszokraBont } from "@gitjog/szoveg";
import { getAllapotokSlug, getSzoveg, getSzovegAt, type Allapot } from "@/lib/adat";
import {
  ApiHiba,
  DATUM_MINTA,
  jogszabalyMeta,
  jogszabalyUrl,
  jogszabalyVagy404,
  MEGJEGYZES,
  nyersUrl,
  type JogszabalyMeta,
} from "./kozos";

export interface SzakaszParam {
  slug: string;
  horgony?: string;
  paragrafus?: string;
  datum?: string;
}

export interface SzakaszValasz extends JogszabalyMeta {
  /** a kiszolgált időállapot dátuma */
  datum: string;
  sha: string;
  horgony: string;
  szakasz_cim: string;
  szoveg: string;
  nyers_url: string;
  megjegyzes: string;
}

export interface JogszabalyValasz extends JogszabalyMeta {
  datum: string;
  idoallapotok: { datum: string; sha: string }[];
  tartalomjegyzek: { horgony: string; cim: string; hossz: number }[];
  szoveg_url: string;
  megjegyzes: string;
}

/** a `datum`-nál nem későbbi utolsó időállapot; `datum` nélkül a legutolsó */
export function idoallapotValaszt(allapotok: Allapot[], datum?: string): Allapot {
  if (allapotok.length === 0) throw new ApiHiba(404, "A jogszabálynak nincs időállapota");
  if (!datum) return allapotok.at(-1)!;
  if (!DATUM_MINTA.test(datum)) throw new ApiHiba(400, "A `datum` alakja YYYY-MM-DD", "datum");
  const talalt = [...allapotok].reverse().find((a) => a.datum <= datum);
  if (!talalt) {
    throw new ApiHiba(
      404,
      `${datum} napján még nem volt hatályos szöveg (első időállapot: ${allapotok[0]!.datum})`,
      "datum",
    );
  }
  return talalt;
}

export async function szovegIdoallapotban(
  slug: string,
  allapot: Allapot,
  legutolso: boolean,
): Promise<string> {
  // a HEAD-et a napi cache-ből, múltbeli állapotot az immutábilis SHA-ról
  const md = legutolso ? await getSzoveg(slug) : await getSzovegAt(allapot.sha, slug);
  if (md === null) throw new ApiHiba(404, `Nincs szöveg: ${slug} @ ${allapot.datum}`);
  return md;
}

export async function szakaszApi(p: SzakaszParam): Promise<SzakaszValasz | JogszabalyValasz> {
  const tetel = await jogszabalyVagy404(p.slug);
  const allapotok = await getAllapotokSlug(p.slug);
  const allapot = idoallapotValaszt(allapotok, p.datum);
  const legutolso = allapot === allapotok.at(-1);
  const md = await szovegIdoallapotban(p.slug, allapot, legutolso);
  const szakaszok = szakaszokraBont(md);
  const meta = jogszabalyMeta(tetel);

  if (!p.horgony && !p.paragrafus) {
    return {
      ...meta,
      datum: allapot.datum,
      idoallapotok: allapotok.map(({ datum, sha }) => ({ datum, sha })),
      tartalomjegyzek: szakaszok.map((s) => ({ horgony: s.horgony, cim: s.cim, hossz: s.szoveg.length })),
      szoveg_url: nyersUrl(allapot.sha, p.slug),
      megjegyzes: MEGJEGYZES,
    };
  }

  const sz = p.horgony
    ? szakaszok.find((s) => s.horgony === p.horgony)
    : szakaszKeres(szakaszok, p.paragrafus!);
  if (!sz) {
    const mi = p.horgony ? `horgony „${p.horgony}”` : p.paragrafus!;
    throw new ApiHiba(404, `Nincs ${mi} a(z) ${tetel.megjeloles} ${allapot.datum}-i szövegében`);
  }
  return {
    ...meta,
    url: jogszabalyUrl(p.slug, sz.horgony),
    datum: allapot.datum,
    sha: allapot.sha,
    horgony: sz.horgony,
    szakasz_cim: sz.cim,
    szoveg: sz.szoveg,
    nyers_url: nyersUrl(allapot.sha, p.slug),
    megjegyzes: MEGJEGYZES,
  };
}
