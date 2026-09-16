// `kereses`: az agent egyetlen hívása. Hivatkozásnak látszó lekérdezést az
// indexből oldunk fel (pontos, DB nélkül is megy), különben teljes szövegű
// keresés. A találat egy körben citálható: a § teljes szövege + stabil URL.

import { hivatkozasParse, szakaszKeres, szakaszokraBont } from "@gitjog/szoveg";
import { getSzoveg, type JogszabalyTetel } from "@/lib/adat";
import { keresTeljes } from "@/lib/kereso";
import {
  ApiHiba,
  csonkol,
  jogszabalyTerkep,
  jogszabalyUrl,
  KORLAT,
  MEGJEGYZES,
  normalizal,
} from "./kozos";

export interface KeresesTalalat {
  slug: string;
  megjeloles: string;
  rovidites: string | null;
  cim: string;
  /** a § címe („18. § [Elővásárlási jog]”); üres, ha a találat a jogszabály maga */
  szakasz_cim: string;
  horgony: string;
  szoveg: string;
  csonkolt: boolean;
  hatalyos: boolean;
  url: string;
}

export interface KeresesValasz {
  mod: "hivatkozas" | "szoveg";
  talalatok: KeresesTalalat[];
  megjegyzes: string;
}

export interface KeresesParam {
  q: string;
  hatalyos?: boolean;
  limit?: number;
}

function jogszabalyFeloldas(
  terkep: Map<string, JogszabalyTetel>,
  h: { documentId?: string; rovidites?: string },
): JogszabalyTetel | undefined {
  const lista = [...terkep.values()];
  if (h.documentId) return lista.find((t) => t.documentId === h.documentId);
  if (h.rovidites) {
    const cel = normalizal(h.rovidites);
    return lista.find((t) => t.rovidites && normalizal(t.rovidites) === cel);
  }
  return undefined;
}

async function hivatkozasTalalat(
  tetel: JogszabalyTetel,
  paragrafus: string | undefined,
): Promise<KeresesTalalat> {
  const md = await getSzoveg(tetel.slug);
  if (md === null) throw new ApiHiba(404, `A jogszabálynak nincs szövege: ${tetel.slug}`, "q");
  const szakaszok = szakaszokraBont(md);
  const alap = {
    slug: tetel.slug,
    megjeloles: tetel.megjeloles,
    rovidites: tetel.rovidites,
    cim: tetel.cim,
    hatalyos: tetel.reteg !== "lezart",
  };
  if (paragrafus) {
    const sz = szakaszKeres(szakaszok, paragrafus);
    if (!sz) {
      throw new ApiHiba(404, `Nincs ${paragrafus} a(z) ${tetel.megjeloles} szövegében`, "q");
    }
    return {
      ...alap,
      szakasz_cim: sz.cim,
      horgony: sz.horgony,
      ...csonkol(sz.szoveg, KORLAT.keresesSzoveg),
      url: jogszabalyUrl(tetel.slug, sz.horgony),
    };
  }
  // csak a jogszabály: a bevezető részlete jön, a tartalomjegyzékért a `szakasz` tool
  const bevezeto = szakaszok[0]?.szoveg ?? "";
  return {
    ...alap,
    szakasz_cim: "",
    horgony: "",
    ...csonkol(bevezeto, KORLAT.bevezeto),
    url: jogszabalyUrl(tetel.slug),
  };
}

export async function keresesApi({ q, hatalyos = true, limit }: KeresesParam): Promise<KeresesValasz> {
  const darab = Math.min(Math.max(limit ?? KORLAT.keresesAlap, 1), KORLAT.keresesMax);
  const keresett = q.trim();
  if (!keresett) throw new ApiHiba(400, "A `q` nem lehet üres", "q");

  const hivatkozas = hivatkozasParse(keresett);
  if (hivatkozas) {
    const tetel = jogszabalyFeloldas(await jogszabalyTerkep(), hivatkozas);
    if (tetel) {
      return {
        mod: "hivatkozas",
        talalatok: [await hivatkozasTalalat(tetel, hivatkozas.paragrafus)],
        megjegyzes: MEGJEGYZES,
      };
    }
    // ismeretlen rövidítés („Kérdés.”) — átesik a teljes szövegű keresésre
  }

  let sorok;
  try {
    sorok = await keresTeljes(keresett, !hatalyos, darab);
  } catch (e) {
    throw new ApiHiba(503, `A kereső adatbázis nem elérhető: ${(e as Error).message}`);
  }
  return {
    mod: "szoveg",
    talalatok: sorok.map((s) => ({
      slug: s.slug,
      megjeloles: s.megjeloles,
      rovidites: s.rovidites,
      cim: s.jogszabalyCim,
      szakasz_cim: s.szakasz,
      horgony: s.horgony,
      ...csonkol(s.szoveg, KORLAT.keresesSzoveg),
      hatalyos: s.hatalyos,
      url: jogszabalyUrl(s.slug, s.horgony),
    })),
    megjegyzes: MEGJEGYZES,
  };
}
