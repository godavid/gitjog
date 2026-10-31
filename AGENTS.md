# GitJog — belépő agenteknek

A magyar törvények szövege és változástörténete git-ben. Ez a kód-repo
(`godavid/gitjog`): crawler, normalizáló, pipeline, weboldal, REST API és
MCP-szerver. Az adat a külön publikus adat-repóban él (`godavid/magyar-jog`).
Ez a fájl az egyetlen belépési pont; a `CLAUDE.md` erre mutató symlink.

Ellenőrizve a kóddal: 2026-10-27.

## Olvasási sorrend

1. Ez a fájl: deploy, tilalmak, parancsok, invariánsok, szótár.
2. [PRODUCT.md](PRODUCT.md) — közönség, termékhatár, márkaszabály. Az
   `<!-- impeccable:product-schema 1 -->` jelölőt és a `##` címeket ne módosítsd.
3. [docs/uzemeltetes.md](docs/uzemeltetes.md) — az üzemeltetés igazságforrása:
   pipeline, parser-hiba, keresés, titkok, deploy, biztonsági scan, agent-felület,
   átnevezés. Pipeline-, SQL-, cache- vagy deploy-munka előtt olvasd el az érintett
   szakaszát.
4. [DESIGN.md](DESIGN.md) — csak UI-munkához.
5. [docs/superpowers/](docs/superpowers/) — leszállított munkák (keresés,
   agent-felület) lezárt tervei és specjei. Történeti rekordok, nem utasítások: a
   nyitott jelölőnégyzeteik és a deploy- vagy push-lépéseik érvénytelenek.

## Landolás és deploy

- A `main` védett (GitHub ruleset): csak PR, csak squash; kötelező a `biztonsag`
  check és a CodeQL. Az admin megkerülheti, de az csak vészhelyzetre van.
- A zöld PR csak a biztonsági ellenőrzéseket bizonyítja: a CI nem futtat tesztet és
  típusellenőrzést. Merge előtt futtasd a változott csomag tesztjét (Parancsok).
- A napi delta (03:30 UTC) a `godavid/gitjog` main ágát futtatja írási joggal az
  adat-repóban: ami a main-re kerül, az ott kódként fut.
