// `kereses`: az agent egyetlen hívása. Hivatkozásnak látszó lekérdezést az
// indexből oldunk fel (pontos, DB nélkül is megy), különben teljes szövegű
// keresés. A találat egy körben citálható: a § teljes szövege + stabil URL.

import { hivatkozasParse, paragrafusKivag, szakaszKeres, szakaszokraBont } from "@gitjog/szoveg";
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

/**
 * Az index csak ~36 törvénynél hordoz rövidítést; a gyakorlatban használt
 * rövidítések egy része hiányzik vagy más alakban áll („Földforgalmi tv." vs.
 * „Fftv."). Kis, kézzel ellenőrzött kiegészítés — normalizált kulcs → documentId.
 */
const ROVIDITES_ALIAS: Record<string, string> = {
  fftv: "2013-122-00-00", // a mező- és erdőgazdasági földek forgalmáról
  foldforgalmi: "2013-122-00-00",
  fetv: "2013-212-00-00", // a Fftv.-vel összefüggő egyes rendelkezésekről és átmeneti szabályokról
  tft: "1994-55-00-00", // a termőföldről
  nfatv: "2001-116-00-00", // a Nemzeti Földalapról
  szjt: "1999-76-00-00", // a szerzői jogról
  kp: "2017-1-00-00", // a közigazgatási perrendtartásról
};

function jogszabalyFeloldas(
  terkep: Map<string, JogszabalyTetel>,
  h: { documentId?: string; rovidites?: string },
): JogszabalyTetel | undefined {
  const lista = [...terkep.values()];
  if (h.documentId) return lista.find((t) => t.documentId === h.documentId);
  if (h.rovidites) {
    const cel = normalizal(h.rovidites);
    // csak a KÜLÖN SZÓ „tv."/„törvény" utótag esik le („Földforgalmi tv" → „foldforgalmi");
    // a „Fftv" végén a „tv" a rövidítés része
    const tomorit = (r: string) => r.replace(/ (tv|torveny)$/, "").replace(/[^a-z0-9]/g, "");
    const rovid = tomorit(cel);
    return (
      lista.find((t) => t.rovidites && normalizal(t.rovidites) === cel) ??
      lista.find((t) => t.rovidites && tomorit(normalizal(t.rovidites)) === rovid) ??
      (ROVIDITES_ALIAS[rovid] ? lista.find((t) => t.documentId === ROVIDITES_ALIAS[rovid]) : undefined)
    );
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
      const r = paragrafusKivag(md, paragrafus);
      if (!r) throw new ApiHiba(404, `Nincs ${paragrafus} a(z) ${tetel.megjeloles} szövegében`, "q");
      return {
        ...alap,
        szakasz_cim: r.cim,
        horgony: r.horgony,
        ...csonkol(r.szoveg, KORLAT.keresesSzoveg),
        url: jogszabalyUrl(tetel.slug, r.horgony),
      };
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
    // a DB-hiba részlete csak a logba kerül, a kliens felé nem
    console.error("kereses: adatbázis-hiba", e);
    throw new ApiHiba(503, "A kereső adatbázis nem elérhető");
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
