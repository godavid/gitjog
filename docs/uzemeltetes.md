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
  NEM kap horgonyt, így a `packages/szoveg/src/szakaszok.ts`-szel közös horgony-invariáns
  sértetlen marad.
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
- **Strukturált adat**: `Legislation` a törvényoldalon (`temporalCoverage` és
  `legislationDateVersion`; `legislationDate` SZÁNDÉKOSAN nincs: az első időállapot a
  hatálybalépés, nem a kihirdetés napja), `Dataset` az `/adatok`-on, `BreadcrumbList` az idővonal- és
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

- `config.ts` — a kiemelt (kézzel gondozott, rövidítéses) `JOGSZABALYOK` lista és az
  njt-konstansok (`NJT_BASE`, `USER_AGENT`, `RATE_LIMIT_MS`). A feldolgozott teljes lista a
  `teljesJogszabalyLista()`: `JOGSZABALYOK` + a generált `data-static/torvenyek.json`
  (documentId-ütközésnél a kiemelt győz). Új törvény: a lista újragenerálása
  (`torvenylista-generalas.ts`, lásd a karbantartó eszközöket lent), majd
  `pnpm backfill -- --folytat` a következő napi delta ELŐTT — backfill nélkül a delta
  szétcsúszás-őre leállítja a napi futást (lásd „Ha törik a parser”). Kiemelt sor
  felvételekor a slug egyezzen a már bent lévővel (ez az URL és az adat-repo
  könyvtárneve), és a `torvenylista-generalas.ts` `KIEMELT_SLUGOK`-jába is kerüljön be
  (ezt teszt nem őrzi).
- `crawl.ts` — njt-letöltés. KRITIKUS tudás: csak a `njt.jog.gov.hu` host működik
  (a `njt.hu` TLS-szinten reseteli a nem böngésző klienseket); HTTP/1.1; azonosítható
  User-Agent. Verziólista: POST `/ajax/collectAllDocumentVersion.json` (form-encoded
  `documentId`). Snapshot: GET `/jogszabaly/{id}.{verzió}`. Nagy törvénynél a szöveg
  egy része lazy-blokk: POST `/ajax/njtGetBlock.json` (JSON, a `borderStart` elemek
  `data-show-order` értékeivel, egy batch-kérésben).
- `parse.ts` + `normalize.ts` — HTML → determinisztikus Markdown. A determinizmus
  szent: azonos bemenet = byte-azonos kimenet, mert a diff-minőség ezen áll.
- `backfill.ts` — egyszeri teljes visszatöltés (lokálisan futtatandó). `pnpm backfill`,
  push-sal: `pnpm backfill -- --push`. NEM létező `data/repo`-t vár (ha a könyvtár
  létezik, akár üresen is, hibával kilép; a helyét a `NYILT_ADAT_REPO_DIR` állítja, alapból
  `<repo-gyökér>/data/repo`); a letöltés `data/cache`-be (`NYILT_CACHE_DIR`) cache-elődik,
  így az újrafuttatás olcsó.
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
- A §-szintű bontás NEM itt él: `@gitjog/szoveg` `szakaszokraBont()`
  (`packages/szoveg/src/szakaszok.ts`) — markdown → §-szintű szakaszok a keresőindexhez;
  a pipeline `kereso-index.ts`-e innen importál. A horgony-generálás az
  `apps/web/lib/md.ts` `mdRender()`-ével bit szerint egyezik (lásd a Keresés szakasz
  horgony-invariánsát).
- `kereso-index.ts` + `kereso-feltoltes.ts` — a keresőindex szinkronja és teljes
  újraépítése (lásd a Keresés szakaszt).
- `health.ts` — riasztás (Issue) + terjedelem-anomália-őr. A riasztás CÍM szerint
  dedupol: azonos című nyitott issue mellett nem nyit újat, más hibafajta viszont
  saját issue-t kap.
- `commit.ts` — dátumhelyes commit-stream (egy commit = egy hatálybalépési nap), itt
  dől el az adat-repo helye (`NYILT_ADAT_REPO_DIR`). `felvetel.ts` — a felvételi napló
  (lásd Agent-felület).
