// `valtozasok`: „mi új azóta, hogy utoljára néztem?” Egy hívás, a válasz
// önmagában elég egy értesítéshez (érintett §-ok régi/új szövege korlátos
// méretben). Két ág:
//  - `felveve_utan` (a megbízható cursor): a felvételi naplóból — akkor is
//    lát egy késve felvett, régi dátumú állapotot;
//  - `since`/`slugs` napló nélkül: a hatálybalépés dátuma szerint, a havi
//    bontásból (ugyanaz, amit a /valtozasok oldal használ).

import { szakaszDiff, type SzakaszValtozas } from "@gitjog/szoveg";
import {
  getAllapotokSlug,
  getFelvetelNaplo,
  getHaviBontas,
  getSzovegAt,
  type FelvetelSor,
  type JogszabalyTetel,
} from "@/lib/adat";
import {
  ApiHiba,
  csonkol,
  diffUrl,
  jogszabalyTerkep,
  jogszabalyUrl,
  KORLAT,
  korlatozottParhuzam,
  MEGJEGYZES,
  normalizal,
} from "./kozos";
import { ervenyesDatum } from "./datum";
import { kurzorParse, lapoz, type Kurzor } from "./kurzor";

export interface ValtozasokParam {
  felveve_utan?: string;
  since?: string;
  until?: string;
  slugs?: string[];
  q?: string;
  limit?: number;
}

export interface ErintettSzakasz {
  horgony: string;
  cim: string;
  tipus: SzakaszValtozas["tipus"];
  regi: string | null;
  uj: string | null;
  csonkolt: boolean;
}

export interface ValtozasTetel {
  slug: string;
  megjeloles: string;
  rovidites: string | null;
  cim: string;
  /** a hatálybalépés napja */
  datum: string;
  /** az előző időállapot; `null`, ha ez a jogszabály első (hatálybalépő) szövege */
  elozo_datum: string | null;
  /** mikor került a repóba (csak a napló-ágon ismert) */
  felveve: string | null;
  erintett_szakaszok: ErintettSzakasz[];
  tovabbi_szakaszok: number;
  diff_url: string | null;
  url: string;
}

export interface ValtozasokValasz {
  mod: "naplo" | "hatalybalepes";
  tetelek: ValtozasTetel[];
  /**
   * ezt tárold el cursorként a következő híváshoz (napló-ágon): átlátszatlan
   * szöveg, `<felveve>_<slug>_<datum>` alakú; üres lapon a bemeneti cursor
   */
  kovetkezo_felveve_utan: string | null;
  megjegyzes: string;
}

interface Nyers {
  slug: string;
  datum: string;
  felveve: string | null;
}

function szurok(p: ValtozasokParam, terkep: Map<string, JogszabalyTetel>): (n: Nyers) => boolean {
  const slugok = p.slugs && p.slugs.length > 0 ? new Set(p.slugs) : null;
  // Szóeleji illesztés, „|”-vel elválasztott alternatívákkal: a „föld" a
  // „földek"-re és a „Földalap"-ra illik, a „külföldre"-re nem; az összetett
  // szavakhoz („termőföld") a hívó ad külön tagot: q=föld|termőföld.
  const tagok = p.q
    ? p.q.split("|").map((t) => normalizal(t)).filter(Boolean)
    : [];
  const illik = (mezo: string) =>
    tagok.some((tag) => mezo === tag || mezo.startsWith(`${tag}`) || mezo.includes(` ${tag}`) || mezo.includes(`-${tag}`));
  return (n) => {
    if (slugok && !slugok.has(n.slug)) return false;
    if (p.since && n.datum < p.since) return false;
    if (p.until && n.datum > p.until) return false;
    if (tagok.length > 0) {
      const t = terkep.get(n.slug);
      if (!t) return false;
      const mezok = [t.cim, t.rovidites ?? "", t.megjeloles].map(normalizal);
      if (!mezok.some(illik)) return false;
    }
    return terkep.has(n.slug);
  };
}

/** UTC-hónapkulcsok a cursor hónapjától a mai hónapig */
function honapok(tol: string): string[] {
  const lista: string[] = [];
  const [ev, ho] = tol.slice(0, 7).split("-").map(Number) as [number, number];
  const most = new Date();
  let e = ev;
  let h = ho;
  while (e < most.getUTCFullYear() || (e === most.getUTCFullYear() && h <= most.getUTCMonth() + 1)) {
    lista.push(`${e}-${String(h).padStart(2, "0")}`);
    if (++h > 12) {
      h = 1;
      e++;
    }
    if (lista.length > 240) break; // 20 év — a cursor nyilván hibás
  }
  return lista;
}

/** A cursor hónapjától máig minden naplósor; a cursor utáni szűrést a `lapoz` végzi. */
async function naploAg(kurzor: Kurzor): Promise<{ sorok: FelvetelSor[]; vanNaplo: boolean }> {
  const fajlok = await Promise.all(honapok(kurzor.felveve).map((h) => getFelvetelNaplo(h)));
  const vanNaplo = fajlok.some((f) => f !== null);
  const sorok = fajlok.flatMap((f) => f ?? []).filter((s) => s.felveve >= kurzor.felveve);
  return { sorok, vanNaplo };
}

