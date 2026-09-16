# GitJog — üzemeltetési leírás

## Áttekintés

| Mi | Hol |
|---|---|
| Kód (crawler, parser, pipeline, weboldal) | `godavid/gitjog` (ez a repo) |
| Adat (jogszabályok + git-history) | `godavid/magyar-jog` (publikus) |
| Weboldal | `gitjog.remenyfarm.hu` (Vercel, projekt: `gitjog`, scope: `remenyfarm`) |
| Napi frissítés | GitHub Actions az adat-repóban (`.github/workflows/napi-delta.yml`), 03:30 UTC |
| Riasztás | GitHub Issue az adat-repóban, `parser-riasztas` címkével (a GitHub emailt küld) |
| IndexNow-bejelentés | Vercel cron, `/api/indexnow`, 06:00 UTC (a napi delta után) |
| Forgalommérés | Vercel Web Analytics (süti nélküli, oldalszintű) |

## Felfedezhetőség (2026-08-10)

- **Sitemap**: `/sitemap/0.xml` … `/sitemap/5.xml`, összesen ~31 700 URL (jogszabály-
  oldalak, idővonalak, minden szomszédos időállapot-pár diffje, évoldalak, havi
  változás-oldalak). A Next nem
  generál sitemap-indexet, ezért a `robots.txt` sorolja fel a hat shardot. A shardok
  számát a `lib/sitemap.ts` `SITEMAP_SHARDOK` konstansa adja — ha nő az állomány, ezt
  kell emelni (shardonként 50 000 URL a limit).
- **A diff szerver oldalon renderelődik.** Ha valaha visszakerülne kliensre, a
  22 592 diff-oldal azonnal kiesik az indexből: a Bing és az AI-crawlerek nem
  futtatnak JS-t.
- **IndexNow**: a `public/f2b522b792d5d8381a74992ca28abe51.txt` kulcsfájl igazolja a
  domaint (nem titok). A napi cron az elmúlt 3 nap változásait jelenti be; a
  `CRON_SECRET` env védi. Kézi teljes újraküldés a sitemapokból bármikor lehetséges.