- Karbantartó eszközök (a `packages/pipeline` könyvtárból,
  `NYILT_ADAT_REPO_DIR=<az adat-repo-klón abszolút útja>`-val):
  - `pnpm index-ellenorzes` — az index-fájlok és a per-jogszabály fájlok összevetése;
    csak olvas.
  - `pnpm exec tsx src/index-ujraepites.ts` — a teljes index újraépítése a
    `meta.json`-okból és a git-történetből; ÍR és COMMITOL az adat-repóba (pusholni kézzel
    kell). Index-séma változás után ezt használd, ne kézi szerkesztést.
  - `pnpm exec tsx src/torvenylista-generalas.ts <sitemap.xml> data-static/torvenyek.json`
    — a törvénylista újragenerálása az njt-sitemap letöltött példányából (a
    `torvenyek.json`-t kézzel ne szerkeszd).
  - `src/osztaly-leltar.ts` (a kiemeltek aktuális snapshotjainak ismeretlen njt-osztályai)
    és `src/crawl-teszt.ts` (a Ptk./Btk./Mt. múltbeli állapotainak letöltése cache-be) —
    egyszeri felderítő eszközök, hálózatot használnak.
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
2. Lokálisan reprodukáld (a `packages/pipeline` könyvtárból):
   `pnpm exec tsx src/parse-proba.ts <documentId> <verzió> /tmp/ki.md`
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
     átengedhető, lokálisan, friss adat-repo-klónból (a workflow kézi indításának
     nincs ilyen paramétere):
     `NYILT_ADAT_REPO_DIR=<a klón abszolút útja> NYILT_DB_URL=<a jogtar_szinkron pooler-stringje> pnpm delta -- --anomalia-ok=<slug>`
     (vesszővel több is; alapból pushol az adat-repóba). `NYILT_DB_URL` nélkül ezek
     keresőindexe kimarad, és a későbbi futások sem pótolják (azok csak a saját
     változásaikat szinkronizálják) — akkor utána:
     `NYILT_DB_URL=... NYILT_ADAT_REPO_DIR=<klón> pnpm --filter @gitjog/pipeline kereso-feltoltes -- --slugok=<slug>`.
     A „…módosításáról" végű című törvényeket az őr 2026-08-15 óta magától
     engedékenyebben kezeli (`modositoTorveny()` a `health.ts`-ben): náluk csak az
     5% alatti maradék számít anomáliának, a duzzadás NEM. A módosító törvény
     szakaszai ugyanis a hatálybalépésük napján megjelennek a konszolidált
     szövegben, másnap beépülve kiürülnek — a 2026. évi XVIII. például
     16 590 → 111 538 → 17 225 karakter volt három egymást követő napon, és a régi
     2× felső küszöb ezen akadt el.
     2026-09-30 óta ugyanez a kivétel jár akkor is, ha a változást egy beágyazott
     módosító blokk magyarázza (`modositoBlokkValtozas()`): a „…szövegrész helyébe
     … lép” fordulatok száma a hosszal egy irányba ugrik (≥ 20 db, és ≥ 1 db /
     1000 kar változás). Így a nem „…módosításáról” című, de más törvényeket
     módosító fejezetet tartalmazó törvényeket is átengedi — a 2026. évi XXXIV.
     79 748 → 233 444 → 94 755 kar volt (0 → 718 → 1 „helyébe”), és 2026-09-27-én
     emiatt kellett kézi futás.
   - **„Gyanúsan sok (…) régi vagy előzmény nélküli új állapot — config/repo
     szétcsúszás? Nem commitolok.”** (`szetcsuszasGyanu()` a `health.ts`-ben, küszöb:
     `MAX_GYANUS_UJ` = 50 a `delta.ts`-ben): gyanús az az új állapot, amelynek
     jogszabályához még nincs ismert állapot (a lista bővült backfill nélkül), vagy amely
     30 napnál (`FRISS_NAPOK`) régebben lépett hatályba (sérült/hiányos index). A friss,
     előzménnyel bíró tömeges hatálybalépés (negyedévente; 2026-10-01: ~210 törvény) NEM
     számít. Az `--anomalia-ok` itt nem segít, az őrt ne lazítsd. Teendő: új
     jogszabályoknál `pnpm backfill -- --folytat`; gyanús indexnél
     `NYILT_ADAT_REPO_DIR=<klón> pnpm --filter @gitjog/pipeline index-ellenorzes`.
     <!-- INFERRED: verify -->
   - **„N verziólista-kérés hiúsult meg M-ből — njt-kimaradás vagy blokkolás? Nem
     commitolok.”** (`MAX_HALOZATI_HIBA` = 20 a `delta.ts`-ben): njt-oldali gond; a futás
     semmit nem commitol, a következő újrapróbál. Ha tartós: host, User-Agent és végpontok
     a `crawl.ts`-ben (lásd fent).
   - **Nincs napi futás, és issue sincs:** a workflow lehet letiltva (hosszú backfill
     idejére szokás). Ellenőrzés:
     `gh api repos/godavid/magyar-jog/actions/workflows --jq '.workflows[] | {name, state}'`;
     `disabled_manually` esetén `gh workflow enable napi-delta.yml -R godavid/magyar-jog`.
