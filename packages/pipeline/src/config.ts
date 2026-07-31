// A Nyílt Jogtár MVP konfigurációja.
// A documentId az njt.jog.gov.hu azonosítója: ÉÉÉÉ-SZÁM-TÍPUS-ALTÍPUS
// (a törvények száma a római szám arab megfelelője, típus törvénynél 00-00).
// A konverziót az enumerálás futásidőben validálja az njt-oldal címe ellen
// (lásd parse.ts / cimEllenorzes), ezért egy elírás hangos hibát ad, nem rossz adatot.

export interface Jogszabaly {
  /** njt documentId, pl. "2013-5-00-00" */
  documentId: string;
  /** könyvtárnév az adat-repóban (URL-barát) */
  slug: string;
  /** hivatalos megjelölés, pl. "2013. évi V. törvény" — cím-validáláshoz is */
  megjeloles: string;
  /** a jogszabály címe */
  cim: string;
  /** közkeletű rövidítés, ha van */
  rovidites?: string;
}

export const NJT_BASE = "https://njt.jog.gov.hu";
export const USER_AGENT =
  "NyiltJogtar/0.1 (+https://jogtar.remenyfarm.hu; info@remenyfarm.hu)";
/** két kérésindítás között legalább ennyi telik el (udvarias crawl, ~1,8 kérés/mp) */
export const RATE_LIMIT_MS = 550;
export const ADAT_REPO = "godavid/magyar-jogtar";
export const ADAT_REPO_URL = `https://github.com/${ADAT_REPO}.git`;

/**
 * A teljes feldolgozandó lista: a kiemelt (kézi) JOGSZABALYOK + a sitemapból
 * generált data-static/torvenyek.json (ha létezik). Kiemelt győz (rövidítés, cím).
 * A generált fájl a torvenylista-generalas.ts kimenete.
 */
export async function teljesJogszabalyLista(): Promise<Jogszabaly[]> {
  const { readFile } = await import("node:fs/promises");
  const terkep = new Map(JOGSZABALYOK.map((j) => [j.documentId, j]));
  try {
    const nyers = await readFile(new URL("../data-static/torvenyek.json", import.meta.url), "utf8");
    const generalt = JSON.parse(nyers) as { documentId: string; slug: string; megjeloles: string }[];
    for (const g of generalt) {
      if (!terkep.has(g.documentId)) {
        terkep.set(g.documentId, { documentId: g.documentId, slug: g.slug, megjeloles: g.megjeloles, cim: "" });
      }
    }
  } catch {
    // nincs generált lista — csak a kiemeltek (MVP-mód)
  }
  return [...terkep.values()];
}

