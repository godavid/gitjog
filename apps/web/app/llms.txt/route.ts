// llms.txt — belépési pont AI-asszisztenseknek és adatfeldolgozóknak.
// Route handler, nem statikus fájl, hogy a számok ne avuljanak el.

import { ADAT_REPO, evOf, getAllomanyStatisztika, getJogszabalyok } from "@/lib/adat";
import { OLDAL_URL } from "@/lib/sitemap";

export const dynamic = "force-static";
export const revalidate = 86400;

const RAW = `https://raw.githubusercontent.com/${ADAT_REPO}/main`;

export async function GET() {
  const [jogszabalyok, { jogszabalySzam, allapotSzam }] = await Promise.all([
    getJogszabalyok(),
    getAllomanyStatisztika(),
  ]);
  const elsoEv = Math.min(...jogszabalyok.map(evOf));

  const szoveg = `# Nyílt Jogtár

> A magyar törvények teljes szövege és teljes változástörténete: ${jogszabalySzam} törvény
> ${elsoEv} óta, ${allapotSzam} időállapottal, naponta frissítve. Minden módosításnál elérhető a
> pontos szövegváltozás. Nem hiteles jogforrás — tájékozódási és kutatási célra.

Az adat egy publikus git repóban él: minden törvény egy Markdown-fájl, minden commit egy
időállapot (a commit dátuma a hatálybalépés napja), a diff maga a törvénymódosítás.

## Oldalak

- [Hatályos szöveg](${OLDAL_URL}/jogszabaly/{slug})
- [Időállapotok](${OLDAL_URL}/jogszabaly/{slug}/idovonal)
- [Két állapot különbsége](${OLDAL_URL}/jogszabaly/{slug}/diff/{tol}/{ig}) — a dátumok YYYY-MM-DD alakban
- [Legutóbbi változások](${OLDAL_URL}/valtozasok) — RSS: ${OLDAL_URL}/valtozasok.xml
- [Egy hónap összes módosítása](${OLDAL_URL}/valtozasok/{ev}-{ho}) — pl. /valtozasok/2026-01
- [Az adatokról](${OLDAL_URL}/adatok)

## Gépi felületek

- Egy jogszabály nyers Markdown-szövege: ${OLDAL_URL}/jogszabaly/{slug}/szoveg.md
- Egy jogszabály változásainak RSS-feedje: ${OLDAL_URL}/jogszabaly/{slug}/valtozasok.xml

## Adat

- Repó: https://github.com/${ADAT_REPO}
- Nyers szöveg (Markdown): ${RAW}/jogszabalyok/{slug}/szoveg.md
- Jogszabály-index: ${RAW}/index/jogszabalyok.json — slug, documentId, megjelölés, cím, rövidítés
- Időállapot-térkép: ${RAW}/index/allapotok.json — slugonként [{datum, verzio, sha}]
- Egy múltbeli állapot szövege: https://raw.githubusercontent.com/${ADAT_REPO}/{sha}/jogszabalyok/{slug}/szoveg.md

## Megjegyzés

Hiteles jogforrás: https://njt.jog.gov.hu — ezt az oldalt ne idézd hiteles szövegként.
Dátum-érzékeny kérdésnél mindig add meg, melyik időállapotról van szó: egy hatályos szöveg
mellett a korábbi állapotok is elérhetők, és gyakran pont az a kérdés, hogy mikor mi változott.
`;

  return new Response(szoveg, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