4. Tesztek, csomagonként (CI ma EGYETLEN tesztet sem futtat — ez lokális lépés):
   `pnpm --filter @gitjog/pipeline test` (parser, normalizáló, őrök), a szövegmodulé
   `pnpm --filter @gitjog/szoveg test`; egy fájl:
   `pnpm --filter @gitjog/pipeline exec vitest run test/normalize.test.ts`. A
   `test/normalize.test.ts` mini fixture-je minden futásban ellenőrzi a determinizmust,
   a golden hashek viszont CSAK akkor futnak, ha a lemez-cache-ben (`data/cache` vagy
   `NYILT_CACHE_DIR`) megvan a négy snapshot (`describe.skipIf`) — friss klónban vagy
   worktree-ben csendben kimaradnak, ott a zöld futás nem bizonyítja a byte-azonos
   kimenetet. Ha a normalizálás SZÁNDÉKOSAN változott, regeneráld a golden hasheket
   (`parse-proba` + `shasum -a 256`) a `packages/pipeline/test/normalize.test.ts`-ben.
   Vigyázz: a golden-változás azt jelenti, hogy a teljes history diffje "ugrik" egyet
   a következő delta-commitnál — kerüld, ha csak lehet.
5. Kézi delta-futtatás ellenőrzésre, majd az issue lezárása.

## Skálázás a törvényekre — KÉSZ (2026-08-01)

A teljes törvényállomány betöltve: **4332 jogszabály, 5404 commit** az adat-repóban,
1254 tétel kihagyva (nincs konszolidált szöveg az njt-n). A lista a sitemapból
generálódik (`torvenylista-generalas.ts` → `data-static/torvenyek.json`, 5585 tétel).

- A backfill folytatható: `pnpm backfill -- --folytat` (meglévő adat-repo-klónban;
  indításkor `git checkout -- .` + `git clean -fdq` fut a klónban — MINDEN commitolatlan
  változást eldob —, a már commitolt (jogszabály, dátum) párokat parse nélkül átugorja,
  500 commitonként és a végén pushol).
- A napi delta ehhez a mérethez a réteges enumerálással igazodik (lásd fentebb).

Ami még hátravan: rendeletek, határozatok (a lista jelenleg csak törvény).

## Keresés (Supabase Postgres FTS)

A weboldal keresője a `nyilt-jogtar` Supabase-projekt Postgres FTS-ét használja
(régió: eu-central-1, a magyar látogatókhoz és a Vercelhez közel). A korábbi
memóriabeli MiniSearch-index ~200 törvényig bírta, ezért volt a keresés a
kiemeltekre szűkítve; ez megszűnt.

- **Séma és lekérdezés:** `packages/pipeline/supabase/` — `01-sema.sql` (táblák, GIN
  index, RLS), `02-kereses.sql` (`kereses()`), `03-szinkron-szerep.sql`
  (`jogtar_szinkron` szerep + írási policyk), `04-api-kereses.sql` (`kereses_api()`),
  `05-kereses-gyors.sql` (a `kereses()` és a `kereses_api()` ÉLŐ, gyors változata:
  felülírja a 02-t és a 04-et). Mind újrafuttatható, de csak SORRENDBEN (01→05): a 02
  vagy a 04 önálló újrafuttatása visszahozza a lassú kiemelést, és a webes kereső
  500-zal esik el. Függvényt a 05-ben (vagy egy új, magasabb sorszámú fájlban) módosíts.
  Ezek nem migrációk: a commit önmagában semmit nem változtat a prod DB-n, kézzel kell
  alkalmazni, a **superuser** pooler-stringgel (a `NYILT_DB_URL` a `jogtar_szinkron`
  szerepé, annak nincs joga a sémához):
  `psql "<superuser pooler-string>" -v ON_ERROR_STOP=1 -f <fájl>` (`ON_ERROR_STOP`
  nélkül a psql hibánál is 0-val lép ki). A 03-hoz `-v szinkron_jelszo="'...'"` is kell —
  új jelszóval újrafuttatva a `NYILT_DB_URL` secretet is cserélni kell (lásd Titkok).
