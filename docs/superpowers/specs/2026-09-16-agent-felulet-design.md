# Agent-felület: REST API + MCP-szerver + felvételi napló — terv

Dátum: 2026-09-16. Állapot: jóváhagyott (a felhasználó a brainstorming végén a teljes
kivitelezést kérte; a nyitva maradt részdöntéseket ez a dokumentum rögzíti).

## Cél

A GitJog elsődleges közönsége a gépi felhasználó (PRODUCT.md). Ma a gépi felület
`llms.txt` + nyers `szoveg.md` + RSS + raw JSON-indexek: egy agent három-négy körben,
megabájtos fájlokból jut el egy §-ig. Ez a terv két domináns agent-folyamot tesz
egykörössé és olcsóvá:

1. **Keresés** — „melyik § szabályozza X-et?" → egy hívás, citálható találat a § teljes
   szövegével és stabil URL-lel.
2. **Változásfigyelés** — „mi új azóta, hogy utoljára néztem?" → egy hívás, a válasz
   önmagában elég egy értesítéshez (érintett §-ok régi/új szövege), „nincs újdonság" =
   üres tömb egy CDN-találatból.

Nem cél: e-mail, feliratkozó-tárolás, auth, téma-taxonómia, rendeletek.

## Döntések (a brainstormingból)

- Célközönség: idegen agentek is (Claude/ChatGPT/Cursor kliensek, WebFetch-es agentek).
- Terjesztés: **registry + fejlesztői csatornák** — ez felülírja a 2026-08-10-i
  „szigorúan passzív" marketing-döntést az MCP-szerverre nézve (PRODUCT.md frissül).
- Megközelítés: egy Next app, három réteg; nincs külön szerver, nincs új infra.

## Architektúra

```
packages/szoveg  (@gitjog/szoveg)   tiszta függvények, vitest
  szakaszok.ts    §-darabolás + horgonyId  (a pipeline-ból költözik; a web md.ts is innen importál)
  hivatkozas.ts   „Fftv. 18. §" / „2013. évi CXXII. törvény" / „Ptk." → {megjeloles|rovidites, paragrafus}
  szakasz-diff.ts két §-lista horgony szerinti párosítása → csak az eltérő §-ok (regi/uj + sorblokkok)

apps/web/lib/api/                    szolgáltatásréteg, JSON-t ad, a két felület ezt hívja
  kereses.ts  szakasz.ts  valtozasok.ts  diff.ts  kozos.ts (limitek, URL-építés, hibatípusok)

apps/web/app/api/v1/{kereses,szakasz,valtozasok,diff}/route.ts   REST (GET, query-paraméterek)
apps/web/app/api/v1/openapi.json/route.ts                        OpenAPI 3.1 leírás
apps/web/app/api/mcp/route.ts                                    mcp-handler 2.x, stateless streamable-HTTP
apps/web/app/api/revalidate/route.ts                             GitHub push-webhook (HMAC) → revalidateTag

packages/pipeline/src/delta.ts       felvételi napló írása + AGENTS.md szinkron az adat-repóba
```

Adatforrás változatlan: szöveg és időállapotok a raw GitHubról (`adat.ts`), keresés a
Supabase `kereses()`-én. A §-lekérés és a diff DB nélkül működik (a `szoveg.md`-t
kérés-időben daraboljuk), így Supabase-kiesésnél csak a szabadszavas keresés esik ki;
a hivatkozás-feloldás az indexből akkor is megy.

## Interfész

Minden tool read-only, kulcs és süti nélkül. Ugyanaz a négy művelet REST-en
(`/api/v1/<név>?…`) és MCP-toolként; a ChatGPT-connector kedvéért `search` és `fetch`
alias is regisztrálva van (ugyanazokra a függvényekre).

