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

Ami még hátravan:
1. A weboldal keresője (MiniSearch, memóriában) ~200 törvényig bírja, ezért a teljes
   szövegű keresés ÁTMENETILEG a kiemelt (rövidítéses) törvényekre szűkítve fut
   (`apps/web/lib/kereso.ts`); a kereső-oldal ezt jelzi. Terv: Postgres FTS (Supabase).
2. Rendeletek, határozatok (a lista jelenleg csak törvény).

## Titkok

Nincsenek. A napi delta a beépített `GITHUB_TOKEN`-nel fut (contents+issues write),
a weboldal publikus adatot olvas. A Vercel-deploy a `remenyfarm` fiókhoz kötött.

## Ismert korlátok

- Lábjegyzetek (módosító hivatkozások) kimaradnak; képi tartalom (Alaptörvény kottái)
  kimarad; dőlt/félkövér formázás elvész; táblázat cellaszinten lapítva (colspan nélkül).
- Az njt időállapot-listája a MÚLTAT is átírhatja (ritkán): a delta az ismert
  dátumokhoz nem nyúl, új múltbeli dátumot viszont felvesz a következő futáskor —
  ilyenkor a commit-dátum (a hatálybalépés napja) helyes marad, csak később került be.
- A réteges enumerálás ára: ha egy már lezárt (hatályát vesztett) jogszabály mégis
  új időállapotot kap az njt-n, az legfeljebb egy körforgásnyi (7 nap) késéssel
  kerül be. A hatályos jogszabályok napi pontossága ettől nem sérül.