- **Magyar szótövezés:** `to_tsvector('hungarian', …)` — ettől talál a
  „szerződést" a „szerződés" szóra. A generált oszlop csak a KÉTARGUMENTUMOS
  alakot fogadja el (az egyargumentumos nem immutable).
- **Az index származtatott adat.** Bármikor eldobható és újraépíthető: a 01–05 SQL
  sorrendben (lásd fent) + az anon `statement_timeout` (lásd Agent-felület → SQL), majd
  `NYILT_DB_URL=... NYILT_ADAT_REPO_DIR=<az adat-repo-klón abszolút útja> pnpm --filter @gitjog/pipeline kereso-feltoltes`
  (~4332 jogszabály, teljes újraépítés kb. háromnegyed óra Frankfurtba; célzott pótlás:
  `-- --slugok=<slug>,<slug>`). `NYILT_ADAT_REPO_DIR` nélkül a
  `<repo-gyökér>/data/repo`-t olvassa (az `index/jogszabalyok.json`-t és az
  `index/enumeralas.json`-t).
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
- **Horgony-invariáns:** a `packages/szoveg/src/szakaszok.ts` `szakaszokraBont()`-ja
  ugyanazt a horgony-id-t adja, mint az `apps/web/lib/md.ts` `mdRender()`-e (az
  ismétlődő címek `-2`, `-3` utótagjával együtt). A `horgonyId()` közös
  (`@gitjog/szoveg`), az ütközésfeloldás viszont két helyen él, ezért a
  `packages/szoveg/test/szakaszok.test.ts` mindkettőt futtatja és összeveti — ha ez
  elromlik, a találatok mélylinkje rossz §-ra visz. A tesztet ne töröld.

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

A prod deploy **csak a `.github/workflows/release-production.yml`-ből** megy (2026-10-06
óta; helyi gépről a prod deploy tiltott): a main-re érkező, webet érintő push
automatikusan deployol, kézzel `gh workflow run release-production.yml`. Szünet:
`DEPLOY_HOLD=true` repo-változó — `gh variable set DEPLOY_HOLD --body true -R godavid/gitjog`;
folytatás: `gh variable set DEPLOY_HOLD --body false -R godavid/gitjog`, majd
`gh workflow run release-production.yml -R godavid/gitjog` (így megy ki a függőben lévő
main). Claude-ban ugyanez a `/deploy hold|resume` (globális skill, nem ennek a repónak
a része). A workflow-hoz kell a `VERCEL_TOKEN` repo-secret — a `gitjog` projektre
szűkített Vercel-token; a Vercel CLI nem tud ilyet
kiadni (403), a dashboardon kell létrehozni. Git-integráció nincs: a Vercel
GitHub-appja csak a Remeny-Farm orgot látja, a `godavid` fiókot nem.

## Biztonsági scan (2026-09-25)

A repo publikus, és a napi delta a gitjog **main** ágát futtatja írási joggal az
adat-repóban — ami a main-re kerül, az ott kódként fut. Ezért a main védett:

- **Ruleset (`main`):** csak PR-en át (squash), kötelező a `biztonsag` check
  és a CodeQL (high vagy súlyosabb riasztás blokkol), force-push és törlés
  tiltva. A repo-admin megkerülheti — ez vészhelyzetre van, nem napi útnak;
  a közvetlen push után a scan ugyanúgy lefut, és pirosat mutat, ha gond van.
- **`.github/workflows/biztonsag.yml`:** gitleaks a teljes előzményen,
  `pnpm audit --audit-level=high`, PR-en dependency review, zizmor a
  workflow-kra (a `packages/pipeline/adatrepo/napi-delta.yml` forrásra is).
  Hetente ütemezve is fut, hogy az új CVE-k a változatlan kódra is kiderüljenek.
- **GitHub-oldalon:** CodeQL default setup, Dependabot-riasztás és biztonsági
  frissítés-PR-ek, secret scanning + push protection, a `GITHUB_TOKEN`
  alapból csak olvas, külsős fork-PR workflow-ja csak jóváhagyással indul.

Hamis riasztásnál: gitleaks → `.gitleaks.toml` a repo gyökerében (ma még nincs
ilyen fájl). A gitleaks (a `biztonsag.yml` `--config` nélkül hívja) ezt magától
betölti, és `[extend]` alatt `useDefault = true` nélkül a beépített szabálykészlet
HELYETT csak a fájl saját szabályaival fut — a titokkeresés csendben kikapcsolna. Ezért
mindig: `[extend]` / `useDefault = true`, alatta `[[allowlists]]` a konkrét commit
(`commits = [...]`) vagy útvonal (`paths = [...]`), soha nem egész szabály; zizmor → sor
végi `# zizmor: ignore[<audit>]` indoklással; `pnpm audit` → előbb
`overrides` a `pnpm-workspace.yaml`-ban a javított verzióra, csak ha nincs
javítás, akkor `auditConfig.ignoreGhsas` a GHSA-azonosítóval és indokkal.