### `kereses`
Be: `q` (kötelező), `hatalyos` (alap `true`), `limit` (alap 10, max 40).
Viselkedés: ha `q` hivatkozásnak parszolható (megjelölés, rövidítés, opcionális § / „6:272. §"),
strukturált feloldás az indexből + az adott § kiemelése; különben Postgres FTS.
Ki: `talalatok[]`: `slug, megjeloles, rovidites, cim, szakasz_cim, horgony, szoveg,
csonkolt, hatalyos, url` — a `szoveg` a § teljes szövege 4 000 karakterig
(`csonkolt: true` fölötte), az `url` a § horgonyára mutató oldal.

### `szakasz`
Be: `slug` (kötelező), `horgony` **vagy** `paragrafus` („18. §", „6:272. §"), `datum` (opcionális, YYYY-MM-DD).
Ki § megadásával: `{slug, megjeloles, cim, datum (az időállapot), horgony, szakasz_cim, szoveg, url, nyers_url}`.
Ki § nélkül: meta + `idoallapotok[]` (`datum, sha`) + `tartalomjegyzek[]` (`horgony, cim, hossz`) — nem a teljes szöveg.
`datum` → a legutolsó, `datum`-nál nem későbbi időállapot (`jogszabalyok/{slug}/allapotok.json`), szövege a SHA-ról (immutábilis fetch).

### `valtozasok`
Be: `felveve_utan` (ISO időbélyeg — a megbízható cursor), `since` / `until`
(hatálybalépés-szűrő, YYYY-MM-DD), `slugs` (vesszővel), `q` (jogszabálycímre/
rövidítésre illeszt, kisbetű-ékezet-független részszó), `limit` (alap 20, max 50).
Legalább egy szűrő kötelező (`felveve_utan`, `since` vagy `slugs`); különben 400.
Ki: `tetelek[]`: `slug, megjeloles, rovidites, cim, datum, elozo_datum, felveve,
erintett_szakaszok[] {horgony, cim, tipus: "modosult"|"uj"|"torolt", regi, uj},
tovabbi_szakaszok (szám), diff_url, url`. Korlátok: §-onként 1 500 karakter/oldal,
tételenként 20 §, a maradék `tovabbi_szakaszok`-ban. Plusz `kovetkezo_felveve_utan`
(a válasz legfrissebb `felveve` értéke — ezt tárolja el a hívó cursorként).
Rendezés: `felveve` (ha van), majd `datum` csökkenő.

### `diff`
Be: `slug, tol, ig` (YYYY-MM-DD, mindkettő létező időállapot, különben 404 a hiányzóra),
`horgony` (opcionális: egy §-ra szűkít).
Ki: `{slug, megjeloles, tol, ig, tol_sha, ig_sha, osszegzes {modosult, uj, torolt,
hozzaadott_sor, torolt_sor}, szakaszok[] {horgony, cim, tipus, regi, uj, blokkok[]}, url}`.
Teljes (nem csonkolt) §-szövegek — ez a drill-down végpont.

### ChatGPT-alias
`search(query)` → `kereses` találatai `{id: "slug#horgony", title, url}` alakban;
`fetch(id)` → `szakasz` a `slug`/`horgony` szétbontásával.

### Hibák
400 rossz paraméter (mező-szintű üzenet), 404 nincs ilyen slug/időállapot/§,
503 ha a keresés adatbázisa nem elérhető (a többi végpont ettől nem függ),
500 átmeneti forráshiba (a `rawFetch` 429/5xx-e — a hívó jöjjön vissza).
MCP-oldalon ugyanez `isError: true` szöveges tartalommal.

## Felvételi napló (a cursor)

A pipeline a committer-dátumot is a hatálybalépésre állítja, ezért a git-history nem
mondja meg, MIKOR került be egy állapot. A `delta.ts` ezért minden futás végén
sorokat fűz az `index/felvetel/ÉÉÉÉ-HH.jsonl` fájlhoz (a futás UTC-hónapja):

```
{"felveve":"2026-09-17T03:41:12Z","slug":"2013-evi-cxxii-torveny-foldforgalmi","datum":"2026-09-17","sha":"<commit>"}
```

Egy sor = egy új időállapot; a `sha` az állapotot rögzítő commit (az `allapotShaTerkep`-ből).
Havi fájl: kicsi, cache-elhető, git-natívan is olvasható (`tail -n`). A napló az index-
utócommit része. Backfill nem ír naplót (ritka, kézi művelet); ha egy hónapra nincs fájl,
a `valtozasok` a `since`-ágra esik vissza (`allapotok.json`, mint ma a `/valtozasok` oldal).

## §-szintű diff

1. Mindkét állapot `szoveg.md`-je → `szakaszokraBont` (a megosztott csomagból; a horgony-
   ütközésfeloldás azonos az mdRenderrel, ezért a horgony stabil kulcs).
2. Párosítás horgony szerint: mindkettőben van és `szoveg` eltér → `modosult`; csak az
   újban → `uj`; csak a régiben → `torolt`. Az üres horgonyú (heading nélküli) darabok
   sorszám szerint párosulnak.
3. `modosult` §-nál soronkénti blokkok a meglévő `valtozasSzamitas`-sal (a `diff`
   csomag a `@gitjog/szoveg`-be költözik, a web onnan importál).

## Frissesség és cache

- `rawFetch` `napi` módja és az `unstable_cache` hívások `tags: ["adat-repo"]` címkét kapnak.
- `POST /api/revalidate`: GitHub **repo-webhook** a `godavid/magyar-jog` push-eseményére
  (CLI-vel létrehozva), `X-Hub-Signature-256` HMAC-ellenőrzés a `GITHUB_WEBHOOK_SECRET`
  Vercel-env-vel, siker → `revalidateTag("adat-repo", "max")`. Nem kell a CI-workflowt
  módosítani, nincs új GitHub-secret.
- REST-válaszok `Cache-Control`: `valtozasok` 900 s s-maxage (+ 1 nap SWR); `kereses`
  3 600 s; `szakasz`/`diff` konkrét dátummal 86 400 s, dátum nélkül 3 600 s. A CDN
  szolgálja ki az ismétlődő hívásokat, a function csak cache-hiánynál fut.
- Az API-route-ok `dynamic = "force-dynamic"` (a `force-static` eldobná a
  query-paramétereket); a cache a data-cache + CDN szintjén él.
- MCP POST nem CDN-cache-elhető; a data-cache ott is hat. Rate-limit: Vercel Firewall
  szabály, ha a csapat terve engedi — a tervezés végén ellenőrizzük; ha nem, a
  `Cache-Control` + a Vercel alap DDoS-védelme az első vonal.

## Felfedezhetőség

- `llms.txt`: új „MCP és API" szakasz a négy művelettel, egy-egy példahívással és a
  változásfigyelő recepttel (cursor tárolása).
- `/adatok` oldal: ugyanez emberi olvasónak (MCP-URL, REST-példák).
- `server.json` a gitjog repó gyökerében, névtér `io.github.godavid/gitjog`
  (GitHub-loginnal igazolható; a `hu.remenyfarm` névtér DNS-TXT-t kérne, amihez most
  nincs DNS-jogú tokenünk). Publikálás: `mcp-publisher login github` (interaktív —
  a felhasználó futtatja) + `mcp-publisher publish`.
- Fejlesztői csatornák (a felhasználó döntése alapján): GitHub topicok az adat- és
  kód-repón (`mcp`, `mcp-server`, `hungarian-law`, `legal-data`), awesome-mcp-servers
  PR — ezek a felhasználó GitHub-fiókjából mennek, a spec csak felsorolja.
- `AGENTS.md` az adat-repóban: a git-natív receptek (`git log --follow`, `git diff`
  két dátum között, `git blame`, sparse checkout egy törvényre), az API/MCP címe és a
  napló olvasása. Forrása a `sablonok.ts`; a `delta.ts` minden futáskor kiírja, és ha
  változott, az index-utócommitba kerül — így a pipeline a fájl gazdája, kézi push nem kell.

## Tesztelés

- `packages/szoveg` vitest: a meglévő `szakaszok.test.ts` költözik (az mdRender-
  egyezés tesztje marad); új tesztek a `hivatkozas` parserre (megjelölés, rövidítés,
  §-alakok, nem-hivatkozás) és a `szakaszDiff`-re (modosult/uj/torolt, üres horgonyú
  párosítás, csonkolás).
- Pipeline vitest: a napló-sor generálás és a havi fájlnév.
- Deploy utáni füstteszt (curl): a négy REST-végpont egy-egy valós hívása, `openapi.json`
  érvényes JSON, MCP `initialize` + `tools/list` POST-tal, `/api/revalidate` rossz
  aláírással 401.

## Korlátok (kimondva)

- Melyik módosító törvény okozta a változást — az njt konszolidált szövege nem
  hordozza; a válaszok ezt nem tartalmazzák.
- Napi ritmus: a delta 03:30 UTC-kor fut; a `felveve` ennek időbélyege. „Azonnali" =
  a hatálybalépés napján reggel, a webhook után percekkel.
- Nem hiteles jogforrás — minden válasz `forras`/`megjegyzes` mezőben hordozza.

## Referencia-fogyasztó

Napi ütemezett agent (Claude Code routine, 06:00 Europe/Budapest):
`GET /api/v1/valtozasok?felveve_utan=<tárolt cursor>&q=föld` → ha `tetelek` nem üres,
összefoglaló az `erintett_szakaszok`-ból + push-értesítés; a `kovetkezo_felveve_utan`
lesz az új cursor. Ugyanez az `llms.txt`-ben receptként, hogy külső agentek lemásolják.
