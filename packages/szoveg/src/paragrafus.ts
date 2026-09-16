// §-kivágás heading nélküli törvényekből. A Ptk.-ban minden § külön heading
// („#### 6:272. § [Megbízási szerződés]"), de sok törvényben — pl. a
// Földforgalmi tv.-ben — a §-ok egy alcím alatti bekezdések: „18. § (1) A föld
// eladása esetén…". Ilyenkor a § a sor elején áll, és a következő „N. §"
// sorig vagy a következő headingig tart. Ez a modul ezt a futamot vágja ki,
// és megmondja, melyik heading (horgony) alatt van.

import { horgonyId } from "./szakaszok";

export interface ParagrafusReszlet {
  /** a tartalmazó heading horgonya (a mélylink oda visz), „" ha nincs */
  horgony: string;
  /** a tartalmazó heading címe */
  cim: string;
  /** a § kanonikus alakja, ahogy a szövegben áll: „18. §" */
  paragrafus: string;
  szoveg: string;
}

const PARAGRAFUS_SOR = /^(\d+(?::\d+)?(?:\/[A-Z])?)\. §(?=\s|$)/;
const HEADING = /^#{2,4} (.+)$/;

/** „18. §" → „18"; a szövegbeli sor elejével vetjük össze */
function szam(paragrafus: string): string {
  return paragrafus.replace(/\.\s*§\s*$/, "").trim().toUpperCase();
}

export function paragrafusKivag(md: string, paragrafus: string): ParagrafusReszlet | undefined {
  const keresett = szam(paragrafus);
  const hasznaltIdk = new Map<string, number>();
  let cim = "";
  let horgony = "";
  let gyujt: string[] | null = null;
  let talalt: ParagrafusReszlet | undefined;

  for (const sor of md.split("\n")) {
    const h = sor.match(HEADING);
    if (h) {
      if (gyujt) break; // a § futama a következő headingnél véget ér
      cim = h[1]!;
      const alap = horgonyId(cim);
      const eddig = hasznaltIdk.get(alap) ?? 0;
      hasznaltIdk.set(alap, eddig + 1);
      horgony = eddig === 0 ? alap : `${alap}-${eddig + 1}`;
      continue;
    }
    const p = sor.match(PARAGRAFUS_SOR);
    if (p) {
      if (gyujt) break; // következő § — vége
      if (p[1]!.toUpperCase() === keresett) {
        gyujt = [sor];
        talalt = { horgony, cim, paragrafus: `${p[1]}. §`, szoveg: "" };
        continue;
      }
    }
    if (gyujt && sor.trim() !== "" && !sor.startsWith("# ")) gyujt.push(sor);
  }
  if (!talalt || !gyujt) return undefined;
  talalt.szoveg = gyujt.join("\n").trim();
  return talalt;
}