A `napi-delta.yml` actionjei SHA-ra pinneltek; **módosításkor az adat-repo élő
példányát is frissíteni kell** (lásd a pipeline-szakaszt).

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
  §-diff — a pipeline és a web is innen importál; az `mdRender()` horgony-ütközésfeloldása
  külön él, ezért a bit-egyezés teszt maradt: `packages/szoveg/test/szakaszok.test.ts`),
  `apps/web/lib/api/*` (szolgáltatásréteg, JSON), `app/api/v1/*`
  (REST, zod-validálás, `Cache-Control: s-maxage`), `app/api/mcp/route.ts` (`mcp-handler`
  2.x, stateless streamable HTTP; a négy tool + ChatGPT `search`/`fetch` alias),
  `app/api/v1/openapi.json`.
- **Felvételi napló:** a delta minden futás végén `index/felvetel/ÉÉÉÉ-HH.jsonl`-be írja a
  bekerült állapotokat (`felveve, slug, datum, sha`). Ez a `valtozasok` cursora (ma nem
  veszteségmentes, lásd Ismert korlátok) — a commit-dátum a hatálybalépés, NEM a
  bekerülés ideje, ezért kell külön napló. Backfill nem ír naplót; ha a cursor hónapjától
  máig EGYETLEN havi naplófájl sincs, a végpont a hatálybalépés-ágra esik vissza
  (`mod: "hatalybalepes"`); ha legalább egy van, a napló-ágon marad, a fájl nélküli
  hónapok tételei nélkül.
- **AGENTS.md az adat-repóban:** forrása a `sablonok.ts` `AGENTS_MD`; a delta minden
  olyan futáskor kiírja, amely új időállapotot vesz fel (az index-utócommitba kerül) —
  új időállapot nélküli futás nem frissíti. Kézzel ne szerkeszd az adat-repóban — a
  következő ilyen futás visszaírja.
- **Frissesség:** GitHub push-webhook a `godavid/magyar-jog`-on → `POST /api/revalidate`
  (HMAC, `GITHUB_WEBHOOK_SECRET` Vercel env) → `revalidateTag("adat-repo", "max")`. Az
  adat-cache minden `napi` fetch-e és `unstable_cache`-e ezt a címkét viseli. A REST-
  válaszok CDN-cache-e (`s-maxage`, mindegyiken `stale-while-revalidate=86400`):
  `valtozasok` 15 perc, `kereses` 1 óra, `diff` 1 nap; `szakasz` múltbeli `datum`-mal
  1 nap, mai vagy jövőbeli `datum`-mal 15 perc, `datum` nélkül 1 óra
  (`apps/web/lib/api/cache-ido.ts`). Ha a webhook elromlik, a 6 órás revalidate
  továbbra is frissít.
- **Deploy-változás:** a `workspace:*` függőség miatt a Vercel-projekt root directory-ja
  `apps/web`, és a build a **monorepo gyökeréből** indul (nem az `apps/web`-ben — onnan
  npm-mel próbálna telepíteni és elhasal): `vercel build`, majd `vercel deploy --prebuilt`
  — ezt futtatja a `release-production.yml`.
- **SQL:** `04-api-kereses.sql` (`kereses_api`, a § szövegével) és `05-kereses-gyors.sql`
  (a `ts_headline` csak a limitált találatokra fut — a „termőföld" 2,8 s → 70 ms; előtte
  az anon 3 s-os statement_timeout-ja miatt a webes kereső rendszeresen 500-zal esett
  el). Az anon `statement_timeout` 8 s-re emelve — ez NINCS benne egyik SQL-fájlban sem:
  új vagy újraépített DB-n kézzel kell beállítani (superuserrel:
  `alter role anon set statement_timeout = '8s';`, majd `notify pgrst, 'reload config';`
  <!-- INFERRED: verify -->), ellenőrzés:
  `select rolconfig from pg_roles where rolname = 'anon';`. Alkalmazás a superuser
  pooler-stringgel (lásd Keresés → Séma és lekérdezés); **2026-09-16-án a 5432-es
  session pooler helyben nem fogadott kapcsolatot, a 6543-as (transaction) igen** —
  psql-hez az is jó.