export const JOGSZABALYOK: Jogszabaly[] = [
  { documentId: "2011-4301-02-00", slug: "magyarorszag-alaptorvenye", megjeloles: "Magyarország Alaptörvénye", cim: "Magyarország Alaptörvénye" },
  { documentId: "2013-5-00-00", slug: "2013-evi-v-torveny-ptk", megjeloles: "2013. évi V. törvény", cim: "a Polgári Törvénykönyvről", rovidites: "Ptk." },
  { documentId: "2012-100-00-00", slug: "2012-evi-c-torveny-btk", megjeloles: "2012. évi C. törvény", cim: "a Büntető Törvénykönyvről", rovidites: "Btk." },
  { documentId: "2012-1-00-00", slug: "2012-evi-i-torveny-mt", megjeloles: "2012. évi I. törvény", cim: "a munka törvénykönyvéről", rovidites: "Mt." },
  { documentId: "2016-150-00-00", slug: "2016-evi-cl-torveny-akr", megjeloles: "2016. évi CL. törvény", cim: "az általános közigazgatási rendtartásról", rovidites: "Ákr." },
  { documentId: "2016-130-00-00", slug: "2016-evi-cxxx-torveny-pp", megjeloles: "2016. évi CXXX. törvény", cim: "a polgári perrendtartásról", rovidites: "Pp." },
  { documentId: "2017-90-00-00", slug: "2017-evi-xc-torveny-be", megjeloles: "2017. évi XC. törvény", cim: "a büntetőeljárásról", rovidites: "Be." },
  { documentId: "2011-112-00-00", slug: "2011-evi-cxii-torveny-infotv", megjeloles: "2011. évi CXII. törvény", cim: "az információs önrendelkezési jogról és az információszabadságról", rovidites: "Infotv." },
  { documentId: "2017-150-00-00", slug: "2017-evi-cl-torveny-art", megjeloles: "2017. évi CL. törvény", cim: "az adózás rendjéről", rovidites: "Art." },
  { documentId: "2017-151-00-00", slug: "2017-evi-cli-torveny-air", megjeloles: "2017. évi CLI. törvény", cim: "az adóigazgatási rendtartásról", rovidites: "Air." },
  { documentId: "2007-127-00-00", slug: "2007-evi-cxxvii-torveny-afa", megjeloles: "2007. évi CXXVII. törvény", cim: "az általános forgalmi adóról", rovidites: "Áfa tv." },
  { documentId: "1995-117-00-00", slug: "1995-evi-cxvii-torveny-szja", megjeloles: "1995. évi CXVII. törvény", cim: "a személyi jövedelemadóról", rovidites: "Szja tv." },
  { documentId: "1996-81-00-00", slug: "1996-evi-lxxxi-torveny-tao", megjeloles: "1996. évi LXXXI. törvény", cim: "a társasági adóról és az osztalékadóról", rovidites: "Tao tv." },
  { documentId: "2012-147-00-00", slug: "2012-evi-cxlvii-torveny-katv", megjeloles: "2012. évi CXLVII. törvény", cim: "a kisadózó vállalkozások tételes adójáról és a kisvállalati adóról", rovidites: "Katv." },
  { documentId: "1990-93-00-00", slug: "1990-evi-xciii-torveny-itv", megjeloles: "1990. évi XCIII. törvény", cim: "az illetékekről", rovidites: "Itv." },
  { documentId: "2000-100-00-00", slug: "2000-evi-c-torveny-szamv", megjeloles: "2000. évi C. törvény", cim: "a számvitelről", rovidites: "Számv. tv." },
  { documentId: "2006-5-00-00", slug: "2006-evi-v-torveny-ctv", megjeloles: "2006. évi V. törvény", cim: "a cégnyilvánosságról, a bírósági cégeljárásról és a végelszámolásról", rovidites: "Ctv." },
  { documentId: "2013-177-00-00", slug: "2013-evi-clxxvii-torveny-ptke", megjeloles: "2013. évi CLXXVII. törvény", cim: "a Polgári Törvénykönyvről szóló 2013. évi V. törvény hatálybalépésével összefüggő átmeneti és felhatalmazó rendelkezésekről", rovidites: "Ptké." },
  { documentId: "2013-237-00-00", slug: "2013-evi-ccxxxvii-torveny-hpt", megjeloles: "2013. évi CCXXXVII. törvény", cim: "a hitelintézetekről és a pénzügyi vállalkozásokról", rovidites: "Hpt." },
  { documentId: "2015-143-00-00", slug: "2015-evi-cxliii-torveny-kbt", megjeloles: "2015. évi CXLIII. törvény", cim: "a közbeszerzésekről", rovidites: "Kbt." },
  { documentId: "1997-155-00-00", slug: "1997-evi-clv-torveny-fgytv", megjeloles: "1997. évi CLV. törvény", cim: "a fogyasztóvédelemről", rovidites: "Fgytv." },
  { documentId: "1994-53-00-00", slug: "1994-evi-liii-torveny-vht", megjeloles: "1994. évi LIII. törvény", cim: "a bírósági végrehajtásról", rovidites: "Vht." },
  { documentId: "2011-195-00-00", slug: "2011-evi-cxcv-torveny-aht", megjeloles: "2011. évi CXCV. törvény", cim: "az államháztartásról", rovidites: "Áht." },
  { documentId: "2011-189-00-00", slug: "2011-evi-clxxxix-torveny-motv", megjeloles: "2011. évi CLXXXIX. törvény", cim: "Magyarország helyi önkormányzatairól", rovidites: "Mötv." },
  { documentId: "2011-190-00-00", slug: "2011-evi-cxc-torveny-nkt", megjeloles: "2011. évi CXC. törvény", cim: "a nemzeti köznevelésről", rovidites: "Nkt." },
  { documentId: "2011-204-00-00", slug: "2011-evi-cciv-torveny-nftv", megjeloles: "2011. évi CCIV. törvény", cim: "a nemzeti felsőoktatásról", rovidites: "Nftv." },
  { documentId: "1997-154-00-00", slug: "1997-evi-cliv-torveny-eutv", megjeloles: "1997. évi CLIV. törvény", cim: "az egészségügyről", rovidites: "Eütv." },
  { documentId: "2019-122-00-00", slug: "2019-evi-cxxii-torveny-tbj", megjeloles: "2019. évi CXXII. törvény", cim: "a társadalombiztosítás ellátásaira jogosultakról, valamint ezen ellátások fedezetéről", rovidites: "Tbj." },
  { documentId: "1997-81-00-00", slug: "1997-evi-lxxxi-torveny-tny", megjeloles: "1997. évi LXXXI. törvény", cim: "a társadalombiztosítási nyugellátásról", rovidites: "Tny." },
  { documentId: "1998-84-00-00", slug: "1998-evi-lxxxiv-torveny-cst", megjeloles: "1998. évi LXXXIV. törvény", cim: "a családok támogatásáról", rovidites: "Cst." },
  { documentId: "1993-3-00-00", slug: "1993-evi-iii-torveny-szoctv", megjeloles: "1993. évi III. törvény", cim: "a szociális igazgatásról és szociális ellátásokról", rovidites: "Szoctv." },
  { documentId: "2012-2-00-00", slug: "2012-evi-ii-torveny-szabstv", megjeloles: "2012. évi II. törvény", cim: "a szabálysértésekről, a szabálysértési eljárásról és a szabálysértési nyilvántartási rendszerről", rovidites: "Szabs. tv." },
  { documentId: "1988-1-00-00", slug: "1988-evi-i-torveny-kkt", megjeloles: "1988. évi I. törvény", cim: "a közúti közlekedésről", rovidites: "Kkt." },
  { documentId: "1993-78-00-00", slug: "1993-evi-lxxviii-torveny-lakastv", megjeloles: "1993. évi LXXVIII. törvény", cim: "a lakások és helyiségek bérletére, valamint az elidegenítésükre vonatkozó egyes szabályokról", rovidites: "Lakástv." },
  { documentId: "2013-122-00-00", slug: "2013-evi-cxxii-torveny-foldforgalmi", megjeloles: "2013. évi CXXII. törvény", cim: "a mező- és erdőgazdasági földek forgalmáról", rovidites: "Földforgalmi tv." },
  { documentId: "2011-175-00-00", slug: "2011-evi-clxxv-torveny-civiltv", megjeloles: "2011. évi CLXXV. törvény", cim: "az egyesülési jogról, a közhasznú jogállásról, valamint a civil szervezetek működéséről és támogatásáról", rovidites: "Civil tv." },
  { documentId: "2003-125-00-00", slug: "2003-evi-cxxv-torveny-ebktv", megjeloles: "2003. évi CXXV. törvény", cim: "az egyenlő bánásmódról és az esélyegyenlőség előmozdításáról", rovidites: "Ebktv." },
];