- A prod deploy CSAK a
  [`release-production.yml`](.github/workflows/release-production.yml)-ből megy.
  A main-re érkező push indítja, ha `apps/web/**`, `packages/szoveg/**`, a gyökér
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` vagy maga a workflow
  változott: a merge tehát élesít. A `packages/pipeline` változása nem deployol.
  Kézi indítás: `gh workflow run release-production.yml -R godavid/gitjog`.
- Szünet: `DEPLOY_HOLD=true` repo-változó
  (`gh variable set DEPLOY_HOLD --body true -R godavid/gitjog`; feloldás: `--body false`).
- Adatváltozáshoz nem kell deploy: az adat-repo push-webhookja (`/api/revalidate`)
  frissíti a cache-t.

## Ne tedd (a legdrágább elöl)

`[kapu]` = gépi eszköz kikényszeríti; a többit csak ez a lista és a kódkomment őrzi.

| # | Ne tedd | Miért | Helyette |
|---|---|---|---|
| 1 | Helyi prod deploy (`vercel --prod`, `vercel deploy` az `apps/web`-ből) | 2026-10-06 óta tilos; az `apps/web`-ből a `workspace:*` függőség miatt el is hasal | merge a main-re, vagy `gh workflow run release-production.yml -R godavid/gitjog` |
| 2 | Közvetlen push a main-re `[kapu: ruleset]` | a napi delta a main kódját írási joggal futtatja | PR, squash, zöld `biztonsag` + CodeQL |
| 3 | A `napi-delta.yml` egyik példányának módosítása | az élő példány a `godavid/magyar-jog/.github/workflows/`-ban fut; a kettő byte-azonos | mindkettőt egy körben; ha az élőhöz nem nyúlhatsz, a PR-ben írd le, hogy frissíteni kell |
| 4 | A `02-kereses.sql` vagy `04-api-kereses.sql` önálló újrafuttatása | a `05-kereses-gyors.sql` mindkét függvényt (`kereses`, `kereses_api`) felülírja; az újrafuttatás a régi, lassú változatot állítja vissza (2026-09-16-án ez 500-at okozott) | módosítás a `05`-ben vagy új, magasabb sorszámú fájlban; teljes újraépítésnél 01→05 sorrendben (a `03`-hoz `-v szinkron_jelszo=…` kell) |
| 5 | Mellékes változás a normalizálás kimenetében | a teljes history diffje „ugrik” egyet a következő delta-commitnál | kerüld; ha szándékos, a golden hasheket lemez-cache-es gépen generáld újra, és írd le a PR-ben |
| 6 | Az `index/allapotok.json` lekérését `revalidate`-re állítani; a `CACHE_VERZIO` léptetését kihagyni | a Next adat-cache 2 MB-os limitje miatt némán elavult adat jön (2026-08-10) | `no-store` + `unstable_cache`; ha egy cache-elt eredmény tartalma változik, léptesd az `apps/web/lib/adat.ts` `CACHE_VERZIO`-ját |
| 7 | HTML (`<mark>`) a keresési kiemelésben, `dangerouslySetInnerHTML` a találatra | a `ts_headline` nem escape-el: XSS | STX/ETX (`chr(2)`/`chr(3)`); a `<mark>`-ot a React építi (`apps/web/app/kereses/page.tsx`) |
| 8 | Kliens oldali diff (`"use client"` a `DiffNezet`-ben) | a Bing és az AI-crawlerek nem futtatnak JS-t: a diff-oldalak kiesnek az indexből | a `DiffNezet` szerver-komponens marad |
| 9 | Az adat-repo `AGENTS.md`-jének kézi szerkesztése `[kapu: a következő, új időállapotot felvevő delta-futás visszaírja]` | a módosítás elvész | a `packages/pipeline/src/sablonok.ts` `AGENTS_MD` sablonját módosítsd (angolul) |
| 10 | A régi márkanév szava új doksiban, commitban, UI-ban | védjegyfelszólítás (2026-09-16), lásd [PRODUCT.md](PRODUCT.md) Brand Commitments | GitJog; a régi azonosítók maradnak (Szótár) |

## Parancsok

Node >= 24, pnpm; a repo gyökeréből, ha nincs más jelölve.

- Telepítés: `pnpm install --frozen-lockfile`
- Teszt csomagonként: `pnpm --filter @gitjog/szoveg test`, `pnpm --filter @gitjog/pipeline test`
  (vitest), `pnpm --filter @gitjog/web test` (`node --test`); mind: `pnpm test`. A 4
  golden-hash teszt csak lemez-cache mellett fut (`data/cache` vagy `NYILT_CACHE_DIR`),
  nélküle kimarad.
- Típusellenőrzés: `pnpm --filter @gitjog/szoveg exec tsc` (tiszta).
  `pnpm --filter @gitjog/pipeline exec tsc --noEmit` ma 7 ismert hibát ad: 6× TS2835 a
  `packages/szoveg/src/index.ts` kiterjesztés nélküli importjaira (NodeNext alatt), és
  1× TS7006 a `kereso-index.ts`-ben, ami ezekből következik. Csak az ezeken felüli hiba a
  tiéd. A web típusait csak a release `next build`-je ellenőrzi, a merge UTÁN:
  típushibánál a deploy elbukik, és a prod a régi verzión marad.
- Delta helyben: `NYILT_ADAT_REPO_DIR=<adat-repo-klón> pnpm delta -- --no-push`; valós
  rövidülés egyszeri átengedése: `pnpm delta -- --anomalia-ok=<slug>[,<slug>]`.
- Backfill: `pnpm backfill` (`-- --push`; folytatás: `-- --folytat`). Előfeltételek: az
  üzemeltetési leírás „A pipeline” szakasza.
- Parser-próba (a `packages/pipeline`-ból):
  `pnpm exec tsx src/parse-proba.ts <documentId> <verzió> <kimenet.md>`
- Keresőindex újraépítése: `NYILT_DB_URL=… pnpm --filter @gitjog/pipeline kereso-feltoltes`
  (részleges: `-- --slugok=<slug>,<slug>`).

## Invariánsok és őreik

| Invariáns | Hol él | Mi őrzi |
|---|---|---|
| Determinizmus: azonos njt-bemenet → byte-azonos Markdown | `packages/pipeline/src/parse.ts`, `normalize.ts` | `packages/pipeline/test/normalize.test.ts` (a mini fixture mindig; a golden hashek csak lemez-cache mellett) |
| Horgony: a `szakaszokraBont()` horgonya bit szerint egyezik az `mdRender()`-ével (`-2`, `-3` utótagokkal) | `packages/szoveg/src/szakaszok.ts`, `apps/web/lib/md.ts` | `packages/szoveg/test/szakaszok.test.ts` |
| XSS: minden szövegcsomópont `esc()`-en megy át; a horgony-id `[a-z0-9-]` | `apps/web/lib/md.ts` | csak a kódkomment (teszt nincs) |
| Keresési kiemelés STX/ETX, nem HTML | `packages/pipeline/supabase/02-`, `04-`, `05-*.sql`; `apps/web/app/kereses/page.tsx` | csak komment |
| Rossz adat nem kerül az adat-repóba: szerkezeti hibánál a delta semmit nem commitol, terjedelem-anomáliánál az érintett jogszabályt kihagyja | `packages/pipeline/src/delta.ts`, `health.ts` | `packages/pipeline/test/health.test.ts` (terjedelem-őr, szétcsúszás-őr, parser-őrfeltételek; a delta commit-elhagyó ága maga teszteletlen) |
| Az index-szinkron hibája nem buktatja a deltát | `delta.ts` `keresoIndexSzinkron()` | csak a kód |
| A diff szerver oldalon renderel | `apps/web/components/DiffNezet.tsx` | csak a kódkomment |
| A `napi-delta.yml` két példánya byte-azonos | `packages/pipeline/adatrepo/napi-delta.yml` ↔ `godavid/magyar-jog` | kézi |

## Kódterületek és importszabályok

| Terület | Cél | Importálhat | Nem importálhat | Import-stílus |
|---|---|---|---|---|
| `packages/szoveg/src` | tiszta, I/O nélküli szövegmodul (§-bontás, horgony, hivatkozás, §-diff); a pipeline és a web közös forrása | `diff`, saját fájlok | `node:*` I/O, `next`, `react`, pipeline, `apps/web` | relatív, kiterjesztés nélkül (Bundler) |
| `packages/pipeline/src` | njt-crawler, parser, normalizáló, commit-pipeline, delta/backfill, keresőindex-szinkron | `@gitjog/szoveg`, `cheerio`, `domhandler` (csak típus), `postgres`, `node:*` | `apps/web`, `next`, `@supabase/supabase-js` | relatív import `.js`-sel (NodeNext) |
| `packages/pipeline/supabase` | a keresőindex SQL-je: kézzel, `psql`-lel futtatott, újrafuttatható szkriptek, nem migrációk | – | – | – |
| `packages/pipeline/adatrepo` | az élő adat-repo `napi-delta.yml`-jének forrása | – | – | byte-azonos az élővel |
| `apps/web` | Next 16 oldal; a `lib/api/*` a szolgáltatásréteg, az `app/api/v1/*` és az `app/api/mcp` csak ezt hívja | `@gitjog/szoveg`, `next`, `react`, `zod`, `mcp-handler`, `@vercel/analytics`, `@supabase/supabase-js` és `node:*` (csak szerveren) | `packages/pipeline/**` (a változása nem deployolna), `NEXT_PUBLIC_` titok | `@/` alias, kiterjesztés nélkül |

Kivételek: a `node --test` alatt futó `apps/web/lib/**/*.test.ts` `.ts`-kiterjesztéssel
importál, és csak import nélküli modult tesztelhet. A `packages/szoveg/test` importálhatja
az `apps/web/lib/md.ts`-t (horgony-egyezés teszt).

Ne szerkeszd kézzel: `pnpm-lock.yaml`; `packages/pipeline/data-static/torvenyek.json`
(`torvenylista-generalas.ts` írja); `apps/web/next-env.d.ts`; az `apps/web/` alatti
`AGENTS.md` és `CLAUDE.md` (a `next dev` hozza létre, gitignore-olt: olvasható
Next-útmutató, de ne commitold); az `apps/web/public/` IndexNow-kulcsfájlját (ne nevezd át).

## Nyelv és kód

- Doksi, azonosító, komment, commit, PR és felhasználói szöveg: magyar. Angol csak a
  külső agenteknek szóló szöveg: `packages/pipeline/src/sablonok.ts` `AGENTS_MD`,
  `server.json`.
- Nincs `any` típus; adatalakhoz `interface` a fájl tetején.
- Commit: magyar, javításnál `fix(<terület>): …`; a squash-merge `(#szám)`-ot fűz hozzá.

## Szótár

- **kód-repo** = `godavid/gitjog` (ez); **adat-repo** = `godavid/magyar-jog`. Régi neve
  `magyar-jogtar`: a GitHub átirányítja, ezért azon a néven új repót ne hozz létre.
- Szándékosan megtartott régi azonosítók, NE nevezd át őket: Supabase-projekt
  `nyilt-jogtar`, DB-szerep `jogtar_szinkron`, env `NYILT_DB_URL`, `NYILT_ADAT_REPO_DIR`,
  `NYILT_CACHE_DIR`, `NYILT_CSAK`. A régi csomag-scope (`@nyilt-jogtar/*`) ma `@gitjog/*`.
- **időállapot** = egy jogszabály egy hatálybalépési napra érvényes szövege = egy commit.
  A commit dátuma a hatálybalépés napja, nem a bekerülésé; a bekerülést a **felvételi
  napló** (`index/felvetel/ÉÉÉÉ-HH.jsonl`) rögzíti. Az njt **verziószáma** nem monoton a
  dátummal: sorrendezéshez a dátumot használd.
- **documentId** = njt-azonosító (`ÉÉÉÉ-SZÁM-00-00`); **slug** = URL és könyvtárnév az
  adat-repóban; **megjelölés** = hivatalos név („2013. évi V. törvény”).
- **kiemelt** = a `packages/pipeline/src/config.ts` `JOGSZABALYOK` kézzel gondozott
  tétele; ütközésnél győz a generált lista felett. **réteg** = `aktiv` | `lezart` |
  `nincs-szoveg` (enumerálás, `enumeralas.ts`).
- **delta** = napi növekmény (Actions, az adat-repóban); **backfill** = egyszeri vagy
  folytatólagos visszatöltés (helyben).
- UI-terminológia (kötelező): *időállapot*, *megjelölés*, *hatályos szöveg*,
  *mi változott?*, *hatálybalépés*.

## Ütközés esetén

1. A kód, a workflow-k és a GitHub-ruleset az igazság.
2. Utána `docs/uzemeltetes.md` (üzemeltetés, deploy, titkok), majd `PRODUCT.md`
   (termékdöntések), majd `DESIGN.md` (UI).
3. Ez a fájl a Kódterületek és a Nyelv szakaszban hiteles; máshol összefoglaló, ott
   a 2. pont forrása győz.
4. A `docs/superpowers/` rekordjai történetiek: ha ellentmondanak, nem érvényesek.

Ellentmondást ugyanabban a PR-ben javíts, a kódhoz igazítva; ne válassz csendben.
