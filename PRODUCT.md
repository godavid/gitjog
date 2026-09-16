# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Elsődleges: fejlesztők és gépi felhasználók.** Klónozzák az adat-repót, vagy a
  domain gépi végpontjait fogyasztják (`/llms.txt`, nyers `szoveg.md`, RSS, sitemap).
  Ide tartoznak az AI-asszisztensek és -crawlerek is: számukra a weboldal egyszerre
  belépési pont és kirakat. Minden későbbi terméki döntés ehhez a közönséghez igazodik.
- Másodlagos: újságírók, kutatók, jogászok, civil szervezetek — a tényleges kérdésük
  „mikor és mit írtak át?”, nem a hatályos szöveg önmagában.
- Szintén kiszolgált: a laikus polgár, aki egy törvény hatályos szövegét akarja
  elolvasni, tisztán, regisztráció és fizetés nélkül.

## Product Purpose

A magyar törvényállomány teljes szövege és teljes változástörténete git-natív,
publikus verziókövetésben. Minden törvény egy Markdown-fájl, minden commit egy
időállapot (a commit dátuma a hatálybalépés napja), a diff maga a törvénymódosítás.
A weboldal ezt teszi böngészhetővé: jogszabály-lista, hatályos szöveg,
időállapot-idővonal, két állapot diffje, teljes szövegű keresés.

A siker mércéje az organikus látogatószám (2026-08-10-i döntés). Nincs bevételi,
regisztrációs vagy konverziós cél.

## Positioning

Szövegszintű diff minden egyes módosításról, visszamenőleg, ingyen és klónozható
alakban. A fej-kifejezésekért („X törvény hatályos szöveg”) szándékosan nem
versenyzünk — azokat az állami és a piaci nagyok birtokolják. A rés a „mi változott”
hosszú farok: ezt ma kézzel írt újságcikkek szolgálják ki, a szövegszintű diff
egyetlen hazai megfelelője egy fizetős jogi adatbázis.

Amit egy szomszédos termék nem tudna őszintén lemásolni: maga a git-natív forma.
Az állomány klónozható, `git log`-gal, `git blame`-mel és `git diff`-fel kérdezhető,
és minden időállapot commit-SHA-ra pinnelhető — nem egy felület köré épített
adatbázis, hanem adat, amihez a felület csak hozzáférés.

## Operating Context

- **Forrás:** az njt.jog.gov.hu publikus felülete, automatikus feldolgozással.
  Nem minden jogszabály szerepel: kimaradnak azok, amelyeknek nincs konszolidált
  szövegük az njt-n.
- **Ritmus:** napi egyszeri delta (GitHub Actions az adat-repóban). Az aznap
  hatályba lépő módosítások új commitként kerülnek be, és néhány órán belül
  megjelennek a weben (ISR).
- **Repók:** adat `github.com/godavid/magyar-jog`, kód `github.com/godavid/gitjog`
  (pnpm monorepo: `packages/pipeline` crawler + normalizáló, `apps/web` Next.js).
- **Kiszolgálás:** Vercel. A main-re pusholás önmagában NEM deployol — a produkciós
  deploy CLI-ből indul. Keresés: Supabase Postgres FTS, magyar szótövezéssel.
- **Találkozási pontok:** keresőtalálat egy „mi változott” kérdésre, RSS-feed,
  `git clone`, illetve AI-asszisztens, amely a domain gépi végpontjait olvassa, vagy az MCP-szerverhez kapcsolódik (Claude, ChatGPT, Cursor).
- Részletes üzemeltetési leírás: `docs/uzemeltetes.md`.

## Capabilities and Constraints

- Nagyságrend: ~4300 törvény, ~27 000 időállapot, 1827-től napjainkig.
- **Nem hiteles jogforrás.** Ez minden szövegoldalon látszik; a hiteles szöveg az
  njt.jog.gov.hu-n és a Magyar Közlönyben van.
- **Termékhatár (megerősítve 2026-09-16):** csak törvények; rendeletek és egyéb
  jogszabálytípusok később — előbb a meglévő állomány minősége.
