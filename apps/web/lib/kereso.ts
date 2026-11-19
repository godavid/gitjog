// Teljes szövegű keresés a Neon Postgres FTS-én keresztül. Az index
// építése a pipeline dolga (packages/pipeline/src/kereso-index.ts); itt
// csak lekérdezünk. A magyar szótövezést és a találat-kiemelést a
// kereses() adatbázisfüggvény adja.
//
// A kapcsolat szerver oldali, csak olvasó szerepé (gitjog_olvaso): a
// KERESO_DB_URL szándékosan NEM NEXT_PUBLIC_ előtagú, így a kliens
// bundle-be semmi nem kerül belőle.

import postgres, { type Sql } from "postgres";

export interface Talalat {
  slug: string;
  jogszabaly: string; // "Ptk. (2013. évi V. törvény)"
  szakasz: string;
  horgony: string;
  // INVARIANT: a kiemelést STX/ETX (\u0002/\u0003) jelöli, NEM HTML — a <mark>-ot a React
  // építi (app/kereses/page.tsx kiemelve()); soha ne add át dangerouslySetInnerHTML-nek.
  // Lásd: docs/uzemeltetes.md → Keresés, Kiemelés-invariáns.
  reszlet: string;
  hatalyos: boolean;
}

export interface KeresesSor {
  slug: string;
  megjeloles: string;
  rovidites: string | null;
  jogszabaly_cim: string;
  szakasz_cim: string;
  horgony: string;
  reszlet: string;
  hatalyos: boolean;
}

let kapcsolat: Sql | null = null;

function getSql(): Sql {
  if (kapcsolat) return kapcsolat;
  const url = process.env.KERESO_DB_URL;
  if (!url) throw new Error("Hiányzó keresődatabázis-konfiguráció (KERESO_DB_URL).");
  // prepare: false — a Neon pooler (pgbouncer, tranzakciós mód) a megnevezett
  // prepared statementeket nem viszi át kapcsolatok között.
  kapcsolat = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 15 });
  return kapcsolat;
}

export function jogszabalyNev(sor: Pick<KeresesSor, "megjeloles" | "rovidites">): string {
  return sor.rovidites ? `${sor.rovidites} (${sor.megjeloles})` : sor.megjeloles;
}

export function talalat(sor: KeresesSor): Talalat {
  return {
    slug: sor.slug,
    jogszabaly: jogszabalyNev(sor),
    szakasz: sor.szakasz_cim,
    horgony: sor.horgony,
    reszlet: sor.reszlet,
    hatalyos: sor.hatalyos,
  };
}

export async function keres(q: string, mind = false, limit = 40): Promise<Talalat[]> {
  try {
    const sorok = await getSql()<KeresesSor[]>`
      select * from kereses(${q}::text, ${mind}::boolean, ${limit}::int)`;
    return sorok.map(talalat);
  } catch (hiba) {
    throw new Error(`Keresési hiba: ${hiba instanceof Error ? hiba.message : String(hiba)}`);
  }
}

export interface TeljesTalalat extends Talalat {
  megjeloles: string;
  rovidites: string | null;
  jogszabalyCim: string;
  /** a § teljes, normalizált szövege (az API-nak: egy körben citálható találat) */
  szoveg: string;
}

export function teljesTalalat(sor: KeresesSor & { szoveg: string }): TeljesTalalat {
  return {
    slug: sor.slug,
    jogszabaly: jogszabalyNev(sor),
    megjeloles: sor.megjeloles,
    rovidites: sor.rovidites,
    jogszabalyCim: sor.jogszabaly_cim,
    szakasz: sor.szakasz_cim,
    horgony: sor.horgony,
    reszlet: sor.reszlet,
    szoveg: sor.szoveg,
    hatalyos: sor.hatalyos,
  };
}

/** Az API keresője: ugyanaz a rangsor, de a § teljes szövegével (kereses_api SQL). */
export async function keresTeljes(q: string, mind = false, limit = 10): Promise<TeljesTalalat[]> {
  try {
    const sorok = await getSql()<(KeresesSor & { szoveg: string })[]>`
      select * from kereses_api(${q}::text, ${mind}::boolean, ${limit}::int)`;
    return sorok.map(teljesTalalat);
  } catch (hiba) {
    throw new Error(`Keresési hiba: ${hiba instanceof Error ? hiba.message : String(hiba)}`);
  }
}
