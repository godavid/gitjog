// Jogszabály-hivatkozás felismerése szabad szövegből: „Fftv. 18. §",
// „2013. évi CXXII. törvény", „Ptk. 6:272. §". Az agent egyetlen `kereses`
// hívást ad — ha a lekérdezés hivatkozásnak néz ki, az index oldja fel
// (pontos, olcsó), csak különben megy teljes szövegű keresésre.
//
// A parser csak JELÖLTET ad: a rövidítést a hívónak kell az index ellen
// ellenőriznie („Kérdés." is átmenne a mintán). Megjelölésnél a documentId-t
// építjük fel, mert az index kulcsa az, nem a szabadon írt megjelölés.

import { romaibolArab } from "./romai";
import { horgonyId, type Szakasz } from "./szakaszok";

export interface Hivatkozas {
  /** „2013-122-00-00" — csak megjelölés-alakból */
  documentId?: string;
  /** kanonikus alak: „2013. évi CXXII. törvény" */
  megjeloles?: string;
  /** a beírt rövidítés-jelölt, záró pont nélkül („Ptk", „Áfa tv") */
  rovidites?: string;
  /** kanonikus §-alak: „18. §", „6:272. §", „18/A. §" */
  paragrafus?: string;
}

const MEGJELOLES = /^(\d{4})\.?\s*évi\s+([ivxlcdm]+)\.?\s*(?:törvény|tv\.?)?/i;
const PARAGRAFUS = /(\d+(?::\d+)?(?:\/[a-z])?)\.?\s*§/i;
// 1–2 szó, az első nagybetűs, max 12 karakter — „Ptk.", „Fftv.", „Áfa tv."
const ROVIDITES = /^([A-ZÁÉÍÓÖŐÚÜŰ][A-Za-záéíóöőúüű]{0,11}\.?(?:\s+tv\.?)?)$/;

export function hivatkozasParse(q: string): Hivatkozas | null {
  const szoveg = q.trim().replace(/\s+/g, " ");
  if (!szoveg) return null;

  const eredmeny: Hivatkozas = {};
  let maradek = szoveg;

  const p = PARAGRAFUS.exec(maradek);
  if (p) {
    eredmeny.paragrafus = `${p[1]!.toUpperCase()}. §`;
    maradek = (maradek.slice(0, p.index) + maradek.slice(p.index + p[0].length)).trim();
  }

  const m = MEGJELOLES.exec(maradek);
  if (m) {
    let arab: number;
    try {
      arab = romaibolArab(m[2]!);
    } catch {
      return null;
    }
    eredmeny.documentId = `${m[1]}-${arab}-00-00`;
    eredmeny.megjeloles = `${m[1]}. évi ${m[2]!.toUpperCase()}. törvény`;
    return eredmeny;
  }

  // A § mögötti maradék rövidítés lehet; § nélkül csak rövid, nagybetűs alak számít.
  const r = ROVIDITES.exec(maradek.replace(/[,;]$/, ""));
  if (r) {
    eredmeny.rovidites = r[1]!.replace(/\.$/, "").replace(/\s+/g, " ");
    return eredmeny;
  }
  return null;
}

/** a § kanonikus alakjából a heading-horgony előtagja: „6:272. §" → „6-272-sz" */
export function paragrafusHorgony(paragrafus: string): string {
  return horgonyId(paragrafus);
}

/**
 * Egy § megkeresése a darabolt szakaszok között. A heading horgonya
 * „18-sz-elovasarlasi-jog" vagy csak „18-sz"; az ütközésfeloldó „-2" utótagú
 * másodpéldány is illeszkedik, de az első találat nyer.
 */
export function szakaszKeres(szakaszok: Szakasz[], paragrafus: string): Szakasz | undefined {
  const elotag = paragrafusHorgony(paragrafus);
  return szakaszok.find((s) => s.horgony === elotag || s.horgony.startsWith(`${elotag}-`));
}
