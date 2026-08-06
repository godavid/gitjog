# Teljes szövegű keresés a teljes törvényállományra — terv

Készült: 2026-08-06 · Állapot: jóváhagyott terv, implementáció előtt

## Miért

A weboldal keresője ma memóriabeli MiniSearch-index, amely a 37 kiemelt
(rövidítéses) törvényre van szűkítve — a `kereso.ts` `epit()` függvényében ez
ÁTMENETI korlátozásként van jelölve, és a keresőoldal ki is írja a látogatónak.
A backfill befejeztével az adat-repóban 4332 törvény hatályos szövege él, ezekre
a keresés nem működik. A MiniSearch nem skálázható ide: a korpusz 240 MB, ami
sem a Vercel-függvény memóriájába, sem ésszerű hidegindítási időbe nem fér bele.

## Mért kiindulási adatok

| Mérőszám | Érték |
|---|---|
| Jogszabály az adat-repóban | 4332 |
| Ebből hatályos / hatályát vesztette | 2036 / 2296 |
| Hatályos szöveg mérete | 185 MB |
| Hatálytalan szöveg mérete | 55 MB |
| Szakasz-heading (`##`–`####`) összesen | 89 780 |
| Időállapotok száma (nem indexeljük) | 26 914 |

## Döntések

1. **Hosztolt Postgres FTS a Supabase Pro-n** ($25/hó, 8 GB). Indok: a magyar
   szótövezés (`to_tsvector('hungarian', …)`) beépítve jár, és ez az egyetlen ok,
   amiért ez a funkció egyáltalán értékes — „szerződést" és „szerződéssel"
   ugyanarra kell találjon. A Cloudflare D1 (SQLite FTS5) olcsóbb lett volna, de
   nincs benne magyar tövező; a statikus (Pagefind) index ekkora korpuszon
   50–80 MB fragmentet és gyenge magyar kezelést jelentett volna.
2. **Csak a hatályos szöveg indexelődik**, időállapotonkénti (jogtörténeti)
   keresés nincs. Az utóbbi ~1,5 GB lenne, és önálló projekt.
3. **Kulcsszavas keresés magyar szótövezéssel, idézőjelben pontos kifejezéssel.**
   Nincs elgépelés-tűrés (pg_trgm) és nincs szemantikus (pgvector) keresés.
4. **Alapból csak hatályos törvényekben keres**, kapcsolóval a teljes állományra
   kiterjeszthető. A hatálytalan találat jelölést kap.

### Nem cél (YAGNI)

Szemantikus keresés · elgépelés-tűrés · időállapotok közti keresés · lapozás a
top 40 fölött · saját relevancia-hangolás a `ts_rank_cd`-n túl · keresés a
jogszabályok címére külön felületen (a §-index ezt lefedi).

## Architektúra

Az adat-repo marad az igazság forrása. A Postgres **származtatott index**, amely
bármikor eldobható és újraépíthető — ez a tulajdonság a hibatűrés alapja.

```
magyar-jogtar (git)              Supabase Postgres           Vercel (Next.js)
  jogszabalyok/*/szoveg.md  ──►   jogszabaly  (4332 sor)  ◄──RPC──  /kereses
  index/jogszabalyok.json         szakasz     (~100e sor)
  index/enumeralas.json  ─────►     └─ GIN index a tsvectoron
     (hatályosság)
```

### Adatmodell

```sql
create table jogszabaly (
  slug        text primary key,
  document_id text not null,
  megjeloles  text not null,
  cim         text not null,
  rovidites   text,
  hatalyos    boolean not null
);

create table szakasz (
  id       bigserial primary key,
  slug     text not null references jogszabaly(slug) on delete cascade,
  sorszam  int  not null,          -- sorrend a törvényen belül
  cim      text not null,          -- pl. "6:272. § [Megbízási szerződés]"
  horgony  text not null,          -- mélylink-fragment
  szoveg   text not null,
  hatalyos boolean not null,       -- denormalizált: a szűrés join nélkül megy
  tsv tsvector generated always as (
    setweight(to_tsvector('hungarian', cim), 'A') ||
    setweight(to_tsvector('hungarian', szoveg), 'B')
  ) stored
);

create index szakasz_tsv_idx  on szakasz using gin (tsv);
create index szakasz_slug_idx on szakasz (slug);
```

A `setweight` adja azt, amit ma a MiniSearch `boost: { szakasz: 3 }`-mal: a
§-címben talált szó többet ér a törzsszövegnél.

**Buktató, amit tudni kell:** a generált oszlop csak IMMUTABLE kifejezést fogad
el. A `to_tsvector('hungarian', …)` **kétargumentumos** alakja immutable, az
egyargumentumos (`to_tsvector(szoveg)`) viszont csak stable, mert az aktuális
`default_text_search_config`-tól függ — azzal a tábla létrehozása elszáll.

Becsült méret: 240 MB szöveg + 60–95 MB tsvector + 70–120 MB GIN index ≈
**400–450 MB**, a 8 GB-os kereten belül bőven.

### A keresés adatbázisfüggvényként

A lekérdezés a DB-ben él, nem a webalkalmazásban összefércelt SQL-ként:

```sql
kereses(q text, mind boolean default false, talalat_limit int default 40)
```

- `websearch_to_tsquery('hungarian', q)` — több szó AND-del, idézőjelben pontos
  kifejezés (frázis-operátor), mínusz jellel kizárás. Ezt a Postgres adja készen.
