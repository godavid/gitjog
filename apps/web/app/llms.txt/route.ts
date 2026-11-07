// llms.txt — belépési pont AI-asszisztenseknek és adatfeldolgozóknak.
// Route handler, nem statikus fájl, hogy a számok ne avuljanak el.

import { ADAT_REPO, evOf, getAllomanyStatisztika, getJogszabalyok } from "@/lib/adat";
import {
  FRISSITES_UTAN,
  MCP_KLIENSEK,
  MCP_REGISTRY_NEV,
  MCP_URL,
  OPENAPI_URL,
  REST_PELDAK,
  RSS_URL,
  githubAtom,
  torvenyRss,
} from "@/lib/csatornak";
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
  // kliensenként egy listaelem, alatta a szó szerint másolható kód (a listaelembe
  // behúzott, kerített blokk — így Markdownként is a listaelemhez tartozik)
  const bekotes = MCP_KLIENSEK.map(
    (k) => `- ${k.nev} — ${k.hol}:\n\n  \`\`\`\n  ${k.kod.replace(/\n/g, "\n  ")}\n  \`\`\``,
  ).join("\n\n");
  // a REST-példák műveletenként, a csatornak.ts egyetlen forrásából
  const pelda = Object.fromEntries(REST_PELDAK.map((p) => [p.muvelet, p.url]));

  const szoveg = `# GitJog

> A magyar törvények teljes szövege és teljes változástörténete: ${jogszabalySzam} törvény
> ${elsoEv} óta, ${allapotSzam} időállapottal, naponta frissítve. Minden módosításnál elérhető a
> pontos szövegváltozás. Nem hiteles jogforrás — tájékozódási és kutatási célra.

Az adat egy publikus git repóban él: minden törvény egy Markdown-fájl, minden időállapot egy
commit, a commit dátuma a hatálybalépés napja, a diff maga a törvénymódosítás. Egy commit több
jogszabály azonos napú állapotát hordozhatja. A history nem dátumrendezett: egy jogszabály
időállapotainak SHA-it a \`jogszabalyok/{slug}/allapotok.json\` adja, és a \`git log\`-hoz
mindig adj útvonal-szűrőt (\`git log -- jogszabalyok/{slug}/szoveg.md\`).

## Oldalak

- [Hatályos szöveg](${OLDAL_URL}/jogszabaly/{slug})
- [Időállapotok](${OLDAL_URL}/jogszabaly/{slug}/idovonal)
- [Két állapot különbsége](${OLDAL_URL}/jogszabaly/{slug}/diff/{tol}/{ig}) — a dátumok YYYY-MM-DD alakban;
  {tol} és {ig} a jogszabály két létező időállapotának napja, {tol} a korábbi, különben 404
- [Legutóbbi változások](${OLDAL_URL}/valtozasok) — RSS: ${RSS_URL}
- [Egy hónap összes módosítása](${OLDAL_URL}/valtozasok/{ev}-{ho}) — pl. /valtozasok/2026-01
- [Az adatokról](${OLDAL_URL}/adatok)
- [MCP-szerver, API és értesítés](${OLDAL_URL}/agenteknek) — ez a leírás emberi olvasásra, bekötési példákkal

## MCP-szerver és API (ezt használd — §-szintű, pár KB-os válaszok)

Ne olvass be egész törvényt (a legnagyobb 2,3 MB): a §-szintű végpontok adják, ami kell.

- MCP (streamable HTTP, auth nélkül): ${MCP_URL} — registry: ${MCP_REGISTRY_NEV}
- REST, OpenAPI-leírással: ${OPENAPI_URL}

Bekötés MCP-kliensbe:

${bekotes}

Négy művelet, REST-en és MCP-toolként ugyanúgy:

- kereses — „melyik § szabályozza X-et?”, vagy hivatkozás feloldása („Ptk. 6:272. §”, „2013. évi CXXII. törvény 18. §”).
  A találat a § teljes szövegét és URL-jét hozza: egy körben citálható.
  ${pelda.kereses}
- szakasz — egy § egy adott napon hatályos szövege; § nélkül a jogszabály időállapotai és tartalomjegyzéke.
  ${pelda.szakasz}
- valtozasok — mi változott: cursorral (felveve_utan) vagy since/until/slugs szűrővel; az érintett §-ok régi/új szövegével.
  ${pelda.valtozasok}
- diff — két időállapot teljes §-szintű összevetése.
  ${pelda.diff}

### Változásfigyelés (recept ütemezett agentnek)

1. Első futásnál hívd: /api/v1/valtozasok?felveve_utan=<mostani ISO időbélyeg>&q=termőföld|földek+forgalm|Földalap (vagy slugs=…).
2. Tárold el a válasz kovetkezo_felveve_utan mezőjét változtatás nélkül: ez a cursor (átlátszatlan szöveg,
   alakja <időbélyeg>_<slug>_<dátum>, pl. 2026-10-06T17:43:08Z_2013-evi-v-torveny-ptk_2026-10-01).
3. Naponta (a frissítés ${FRISSITES_UTAN} után) hívd újra a tárolt cursorral. Minden lap után tárold el
   az új kovetkezo_felveve_utan értéket a következő hívás előtt. Ismételd, amíg a tetelek üres nem lesz.
   Üres tetelek = nincs újdonság.
4. Ha van tétel: az erintett_szakaszok régi/új szövegéből írj összefoglalót, a diff_url a teljes különbség.
A lapok felvételi sorrendben jönnek (a legrégebbi elöl), kihagyás és ismétlés nélkül. Első cursorként egy
sima ISO időbélyeg is elfogadott. A cursor a repóba kerülés idejét követi, nem a hatálybalépést: a késve
felvett, régi dátumú állapotot is jelzi.

## Értesítés (ember és gép)

- Az összes friss módosítás RSS-feedje: ${RSS_URL}
- Egy jogszabály változásainak RSS-feedje: ${torvenyRss("{slug}")}
- Az adat-repó commit-feedje (Atom): ${githubAtom()} — egy jogszabályé: ${githubAtom("{slug}")}
- Ütemezett agent: a fenti cursoros recept (MCP-n a \`valtozasok\` tool, ugyanezekkel a paraméterekkel)

## További gépi felületek

- Egy jogszabály nyers Markdown-szövege: ${OLDAL_URL}/jogszabaly/{slug}/szoveg.md

## Adat

- Repó: https://github.com/${ADAT_REPO}
- Nyers szöveg (Markdown): ${RAW}/jogszabalyok/{slug}/szoveg.md
- Jogszabály-index: ${RAW}/index/jogszabalyok.json — [{slug, documentId, megjeloles, cim, rovidites}]
- Időállapot-térkép: ${RAW}/index/allapotok.json — slugonként [{datum, verzio, sha}] (3+ MB; egy törvényhez: ${RAW}/jogszabalyok/{slug}/allapotok.json)
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
