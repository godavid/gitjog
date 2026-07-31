import { readFileSync, writeFileSync } from "node:fs";
import { arabbolRomai } from "./romai.js";

export interface TorvenyBejegyzes {
  documentId: string;
  slug: string;
  megjeloles: string;
}

/** documentId-k, ahol a slug nem képletből jön, hanem kiemelt érték. */
const KIEMELT_SLUGOK: Readonly<Record<string, string>> = {
  "2011-4301-02-00": "magyarorszag-alaptorvenye",
  "2013-5-00-00": "2013-evi-v-torveny-ptk",
  "2012-100-00-00": "2012-evi-c-torveny-btk",
  "2012-1-00-00": "2012-evi-i-torveny-mt",
  "2016-150-00-00": "2016-evi-cl-torveny-akr",
  "2016-130-00-00": "2016-evi-cxxx-torveny-pp",
  "2017-90-00-00": "2017-evi-xc-torveny-be",
  "2011-112-00-00": "2011-evi-cxii-torveny-infotv",
  "2017-150-00-00": "2017-evi-cl-torveny-art",
  "2017-151-00-00": "2017-evi-cli-torveny-air",
  "2007-127-00-00": "2007-evi-cxxvii-torveny-afa",
  "1995-117-00-00": "1995-evi-cxvii-torveny-szja",
  "1996-81-00-00": "1996-evi-lxxxi-torveny-tao",
  "2012-147-00-00": "2012-evi-cxlvii-torveny-katv",
  "1990-93-00-00": "1990-evi-xciii-torveny-itv",
  "2000-100-00-00": "2000-evi-c-torveny-szamv",
  "2006-5-00-00": "2006-evi-v-torveny-ctv",
  "2013-177-00-00": "2013-evi-clxxvii-torveny-ptke",
  "2013-237-00-00": "2013-evi-ccxxxvii-torveny-hpt",
  "2015-143-00-00": "2015-evi-cxliii-torveny-kbt",
  "1997-155-00-00": "1997-evi-clv-torveny-fgytv",
  "1994-53-00-00": "1994-evi-liii-torveny-vht",
  "2011-195-00-00": "2011-evi-cxcv-torveny-aht",
  "2011-189-00-00": "2011-evi-clxxxix-torveny-motv",
  "2011-190-00-00": "2011-evi-cxc-torveny-nkt",
  "2011-204-00-00": "2011-evi-cciv-torveny-nftv",
  "1997-154-00-00": "1997-evi-cliv-torveny-eutv",
  "2019-122-00-00": "2019-evi-cxxii-torveny-tbj",
  "1997-81-00-00": "1997-evi-lxxxi-torveny-tny",
  "1998-84-00-00": "1998-evi-lxxxiv-torveny-cst",
  "1993-3-00-00": "1993-evi-iii-torveny-szoctv",
  "2012-2-00-00": "2012-evi-ii-torveny-szabstv",
  "1988-1-00-00": "1988-evi-i-torveny-kkt",
  "1993-78-00-00": "1993-evi-lxxviii-torveny-lakastv",
  "2013-122-00-00": "2013-evi-cxxii-torveny-foldforgalmi",
  "2011-175-00-00": "2011-evi-clxxv-torveny-civiltv",
  "2003-125-00-00": "2003-evi-cxxv-torveny-ebktv",
};

const LOC_MINTA = /<loc>([^<]+)<\/loc>/g;
const TORVENY_MINTA = /\/jogszabaly\/(\d{4})-(\d+)-00-00$/;

/** Sitemap XML szövegből törvénylista-bejegyzések (dedup + rendezés). */
export function generalas(xml: string): TorvenyBejegyzes[] {
  const bejegyzesek = new Map<string, TorvenyBejegyzes>();
  for (const talalat of xml.matchAll(LOC_MINTA)) {
    const url = talalat[1]!.trim();
    const m = url.match(TORVENY_MINTA);
    if (!m) continue;
    const evStr = m[1]!;
    const szamStr = m[2]!;
    const ev = Number(evStr);
    const szam = Number(szamStr);
    const documentId = `${evStr}-${szamStr}-00-00`;
    if (bejegyzesek.has(documentId)) continue;
    const romai = arabbolRomai(szam);
    const slug =
      KIEMELT_SLUGOK[documentId] ??
      `${ev}-evi-${romai.toLowerCase()}-torveny`;
    const megjeloles = `${ev}. évi ${romai}. törvény`;
    bejegyzesek.set(documentId, { documentId, slug, megjeloles });
  }
  return [...bejegyzesek.values()].sort((a, b) => {
    const pa = a.documentId.split("-");
    const pb = b.documentId.split("-");
    return Number(pa[0]) - Number(pb[0]) || Number(pa[1]) - Number(pb[1]);
  });
}

function main(): void {
  const [, , sitemapUtvonal, kimenetUtvonal] = process.argv;
  if (!sitemapUtvonal || !kimenetUtvonal) {
    console.error(
      "Használat: tsx src/torvenylista-generalas.ts <sitemap.xml útvonal> <kimenet.json útvonal>",
    );
    process.exit(1);
  }
  const xml = readFileSync(sitemapUtvonal, "utf-8");
  const lista = generalas(xml);
  writeFileSync(kimenetUtvonal, JSON.stringify(lista, null, 2) + "\n");
  console.log(`${lista.length} törvény kiírva: ${kimenetUtvonal}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  main();
}