- rendezés `ts_rank_cd(tsv, query)` szerint (a cover density hosszú
  szakaszszövegnél jobb, mint a sima `ts_rank`)
- részlet `ts_headline`-nal, a valódi találat köré vágva
- `mind = false` esetén `where hatalyos`

Visszatérési oszlopok: `slug, megjeloles, rovidites, jogszabaly_cim,
szakasz_cim, horgony, reszlet, hatalyos`. A `cim` nevet szándékosan kerüljük a
visszatérésben, mert a két táblában mást jelent (a `szakasz.cim` a §-cím, a
`jogszabaly.cim` a törvény címe). A web ebből állítja elő a mai találati elemet:
a fejléc `rovidites ?? megjeloles`, alatta a §-cím és a kiemelt részlet.

### Indexelő pipeline

A `szakaszokraBont` logika **átkerül** az `apps/web/lib/kereso.ts`-ből a
`packages/pipeline`-ba. Ez nettó egyszerűsödés: a web többé nem épít indexet, a
mai `kereso.ts` java része törlődik, és a bontó logika nem lesz két helyen.

- **Kezdeti feltöltés:** lokálisan futtatott szkript, amely az adat-repóból
  beolvassa a 4332 `szoveg.md`-t, szakaszokra bontja, és kötegelve tölti fel
  (~100 ezer sor). A hatályosságot az `index/enumeralas.json` `lezart` rétege adja.
- **Napi szinkron:** a napi delta a commit és push UTÁN újraindexeli a változott
  slugokat (törlés + beszúrás jogszabályonként, tranzakcióban).

### Titkok — változás a mai állapothoz képest

Az `uzemeltetes.md` ma azt írja: „Titkok: Nincsenek." Ez megszűnik. Az adat-repo
kap egy `SUPABASE_DB_URL` GitHub secretet a szinkronhoz; a Vercel oldalon a
`NEXT_PUBLIC_SUPABASE_URL` és a `SUPABASE_ANON_KEY` kerül be. A két táblán RLS
engedi az anon `select`-et, és tiltja az írást — az írás joga csak a
connection stringé. A doksit ennek megfelelően át kell írni.

### Webes felület

A `/kereses` oldal szerkezete marad. Újdonságok:

- „hatálytalan törvényekben is" kapcsoló, **URL-paraméterként** (`?q=…&mind=1`),
  nem kliensoldali állapotként — így a link megosztható és JS nélkül is működik
  (PRODUCT.md 5. elv: nulla sallang).
- a hatálytalan találatok látható jelölést kapnak
- a mai „egyelőre a kiemelt törvények teljes szövegében" figyelmeztetés törlődik
- a `minisearch` függőség eltávolítható

## Hibatűrés

**A napi delta nem bukhat el az index-szinkron miatt.** Az adat-repo integritása
előbbre való a keresőnél: a szinkron külön hibaágon fut, és hiba esetén ugyanolyan
riasztó issue-t nyit, mint a parser-őr (`health.ts`), de a delta kilépési kódját
nem rontja el.

Fordított irány: ha a Postgres nem elérhető, a keresőoldal nyugodt magyarázatot ad
és átlinkel az njt keresőjére — nem 500-as hibaoldalt mutat.

Mivel az index származtatott, minden hiba végső gyógymódja ugyanaz: teljes
újraépítés a kezdeti feltöltő szkripttel.

## Tesztelés

- `szakaszokraBont` unit tesztek — ez a logika ma teljesen fedetlen, pedig a
  találati minőség múlik rajta (§-cím felismerés, táblázatsorok, listaelemek).
- a lekérdezésépítés és a válasz-leképezés unit tesztje
- az SQL-függvény CI-ban nem futtatható (nincs adatbázis), ezért a bevezetéskor
  **kézi füstteszt** valódi kifejezésekkel: „jogos védelem", „szerződést"
  (ragozás!), „elévülés", és idézőjeles pontos kifejezés. Az eredményt a 37
  kiemelt törvényen összevetjük a mai keresővel, ahol van mihez hasonlítani.

## Bevezetés

1. Séma és RPC migrációs fájlként a repóba (`packages/pipeline/supabase/`).
2. Kezdeti feltöltés lokálisan, füstteszt a lekérdezésekre.
3. A web átállítása, MiniSearch kivezetése, kapcsoló bekötése.
4. A napi delta kiegészítése + a GitHub secret beállítása.
5. Deploy és verifikáció (a `vercel --prod` nem automatikus a push-ra!).
6. `uzemeltetes.md` frissítése: titkok, keresőindex, újraépítési recept.

## Kockázatok

| Kockázat | Kezelés |
|---|---|
| A `hungarian` szótövező jogi szaknyelvre gyengébb, mint köznyelvre | A bevezetési füstteszt pont ezt méri; ha gyenge, a `cim` súlyozása és a prefix-keresés hangolható |
| A kezdeti feltöltés hosszú vagy megszakad | Jogszabályonkénti tranzakció, újrafuttatható (upsert), nem kell egyszerre végigmennie |
| Az adatbázis mérete nő a keret fölé | Ma 400–450 MB a 8 GB-ból; a történeti keresés kihagyása pont ezt védi |
| A titok bevezetése új támadási felület | Csak írásjog, csak az adat-repo Actionjében; a web anon kulccsal, RLS mögött olvas |
