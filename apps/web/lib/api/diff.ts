// `diff`: két időállapot §-szintű összevetése, teljes szövegekkel — a
// `valtozasok` csonkolt tételei mögötti drill-down.

import {
  szakaszDiff,
  szakaszDiffOsszegzes,
  type SzakaszDiffOsszegzes,
  type SzakaszValtozas,
} from "@gitjog/szoveg";
import { getAllapotokSlug, getSzovegAt } from "@/lib/adat";
import { ApiHiba, DATUM_MINTA, diffUrl, jogszabalyMeta, jogszabalyVagy404, MEGJEGYZES } from "./kozos";

export interface DiffParam {
  slug: string;
  tol: string;
  ig: string;
  horgony?: string;
}

export interface DiffValasz {
  slug: string;
  megjeloles: string;
  rovidites: string | null;
  cim: string;
  tol: string;
  ig: string;
  tol_sha: string;
  ig_sha: string;
  osszegzes: SzakaszDiffOsszegzes;
  szakaszok: SzakaszValtozas[];
  url: string;
  megjegyzes: string;
}

export async function diffApi(p: DiffParam): Promise<DiffValasz> {
  for (const [mezo, ertek] of [
    ["tol", p.tol],
    ["ig", p.ig],
  ] as const) {
    if (!DATUM_MINTA.test(ertek)) throw new ApiHiba(400, `A \`${mezo}\` alakja YYYY-MM-DD`, mezo);
  }
  if (p.tol >= p.ig) throw new ApiHiba(400, "A `tol` legyen korábbi az `ig`-nél", "tol");

  const tetel = await jogszabalyVagy404(p.slug);
  const allapotok = await getAllapotokSlug(p.slug);
  const tol = allapotok.find((a) => a.datum === p.tol);
  const ig = allapotok.find((a) => a.datum === p.ig);
  if (!tol || !ig) {
    const hianyzo = !tol ? p.tol : p.ig;
    throw new ApiHiba(
      404,
      `Nincs ${hianyzo} időállapot; a létezők: ${allapotok.map((a) => a.datum).join(", ")}`,
      !tol ? "tol" : "ig",
    );
  }

  const [regi, uj] = await Promise.all([getSzovegAt(tol.sha, p.slug), getSzovegAt(ig.sha, p.slug)]);
  if (regi === null || uj === null) throw new ApiHiba(404, "Hiányzó szöveg az egyik időállapotnál");

  let szakaszok = szakaszDiff(regi, uj);
  if (p.horgony) szakaszok = szakaszok.filter((s) => s.horgony === p.horgony);

  const meta = jogszabalyMeta(tetel);
  return {
    slug: meta.slug,
    megjeloles: meta.megjeloles,
    rovidites: meta.rovidites,
    cim: meta.cim,
    tol: tol.datum,
    ig: ig.datum,
    tol_sha: tol.sha,
    ig_sha: ig.sha,
    osszegzes: szakaszDiffOsszegzes(szakaszok),
    szakaszok,
    url: diffUrl(p.slug, tol.datum, ig.datum),
    megjegyzes: MEGJEGYZES,
  };
}
