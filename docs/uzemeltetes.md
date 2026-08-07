# Nyílt Jogtár — üzemeltetési leírás

## Áttekintés

| Mi | Hol |
|---|---|
| Kód (crawler, parser, pipeline, weboldal) | `godavid/gitjog` (ez a repo) |
| Adat (jogszabályok + git-history) | `godavid/magyar-jogtar` (publikus) |
| Weboldal | `jogtar.remenyfarm.hu` (Vercel, projekt: `jogtar`, scope: `remenyfarm`) |
| Napi frissítés | GitHub Actions az adat-repóban (`.github/workflows/napi-delta.yml`), 03:30 UTC |
| Riasztás | GitHub Issue az adat-repóban, `parser-riasztas` címkével (a GitHub emailt küld) |

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
  A térkép első feltöltése a lemez-cache-ből: `pnpm --filter @nyilt-jogtar/pipeline
  enumeralas-init [-- --push]` (a backfill után; utána a delta tartja karban).
  Ha a fájl hiányzik vagy sérült, a delta a teljes végigjárásra esik vissza —
  lassabb, de nem hagy ki adatot.
- `szakaszok.ts` — markdown → §-szintű szakaszok a keresőindexhez. A horgony-
  generálás az `apps/web/lib/md.ts` `mdRender()`-ével bit szerint egyezik (lásd
  a Keresés szakasz horgony-invariánsát).
- `kereso-index.ts` + `kereso-feltoltes.ts` — a keresőindex szinkronja és teljes
  újraépítése (lásd a Keresés szakaszt).
- `health.ts` — riasztás (Issue) + terjedelem-anomália-őr.

## Ha törik a parser (njt-átdizájn)

Tünet: piros napi delta futás + `parser-riasztas` issue. A delta ilyenkor SEMMIT nem
commitol — rossz adat nem kerülhet a repóba.

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
  `NYILT_DB_URL=... pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes`
  (~4332 jogszabály, teljes újraépítés kb. háromnegyed óra Frankfurtba).
- **Napi szinkron:** a delta a push után frissíti a változott jogszabályokat.
  KÜLÖN hibaágon: ha a szinkron elhasal, riasztó issue-t nyit, de a delta
  kilépési kódját nem rontja el — az adat-repo integritása előbbre való.
- **Kiemelés-invariáns:** a `kereses()` a találatot vezérlőkarakterekkel jelöli
  (STX/ETX), nem HTML-lel, mert a `ts_headline` nem escape-eli a bemenetét. A
  `<mark>` elemet a React építi. Ezt ne írd vissza nyers HTML-re.
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

A Vercel-deploy a `remenyfarm` fiókhoz kötött, és **nem automatikus a git
push-ra**: `cd apps/web && vercel --prod --yes`.

## Ismert korlátok

- Lábjegyzetek (módosító hivatkozások) kimaradnak; képi tartalom (Alaptörvény kottái)
  kimarad; dőlt/félkövér formázás elvész; táblázat cellaszinten lapítva (colspan nélkül).
- Az njt időállapot-listája a MÚLTAT is átírhatja (ritkán): a delta az ismert
  dátumokhoz nem nyúl, új múltbeli dátumot viszont felvesz a következő futáskor —
  ilyenkor a commit-dátum (a hatálybalépés napja) helyes marad, csak később került be.
- A réteges enumerálás ára: ha egy már lezárt (hatályát vesztett) jogszabály mégis
  új időállapotot kap az njt-n, az legfeljebb egy körforgásnyi (7 nap) késéssel
  kerül be. A hatályos jogszabályok napi pontossága ettől nem sérül.