- **Oldaltípusok, amelyek a keresésre válaszolnak.** A címek és fejlécek a keresők
  nyelvét beszélik, nem a fejlesztőét: a törvényoldal címében ott a hivatalos
  megjelölés is (`Btk. – 2012. évi C. törvény hatályos szövege`), a diff-oldal címe
  `Btk. — mi változott? 2026. augusztus 7.` (a „Diff" szót senki nem keresi). A látható
  `<h1>` a lap tetején áll és tartalmazza a rövidítést + a teljes címet; a Markdown saját
  nyitó sora ezért `<h2 class="szoveg-fejcim">` (a `lib/md.ts` szint-1 ága). Ez a heading
  NEM kap horgonyt, így a `szakaszok.ts`-szel közös horgony-invariáns sértetlen marad.
- **Havi változás-oldalak**: `/valtozasok/{ev}-{ho}` (pl. `/valtozasok/2026-01`), jelenleg
  404 hónap 1902-től. Erre a keresletre („mi változott januárban?") ma csak kézzel írt
  újságcikkek válaszolnak. Az adat a `lib/adat.ts` `getHaviBontas()`-ából jön: ez a nagy
  állapot-térkép KOMPAKT származéka (~0,9 MB, a slugra indexszel hivatkozik), hogy mind a
  404 oldal EGYETLEN cache-bejegyzésből dolgozzon. Ha valaha 2 MB fölé nőne, a régi
  hónapokat kell kihagyni belőle — nem a revalidate-et emelni. Buildkor csak az utolsó
  12 hónap generálódik, a többi első kérésre (ISR).
- **Gépi felületek**: `/jogszabaly/{slug}/szoveg.md` (nyers Markdown azonos eredetről) és
  `/jogszabaly/{slug}/valtozasok.xml` (egy törvény változásainak RSS-e — a fizetős
  jogi adatbázisok „figyeltetés" funkciójának ingyenes megfelelője). 2026-09-16 óta
  **REST API és MCP-szerver** is — lásd a külön szakaszt lent.
- **Strukturált adat**: `Legislation` a törvényoldalon (`legislationDate` és
  `temporalCoverage` is), `Dataset` az `/adatok`-on, `BreadcrumbList` az idővonal- és
  diff-oldalakon, `WebSite` a layoutban. A sitelinks-keresődoboz (`SearchAction`)
  SZÁNDÉKOSAN kimarad: a `/kereses` a robots.txt-ben tiltott.
- **A Search Console / Bing tokenje környezeti változóból jön**:
  `GOOGLE_SITE_VERIFICATION`, illetve `BING_SITE_VERIFICATION` (Vercel env, Production).
  Ha nincs beállítva, a meta kimarad — a bekötés tehát nem igényel kódmódosítást.
- **Cache-csapda**: az `index/allapotok.json` 4,4 MB, nem fér a Next adat-cache 2 MB-os
  limitjébe. Ezért `cache: "no-store"`-ral jön, és a belőle számolt rövid eredményt
  `unstable_cache` tartja el. Ha ezt valaki visszaállítja `revalidate`-re, egy régi,
  kisebb válasz beragadhat és némán hetekig elavult adatot szolgál ki (2026-08-10-én
  pontosan ez történt: a sitemap 37 törvényből épült 4332 helyett).
- **A `CACHE_VERZIO` léptetése nem opcionális.** Az `unstable_cache` bejegyzései átélik a
  deployt: amikor a sitemap URL-halmaza a havi oldalakkal bővült, a régi bejegyzés a friss
  kód ellenére a régi listát szolgálta ki — ez lokális buildben is reprodukálódott, mielőtt
  élesre ment volna. Ha változik, hogy MI kerül egy cache-elt eredménybe, léptesd a
  `lib/adat.ts` `CACHE_VERZIO`-ját; különben a változás némán késik egy revalidate-ablakot.

## A pipeline (packages/pipeline)

- `config.ts` — az MVP jogszabály-lista (documentId, slug, megjelölés). Bővítés = új sor.
- `crawl.ts` — njt-letöltés. KRITIKUS tudás: csak a `njt.jog.gov.hu` host működik
  (a `njt.hu` TLS-szinten reseteli a nem böngésző klienseket); HTTP/1.1; azonosítható
  User-Agent. Verziólista: POST `/ajax/collectAllDocumentVersion.json` (form-encoded
  `documentId`). Snapshot: GET `/jogszabaly/{id}.{verzió}`. Nagy törvénynél a szöveg
  egy része lazy-blokk: POST `/ajax/njtGetBlock.json` (JSON, a `borderStart` elemek
  `data-show-order` értékeivel, egy batch-kérésben).
- `parse.ts` + `normalize.ts` — HTML → determinisztikus Markdown. A determinizmus
  szent: azonos bemenet = byte-azonos kimenet, mert a diff-minőség ezen áll.
- `backfill.ts` — egyszeri teljes visszatöltés (lokálisan futtatandó). `pnpm backfill`,
  push-sal: `pnpm backfill -- --push`. Üres `data/repo`-t vár; a letöltés `data/cache`-be
  cache-elődik, így az újrafuttatás olcsó.
- `delta.ts` — napi növekmény, idempotens. Az Actions futtatja, de lokálisan is megy:
  `NYILT_ADAT_REPO_DIR=<adat-repo-klón> pnpm delta -- --no-push`.
  Megszakadt LOKÁLIS futás után mindig friss klónból futtasd újra (a részben
  commitolt napok + az elmaradt index-frissítés miatt); az Actions-futásnál ez
  nem gond, mert minden futás friss checkoutot kap.
- `enumeralas.ts` — réteges enumerálás: melyik jogszabályt kell MA lekérdezni.
  Az 5586-os listát végigkérdezni naponta ~51 perc lenne (550 ms rate limit),
  ezért három réteg van (az adat-repo `index/enumeralas.json`-jában):
  `aktiv` (van hatályos vagy jövőbeli állapota) minden nap, `lezart` és
  `nincs-szoveg` heti körforgásban. A körforgás állapotmentes: a documentId
  hash-e dönti el, melyik napon esedékes — nincs "utoljára ellenőrizve" mező,
  és a napi terhelés egyenletes. A delta minden lekérdezésnél frissíti a réteget.
  Jelenlegi arány: 2043 aktív / 2296 lezárt / 1247 szöveg nélküli → ~2550 kérés
  és ~23 perc naponta az 5586 helyett.
  A térkép első feltöltése a lemez-cache-ből: `pnpm --filter @gitjog/pipeline
  enumeralas-init [-- --push]` (a backfill után; utána a delta tartja karban).
  Ha a fájl hiányzik vagy sérült, a delta a teljes végigjárásra esik vissza —
  lassabb, de nem hagy ki adatot.
- `szakaszok.ts` — markdown → §-szintű szakaszok a keresőindexhez. A horgony-
  generálás az `apps/web/lib/md.ts` `mdRender()`-ével bit szerint egyezik (lásd
  a Keresés szakasz horgony-invariánsát).
- `kereso-index.ts` + `kereso-feltoltes.ts` — a keresőindex szinkronja és teljes
  újraépítése (lásd a Keresés szakaszt).
- `health.ts` — riasztás (Issue) + terjedelem-anomália-őr. A riasztás CÍM szerint
  dedupol: azonos című nyitott issue mellett nem nyit újat, más hibafajta viszont
  saját issue-t kap.
- A napi-delta.yml két példányban él: az élő az adat-repo `.github/workflows/`-ában,
  a forrás itt a `packages/pipeline/adatrepo/`-ban — módosításnál MINDKETTŐT frissítsd.

## Ha törik a parser (njt-átdizájn)

Tünet: piros napi delta futás + `parser-riasztas` issue. Szerkezeti hibánál (cím-,
hatálydátum-eltérés, ismeretlen osztály, splicing) a delta SEMMIT nem commitol —
rossz adat nem kerülhet a repóba. A terjedelem-anomália ezzel szemben
JOGSZABÁLYONKÉNTI: az érintett jogszabályt (és aznapi további állapotait) kihagyja,
a többit normálisan commitolja, a végén külön issue-val riaszt, és a kihagyott
állapotokat a következő futások újra megpróbálják. (2026-08-26-tól kilenc napig
egyetlen módosító törvény duzzadása miatt 37 más törvény állapota sem került be —
ez volt a tanulság.)

1. Nézd meg a hibát az Actions logban (melyik jogszabály, melyik osztály/feltevés).
2. Lokálisan reprodukáld: `pnpm exec tsx src/parse-proba.ts <documentId> <verzió> /tmp/ki.md`
3. Tipikus törések és javításuk:
   - **Új elem-osztály** (`Ismeretlen njt-osztályok` hiba): vedd fel a
     `parse.ts` `ISMERT_OSZTALYOK` halmazába ÉS a `normalize.ts` leképezésébe
     (heading / bekezdés / lista). Minta: nézd meg az osztály HTML-jét a cache-ben.
   - **Splicing-feltevés megdőlt** (renderelt elem border után): az njt megváltoztatta
     a lazy-load rendjét — a `parse.ts` összefésülő logikáját kell igazítani.
   - **Üres verziólista / 4xx**: URL-séma változott — a `crawl.ts` végpontjait
     kell újra felderíteni (böngésző devtools a njt.jog.gov.hu-n).
   - **Terjedelem-anomália** (`10212 → 3311 kar (32%) — nem commitolom`): NEM
     feltétlenül parser-törés. Előbb döntsd el, valós-e a rövidülés: kérd le az
     njt-ről az érintett verziót (`GET /jogszabaly/{id}.{verzió}`), és nézd meg,
     hogy (a) van-e benne `borderStart` (ha igen, lazy-blokk hiányzik → valódi
     parser-hiba), és (b) csökkent-e a `§` jelek száma. Ha a rövidülés valós — a
     módosító törvényeknél ez a normális életciklus —, a futás egyszer
     átengedhető: `pnpm delta -- --anomalia-ok=<slug>` (vesszővel több is).
     A „…módosításáról" végű című törvényeket az őr 2026-08-15 óta magától
     engedékenyebben kezeli (`modositoTorveny()` a `health.ts`-ben): náluk csak az
     5% alatti maradék számít anomáliának, a duzzadás NEM. A módosító törvény
     szakaszai ugyanis a hatálybalépésük napján megjelennek a konszolidált
     szövegben, másnap beépülve kiürülnek — a 2026. évi XVIII. például
     16 590 → 111 538 → 17 225 karakter volt három egymást követő napon, és a régi
     2× felső küszöb ezen akadt el.
4. Tesztek: `pnpm test`. Ha a normalizálás SZÁNDÉKOSAN változott, regeneráld a
   golden hasheket (`parse-proba` + `shasum -a 256`) a `test/normalize.test.ts`-ben.
   Vigyázz: a golden-változás azt jelenti, hogy a teljes history diffje "ugrik" egyet
   a következő delta-commitnál — kerüld, ha csak lehet.
5. Kézi delta-futtatás ellenőrzésre, majd az issue lezárása.

## Skálázás a törvényekre — KÉSZ (2026-08-01)

A teljes törvényállomány betöltve: **4332 jogszabály, 5404 commit** az adat-repóban,
1254 tétel kihagyva (nincs konszolidált szöveg az njt-n). A lista a sitemapból
generálódik (`torvenylista-generalas.ts` → `data-static/torvenyek.json`, 5585 tétel).

- A backfill folytatható: `pnpm backfill -- --folytat` (tiszta worktree-ről indul,
  a már commitolt (jogszabály, dátum) párokat parse nélkül átugorja, kötegenként pushol).
- A napi delta ehhez a mérethez a réteges enumerálással igazodik (lásd fentebb).

Ami még hátravan: rendeletek, határozatok (a lista jelenleg csak törvény).

## Keresés (Supabase Postgres FTS)

A weboldal keresője a `nyilt-jogtar` Supabase-projekt Postgres FTS-ét használja
(régió: eu-central-1, a magyar látogatókhoz és a Vercelhez közel). A korábbi
memóriabeli MiniSearch-index ~200 törvényig bírta, ezért volt a keresés a
kiemeltekre szűkítve; ez megszűnt.

- **Séma és lekérdezés:** `packages/pipeline/supabase/01-sema.sql` (táblák, GIN
  index, RLS) és `02-kereses.sql` (a `kereses()` függvény). Mindkettő
  újrafuttatható: `psql "$NYILT_DB_URL" -f <fájl>`.
- **Magyar szótövezés:** `to_tsvector('hungarian', …)` — ettől talál a
  „szerződést" a „szerződés" szóra. A generált oszlop csak a KÉTARGUMENTUMOS
  alakot fogadja el (az egyargumentumos nem immutable).
- **Az index származtatott adat.** Bármikor eldobható és újraépíthető:
  `NYILT_DB_URL=... pnpm --filter @gitjog/pipeline kereso-feltoltes`
  (~4332 jogszabály, teljes újraépítés kb. háromnegyed óra Frankfurtba).
- **Napi szinkron:** a delta a push után frissíti a változott jogszabályokat.
  KÜLÖN hibaágon: ha a szinkron elhasal, riasztó issue-t nyit, de a delta
  kilépési kódját nem rontja el — az adat-repo integritása előbbre való.
- **Kiemelés-invariáns:** a `kereses()` a találatot vezérlőkarakterekkel jelöli
  (STX/ETX), nem HTML-lel, mert a `ts_headline` nem escape-eli a bemenetét. A
  `<mark>` elemet a React építi. Ezt ne írd vissza nyers HTML-re.
- **Heading nélküli törzs:** 1924 törvény szövegében (ebből 1025 hatályos) nincs
  egyetlen `##`–`####` heading sem — a teljes tartalom heading nélküli törzs
  (jellemzően kihirdető és nemzetközi szerződést becikkelyező törvények). Ezeket
  a bontó 2500 karakteres darabokra vágja bekezdéshatáron, üres `cim` és
  `horgony` mezővel (a találat a jogszabály nevét mutatja, és az oldal tetejére
  linkel). Darabolni KELL: egy 443 KB-os szakasz a hossznormalizált relevanciát
  és a `ts_headline` kiemelést is elrontaná. A headinges szakaszokat viszont nem
  daraboljuk, hogy a mélylink egy §-ra mutasson.
- **Horgony-invariáns:** a `szakaszok.ts` bontója ugyanazt a horgony-id-t adja,
  mint az `apps/web/lib/md.ts` `mdRender()`-e (az ismétlődő címek `-2`, `-3`
  utótagjával együtt). A `test/szakaszok.test.ts` mindkét implementációt
  futtatja és összeveti — ha ez elromlik, a találatok mélylinkje rossz §-ra visz.

## Titkok

Az adat-repóban egy GitHub secret van: **`NYILT_DB_URL`** — a Supabase session
pooler connection stringje a keresőindex-szinkronhoz. Pooler kell (nem a
`db.*.supabase.co` közvetlen host), mert a GitHub-runnerek IPv4-esek, a
közvetlen kapcsolat viszont IPv6. A napi delta ezen kívül a beépített
`GITHUB_TOKEN`-nel fut (contents+issues write).

A secret NEM a `postgres` superuser stringje, hanem a **`jogtar_szinkron`**
szerepé (`03-szinkron-szerep.sql`), amely kizárólag a `jogszabaly` és `szakasz`
táblára írhat — sémát módosítani, más adathoz nyúlni nem tud. Ez azért fontos,
mert a titok jelen van a környezetben, amikor a CI-ben harmadik féltől származó
npm-csomagok kódja fut: egy kiszivárgás így a keresőindexre korlátozódik, ami
amúgy is bármikor újraépíthető. Jelszócserénél futtasd újra a 03-as SQL-t új
jelszóval, és frissítsd a secretet.

A Vercel oldalon `SUPABASE_URL` és `SUPABASE_ANON_KEY` él (Production). A web
csak OLVAS: a két táblán RLS engedi a `select`-et, az írás joga a connection
stringé. A kulcsok szándékosan nem `NEXT_PUBLIC_` előtagúak — a keresés szerver
oldalon fut, így semmi nem kerül belőlük a kliens bundle-be.

A Vercel oldalon él még a `GITHUB_WEBHOOK_SECRET` (Production): az adat-repo
push-webhookjának HMAC-titka (`/api/revalidate`). Ugyanez a titok a
`godavid/magyar-jog` repo webhook-beállításában; cserénél mindkét helyen.

A Vercel-deploy a `remenyfarm` fiókhoz kötött, és **nem automatikus a git
push-ra**: a monorepo GYÖKERÉBŐL `vercel --prod --yes` (root directory: `apps/web`).

## Agent-felület: REST API + MCP-szerver (2026-09-16)

Spec: `docs/superpowers/specs/2026-09-16-agent-felulet-design.md`. Négy read-only
művelet, kulcs nélkül, ugyanabban a Next appban:

| művelet | REST | mire |
|---|---|---|
| `kereses` | `GET /api/v1/kereses?q=` | hivatkozás-feloldás (index) vagy FTS (`kereses_api` SQL), a § teljes szövegével |
| `szakasz` | `GET /api/v1/szakasz?slug=&paragrafus=&datum=` | egy § egy időállapotban; § nélkül meta + időállapotok + tartalomjegyzék |
| `valtozasok` | `GET /api/v1/valtozasok?felveve_utan=&q=` | mi változott — napló-cursorral vagy since/until/slugs szűrővel, érintett §-okkal |
| `diff` | `GET /api/v1/diff?slug=&tol=&ig=` | két időállapot §-szintű diffje |

- **Rétegek:** `packages/szoveg` (megosztott: §-darabolás, horgony, hivatkozás-parser,
  §-diff — a pipeline és a web is innen importál, ez váltotta a két külön implementáció
  bit-egyezés tesztjét), `apps/web/lib/api/*` (szolgáltatásréteg, JSON), `app/api/v1/*`
  (REST, zod-validálás, `Cache-Control: s-maxage`), `app/api/mcp/route.ts` (`mcp-handler`
  2.x, stateless streamable HTTP; a négy tool + ChatGPT `search`/`fetch` alias),
  `app/api/v1/openapi.json`.
- **Felvételi napló:** a delta minden futás végén `index/felvetel/ÉÉÉÉ-HH.jsonl`-be írja a
  bekerült állapotokat (`felveve, slug, datum, sha`). Ez a `valtozasok` cursora — a
  commit-dátum a hatálybalépés, NEM a bekerülés ideje, ezért kell külön napló. Backfill
  nem ír naplót; ha egy hónapra nincs fájl, a végpont a hatálybalépés-ágra esik vissza.
- **AGENTS.md az adat-repóban:** forrása a `sablonok.ts` `AGENTS_MD`; a delta minden
  futáskor kiírja, változásnál az index-utócommitba kerül. Kézzel ne szerkeszd az
  adat-repóban — a következő futás visszaírja.
- **Frissesség:** GitHub push-webhook a `godavid/magyar-jog`-on → `POST /api/revalidate`
  (HMAC, `GITHUB_WEBHOOK_SECRET` Vercel env) → `revalidateTag("adat-repo", "max")`. Az
  adat-cache minden `napi` fetch-e és `unstable_cache`-e ezt a címkét viseli. A REST-
  válaszok CDN-cache-e: `valtozasok` 15 perc, `kereses` 1 óra, `szakasz`/`diff` konkrét
  dátummal 1 nap. Ha a webhook elromlik, a 6 órás revalidate továbbra is frissít.
- **Deploy-változás:** a `workspace:*` függőség miatt a Vercel-projekt root directory-ja
  `apps/web`, és a deploy a **monorepo gyökeréből** indul: `vercel --prod --yes` a
  gitjog gyökérben (nem az `apps/web`-ben — onnan npm-mel próbálna telepíteni és elhasal).
- **SQL:** `04-api-kereses.sql` (`kereses_api`, a § szövegével) és `05-kereses-gyors.sql`
  (a `ts_headline` csak a limitált találatokra fut — a „termőföld" 2,8 s → 70 ms; előtte
  az anon 3 s-os statement_timeout-ja miatt a webes kereső rendszeresen 500-zal esett
  el). Az anon `statement_timeout` 8 s-re emelve. Alkalmazás a superuser pooler-
  stringgel; **2026-09-16-án a 5432-es session pooler helyben nem fogadott
  kapcsolatot, a 6543-as (transaction) igen** — psql-hez az is jó.
- **Registry:** `server.json` a repo gyökerében (`io.github.godavid/gitjog`, GitHub-
  loginnal igazolható névtér). Publikálás: `mcp-publisher login github` (interaktív,
  a felhasználó gépén) majd `mcp-publisher publish`. Új verziónál a `server.json`
  `version` mezőjét is léptesd.
- **Füstteszt deploy után:** `curl "$OLDAL/api/v1/kereses?q=Ptk.+6:272.+§"`,
  `.../szakasz?slug=2013-evi-cxxii-torveny-foldforgalmi`, `.../valtozasok?since=2026-01-01&q=föld`,
  `.../diff?slug=…&tol=…&ig=…`, `.../openapi.json`; MCP: `curl -X POST $OLDAL/api/mcp -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
  `POST /api/revalidate` aláírás nélkül → 401.

## Ismert korlátok

- Lábjegyzetek (módosító hivatkozások) kimaradnak; képi tartalom (Alaptörvény kottái)
  kimarad; dőlt/félkövér formázás elvész; táblázat cellaszinten lapítva (colspan nélkül).
- Az njt időállapot-listája a MÚLTAT is átírhatja (ritkán): a delta az ismert
  dátumokhoz nem nyúl, új múltbeli dátumot viszont felvesz a következő futáskor —
  ilyenkor a commit-dátum (a hatálybalépés napja) helyes marad, csak később került be.
- A réteges enumerálás ára: ha egy már lezárt (hatályát vesztett) jogszabály mégis
  új időállapotot kap az njt-n, az legfeljebb egy körforgásnyi (7 nap) késéssel
  kerül be. A hatályos jogszabályok napi pontossága ettől nem sérül.
- A keresés a jogszabályok SZÖVEGÉBEN, §-címeiben, valamint a jogszabály
  CÍMÉBEN, MEGJELÖLÉSÉBEN és RÖVIDÍTÉSÉBEN is keres (`01-sema.sql` és
  `02-kereses.sql` unió). A jogszabály-cím találatok kiemelt rangsorolással
  közvetlenül a törvény hatályos oldalára mutatnak.

## Átnevezés: Nyílt Jogtár → GitJog (2026-09-16)

A Wolters Kluwer Hungary Kft. védjegyfelszólítása („Jogtár", lajstromszám 207067 és
185290) miatt a projekt neve GitJog lett. Ami változott, és ami szándékosan nem:

- Weboldal: `gitjog.remenyfarm.hu`; a régi `jogtar.remenyfarm.hu` a `next.config.ts`
  host-alapú redirectjével 308-cal az újra mutat (bejövő linkek miatt marad).
- Adat-repo: `godavid/magyar-jogtar` → `godavid/magyar-jog` (a GitHub a régi nevet
  átirányítja, amíg nem jön létre ugyanazon a néven új repó — ne jöjjön).
- Vercel-projekt: `jogtar` → `gitjog`; csomagnevek: `@nyilt-jogtar/*` → `@gitjog/*`
  (a napi-delta.yml mindkét példányában is).
- NEM változott: a Supabase-projekt neve (`nyilt-jogtar`, csak belső), a
  `jogtar_szinkron` DB-szerep, a `NYILT_DB_URL` secret. Ezek nem publikusak.
- A „jogtár" szót a kommunikációban ne használjuk; a WK termékére utaló
  hivatkozás (összehasonlítás) jogszerű, de ne legyen rá szükség.