- **Gépi felület (2026-09-16 óta):** REST API (`/api/v1`, OpenAPI) és MCP-szerver
  (`/api/mcp`) §-szintű műveletekkel — keresés a § teljes szövegével, egy § egy adott
  napon, „mi változott" cursorral, két időállapot diffje. Az agent egy körben citálható
  választ kap; egész törvényt nem kell beolvasnia.
- **Terjesztés:** az emberi közönség felé passzív (nincs sajtó, közösségi poszt,
  outreach). Az MCP-szerverre 2026-09-16-án külön döntés született: hivatalos
  MCP-registry bejegyzés és fejlesztői csatornák (GitHub topicok, awesome-listák) —
  ez katalógus-jelenlét a gépi közönségnek, nem kampány.
- Nincs süti-banner, nincs modál, nincs fölösleges JS. Mérés csak süti nélküli,
  a látogatót nem azonosító, oldalszintű forgalmi statisztika lehet.
- A keresés kérés-időben fut az adatbázison; ha az nem elérhető, a jogszabályok
  szövege továbbra is olvasható marad — ez a fallback kötelező.
- Terminológia (magyar UI, kötelező): *időállapot*, *megjelölés*, *hatályos szöveg*,
  *mi változott?*, *hatálybalépés*. A jogszabály-rövidítéseket nem ragozzuk.

## Brand Commitments

- **Név: GitJog**, 2026-09-16 óta. Az előző név védjegyfelszólítás miatt szűnt meg;
  a „jogtár” szó a kommunikációban (oldal, doksik, commit-üzenet, közösségi felület)
  nem használható, és versenytárs-összehasonlítást sem teszünk.
- **Aldomain marad:** `gitjog.remenyfarm.hu`; önálló domain nem cél. A régi cím
  átirányít (a vállalás szerint 2026-12-31-ig).
- Magyar nyelvű felület.
- Hang és karakter: közérdekű átláthatósági infrastruktúra — pontos, nyugodt,
  hivatali komolyság melegséggel; irattár, nem startup. Semmi marketinges
  önfényezés: a törvényszöveg és a diff a főszereplő.

## Evidence on Hand

- Valódi, teljes adatállomány naponta frissülő deltával (az adat-repo maga a bizonyíték).
- Licenc: a jogszabályok szövege nem tárgya a szerzői jogi védelemnek
  (Szjt. 1. § (4)–(5)); a feldolgozás CC0-ként hivatkozott az `/adatok` oldalon,
  a kód MIT.
- **Nincs** ügyfél-hivatkozás, testimonial, sajtóemlítés, benchmark és felhasználószám.
  Ilyet kitalálni tilos.
- Forgalmi adat csak 2026-08-10 óta van (Vercel Web Analytics). A Search Console és
  a Bing még nincs bekötve — indexeltségi állításra ma nincs fedezet.

## Product Principles

1. **A változás az érték.** Az idővonal és a diff elsőrangú felület, nem elrejtett extra.
2. **A gépi olvashatóság egyenrangú az emberivel.** Ami a képernyőn látszik, nyers
   alakban is elérhető ugyanarról a domainről, kulcs és süti nélkül.
3. **Hivatkozhatóság.** Minden § mélylinkelhető; az URL-ek beszédesek és stabilak,
   minden időállapot commit-SHA-ra pinnelhető.
4. **A forrás hitelessége nem homályosítható el.** A „nem hiteles jogforrás”
   figyelmeztetés diszkrét, de minden szövegoldalon ott van.
5. **Nulla sallang.** Nincs süti-banner, modál, fölösleges JS; a mérés nem
   azonosítja a látogatót.

## Accessibility & Inclusion

Nincs vállalt formális szabvány (nem WCAG-auditált). Alapelvárás viszont, hogy a
felület billentyűzettel bejárható legyen, szemantikus HTML-re épüljön, és a
kontraszt világos és sötét témában is megfelelő legyen.

## Anti-referenciák

*(A korábbi PRODUCT.md-ből megőrzött, továbbra is érvényes megkötések. A pozitív
vizuális világot a DESIGN.md írja le.)*

- NEM SaaS-landing (nincs hero-metrika, nincs gradiens, nincs kártyarács).
- NEM nemzeti trikolor és NEM „navy-arany ügyvédi iroda”.
- NEM GOV.UK-klón (fekete-fehér sterilitás), NEM neon „legal-tech AI” esztétika.