- **Registry:** `server.json` a repo gyökerében (`io.github.godavid/gitjog`), 2026-09-16-án
  publikálva (1.0.0, `active`). A `mcp-publisher login github` eszközkódos böngészős
  jóváhagyást kér, de nem kell: a `gh auth token` GitHub-tokenje a registry
  `POST /v0/auth/github-at` végpontján registry-JWT-re cserélhető, azzal megy a
  `POST /v0.1/validate` és `POST /v0.1/publish` (`--data-binary @server.json`). Új
  verziónál a `server.json` `version` mezőjét léptesd, majd ugyanez a két hívás.
  Ellenőrzés: `GET /v0.1/servers/io.github.godavid%2Fgitjog/versions/<verzió>`.
- **Rate limit:** Vercel Firewall-szabály `API rate limit (v1 + mcp)`, 120 kérés/perc/IP —
  a 2026-09-25-i állapot szerint csak `log` módban (nem blokkol). Az élesítés (`rate_limit`
  akció) owner-döntés; előtte a dashboardon a forgalmat kell nézni.
- **Ha egy § „nincs”:** csak ~36 törvénynek van rövidítése az indexben, és sok
  törvényben a §-ok nem headingek — ezt a `paragrafusKivag()` (`@gitjog/szoveg`) és a
  `ROVIDITES_ALIAS` (`apps/web/lib/api/kereses.ts`) hidalja át; előbb ezeket nézd.
- **Füstteszt deploy után:** `curl "$OLDAL/api/v1/kereses?q=Ptk.+6:272.+§"`,
  `.../szakasz?slug=2013-evi-cxxii-torveny-foldforgalmi`, `.../valtozasok?since=2026-01-01&q=termőföld|földek+forgalm|Földalap`,
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
  CÍMÉBEN, MEGJELÖLÉSÉBEN és RÖVIDÍTÉSÉBEN is keres (a `01-sema.sql` két `tsv`
  oszlopa; a két tábla találatait az élő `kereses()` — `05-kereses-gyors.sql` —
  egyesíti). A jogszabály-cím találatok kiemelt rangsorolással
  közvetlenül a törvény hatályos oldalára mutatnak.
- A `valtozasok` `felveve_utan` cursora jelenleg NEM veszteségmentes: a következő
  cursor a lap legnagyobb `felveve`-je, a szűrés szigorú `>`, ezért ha a lap határa egy
  azonos `felveve` időbélyegű köteg (egy napi futás akár 200+ sora) közepére esik, a
  köteg maradékát a következő lap már nem adja vissza (#26, nyitott; 2026-10-21-i élő
  repro: 221-ből 171 tétel kimaradt). Amíg nincs javítva, ne írd le és ne ajánld
  veszteségmentesnek; a javítás módja az issue-ban nyitott kérdés.

## Átnevezés: Nyílt Jogtár → GitJog (2026-09-16)

A Wolters Kluwer Hungary Kft. védjegyfelszólítása („Jogtár", lajstromszám 207067 és
185290) miatt a projekt neve GitJog lett. Ami változott, és ami szándékosan nem:

- Weboldal: `gitjog.remenyfarm.hu` — 2026-09-23 óta ez az EGYETLEN link mindenhol. A
  régi `jogtar.remenyfarm.hu`-ra a `next.config.ts` host-alapú (308-as) redirectje kész,
  de a DNS-rekord 2026-09-16 óta nincs (NXDOMAIN), így az átirányítás ma nem él. Döntés
  (owner, 2026-09-23): a régi címet ne használd, a DNS-ének helyreállítását ne javasold,
  és ne jelentsd hibaként.
- Adat-repo: `godavid/magyar-jogtar` → `godavid/magyar-jog` (a GitHub a régi nevet
  átirányítja, amíg nem jön létre ugyanazon a néven új repó — ne jöjjön).
- Vercel-projekt: `jogtar` → `gitjog`; csomagnevek: `@nyilt-jogtar/*` → `@gitjog/*`
  (a napi-delta.yml mindkét példányában is).
- NEM változott: a Supabase-projekt neve (`nyilt-jogtar`, csak belső), a
  `jogtar_szinkron` DB-szerep, a `NYILT_DB_URL` secret. Ezek nem publikusak.
- A „jogtár" szót a kommunikációban ne használjuk; a WK termékére utaló
  hivatkozás (összehasonlítás) jogszerű, de ne legyen rá szükség.
