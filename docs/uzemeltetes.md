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

## Skálázás a teljes joganyagra (4326 jogszabály)

1. A `config.ts` listát generálni kell kézi felsorolás helyett: az njt keresője
   (`/search_kozismert/*` engedélyezett; a teljes lista módszerét fel kell deríteni).
2. A backfill futásideje a snapshotszámmal skálázik (~1,3 s/kérés). A teljes korpusz
   becsült 100–200 ezer snapshot → hetekig futó lokális/VPS folyamat, szakaszolva
   (a cache miatt megszakítható-folytatható; a backfillt jogszabály-kötegekre bontva
   érdemes futtatni és szakaszonként pusholni).
3. A weboldal keresője (MiniSearch, memóriában) ~200 törvényig bírja; utána Postgres
   FTS (Supabase) a terv (FABLE-PROMPT 7. fázis).

## Titkok

Nincsenek. A napi delta a beépített `GITHUB_TOKEN`-nel fut (contents+issues write),
a weboldal publikus adatot olvas. A Vercel-deploy a `remenyfarm` fiókhoz kötött.

## Ismert korlátok

- Lábjegyzetek (módosító hivatkozások) kimaradnak; képi tartalom (Alaptörvény kottái)
  kimarad; dőlt/félkövér formázás elvész; táblázat cellaszinten lapítva (colspan nélkül).
- Az njt időállapot-listája a MÚLTAT is átírhatja (ritkán): a delta az ismert
  dátumokhoz nem nyúl, új múltbeli dátumot viszont felvesz a következő futáskor —
  ilyenkor a commit-dátum (a hatálybalépés napja) helyes marad, csak később került be.