async function hatalybalepesAg(p: ValtozasokParam): Promise<Nyers[]> {
  const { slugok, honapok: havi } = await getHaviBontas();
  const kezdo = (p.since ?? "0000-01").slice(0, 7);
  const zaro = (p.until ?? "9999-12").slice(0, 7);
  const sorok: Nyers[] = [];
  for (const [kulcs, tetelek] of Object.entries(havi)) {
    if (kulcs < kezdo || kulcs > zaro) continue;
    for (const [i, datum] of tetelek) sorok.push({ slug: slugok[i]!, datum, felveve: null });
  }
  return sorok;
}

async function tetelKifejt(n: Nyers, t: JogszabalyTetel): Promise<ValtozasTetel> {
  const allapotok = await getAllapotokSlug(n.slug);
  const i = allapotok.findIndex((a) => a.datum === n.datum);
  const akt = i >= 0 ? allapotok[i]! : null;
  const elozo = i > 0 ? allapotok[i - 1]! : null;

  let erintett: ErintettSzakasz[] = [];
  let tovabbi = 0;
  if (akt && elozo) {
    const [regi, uj] = await Promise.all([getSzovegAt(elozo.sha, n.slug), getSzovegAt(akt.sha, n.slug)]);
    if (regi !== null && uj !== null) {
      const mind = szakaszDiff(regi, uj);
      tovabbi = Math.max(0, mind.length - KORLAT.valtozasSzakasz);
      erintett = mind.slice(0, KORLAT.valtozasSzakasz).map((v) => {
        const r = v.regi === null ? null : csonkol(v.regi, KORLAT.valtozasSzoveg);
        const u = v.uj === null ? null : csonkol(v.uj, KORLAT.valtozasSzoveg);
        return {
          horgony: v.horgony,
          cim: v.cim,
          tipus: v.tipus,
          regi: r?.szoveg ?? null,
          uj: u?.szoveg ?? null,
          csonkolt: Boolean(r?.csonkolt || u?.csonkolt),
        };
      });
    }
  }
  return {
    slug: n.slug,
    megjeloles: t.megjeloles,
    rovidites: t.rovidites,
    cim: t.cim,
    datum: n.datum,
    elozo_datum: elozo?.datum ?? null,
    felveve: n.felveve,
    erintett_szakaszok: erintett,
    tovabbi_szakaszok: tovabbi,
    diff_url: elozo ? diffUrl(n.slug, elozo.datum, n.datum) : null,
    url: jogszabalyUrl(n.slug),
  };
}

export async function valtozasokApi(p: ValtozasokParam): Promise<ValtozasokValasz> {
  if (!p.felveve_utan && !p.since && !(p.slugs && p.slugs.length > 0)) {
    throw new ApiHiba(400, "Adj meg legalább egy szűrőt: `felveve_utan`, `since` vagy `slugs`");
  }
  for (const [mezo, ertek] of [
    ["since", p.since],
    ["until", p.until],
  ] as const) {
    if (ertek && !ervenyesDatum(ertek))
      throw new ApiHiba(400, `A \`${mezo}\` alakja YYYY-MM-DD (valódi naptári dátum)`, mezo);
  }
  const kurzor = p.felveve_utan ? kurzorParse(p.felveve_utan) : null;
  if (p.felveve_utan && !kurzor) {
    throw new ApiHiba(
      400,
      "A `felveve_utan` ISO-8601 időbélyeg (pl. 2026-09-15T00:00:00Z) vagy a válasz `kovetkezo_felveve_utan` értéke változtatás nélkül",
      "felveve_utan",
    );
  }
  const darab = Math.min(Math.max(p.limit ?? KORLAT.valtozasokAlap, 1), KORLAT.valtozasokMax);
  const terkep = await jogszabalyTerkep();
  const szur = szurok(p, terkep);

  if (kurzor) {
    const { sorok, vanNaplo } = await naploAg(kurzor);
    if (vanNaplo) {
      // Veszteségmentes keyset-lapozás (#26): a szűrt sorok közül a cursor utáni
      // legrégebbi `darab` sor, a cursor a lap utolsó sora. Üres lapon a cursor
      // nem változik.
      const { lap, kovetkezo } = lapoz(sorok.filter(szur), kurzor, darab);
      const tetelek = await korlatozottParhuzam(lap, 4, (n) => tetelKifejt(n, terkep.get(n.slug)!));
      return { mod: "naplo", tetelek, kovetkezo_felveve_utan: kovetkezo, megjegyzes: MEGJEGYZES };
    }
  }

  // Hatálybalépés szerint, legújabb elöl; cursor nélkül vagy ha a cursor a napló
  // bevezetése előtti (még nincs naplófájl): ekkor a cursor napjától.
  const nyers = kurzor
    ? await hatalybalepesAg({ ...p, since: p.since ?? kurzor.felveve.slice(0, 10) })
    : await hatalybalepesAg(p);
  const kivalasztott = nyers
    .filter(szur)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, darab);
  const tetelek = await korlatozottParhuzam(kivalasztott, 4, (n) => tetelKifejt(n, terkep.get(n.slug)!));
  return { mod: "hatalybalepes", tetelek, kovetkezo_felveve_utan: null, megjegyzes: MEGJEGYZES };
}
