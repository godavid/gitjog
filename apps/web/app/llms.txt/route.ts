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

  const szoveg = `# GitJog

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

## MCP-szerver és API (ezt használd — §-szintű, pár KB-os válaszok)

Ne olvass be egész törvényt (0,1–1,4 MB): a §-szintű végpontok adják, ami kell.

- MCP (streamable HTTP, auth nélkül): ${OLDAL_URL}/api/mcp
- REST, OpenAPI-leírással: ${OLDAL_URL}/api/v1/openapi.json

Négy művelet, REST-en és MCP-toolként ugyanúgy:

- kereses — „melyik § szabályozza X-et?”, vagy hivatkozás feloldása („Ptk. 6:272. §”, „2013. évi CXXII. törvény 18. §”).
  A találat a § teljes szövegét és URL-jét hozza: egy körben citálható.
  ${OLDAL_URL}/api/v1/kereses?q=termőföld+elővásárlási+jog
- szakasz — egy § egy adott napon hatályos szövege; § nélkül a jogszabály időállapotai és tartalomjegyzéke.
  ${OLDAL_URL}/api/v1/szakasz?slug=2013-evi-cxxii-torveny-foldforgalmi&paragrafus=18.+§&datum=2024-01-01
- valtozasok — mi változott: cursorral (felveve_utan) vagy since/until/slugs szűrővel; az érintett §-ok régi/új szövegével.
  ${OLDAL_URL}/api/v1/valtozasok?since=2026-01-01&q=föld
- diff — két időállapot teljes §-szintű összevetése.
  ${OLDAL_URL}/api/v1/diff?slug=2013-evi-cxxii-torveny-foldforgalmi&tol=2023-01-01&ig=2024-01-01

### Változásfigyelés (recept ütemezett agentnek)

1. Első futásnál hívd: /api/v1/valtozasok?felveve_utan=<mostani időbélyeg>&q=föld (vagy slugs=…).
2. Tárold el a válasz kovetkezo_felveve_utan mezőjét — ez a cursor.
3. Naponta (a frissítés 03:30 UTC után) hívd újra a tárolt cursorral. Üres tetelek = nincs újdonság.
4. Ha van tétel: az erintett_szakaszok régi/új szövegéből írj összefoglalót, a diff_url a teljes különbség.
A cursor a repóba kerülés ideje, nem a hatálybalépés: a késve felvett, régi dátumú állapotot is jelzi.

## További gépi felületek

- Egy jogszabály nyers Markdown-szövege: ${OLDAL_URL}/jogszabaly/{slug}/szoveg.md
- Egy jogszabály változásainak RSS-feedje: ${OLDAL_URL}/jogszabaly/{slug}/valtozasok.xml

## Adat

- Repó: https://github.com/${ADAT_REPO}
- Nyers szöveg (Markdown): ${RAW}/jogszabalyok/{slug}/szoveg.md
- Jogszabály-index: ${RAW}/index/jogszabalyok.json — slug, documentId, megjelölés, cím, rövidítés
- Időállapot-térkép: ${RAW}/index/allapotok.json — slugonként [{datum, verzio, sha}] (4+ MB; egy törvényhez: ${RAW}/jogszabalyok/{slug}/allapotok.json)
- Felvételi napló: ${RAW}/index/felvetel/{ÉÉÉÉ-HH}.jsonl — soronként {felveve, slug, datum, sha}: mikor került be egy időállapot
- Agent-útmutató a klónozott repóhoz: https://github.com/${ADAT_REPO}/blob/main/AGENTS.md
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
