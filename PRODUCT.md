# PRODUCT.md — Nyílt Jogtár

register: product

## Mi ez

A magyar jogrendszer git-natív, publikus verziókövetésének weboldala
(jogtar.remenyfarm.hu). A termék szíve a godavid/magyar-jogtar adat-repo;
a weboldal ezt teszi laikusnak is hozzáférhetővé: jogszabály-lista, teljes
hatályos szöveg, időállapot-idővonal, két állapot diffje, teljes szövegű keresés.

## Felhasználók

- Újságírók, kutatók, jogászok, civil szervezetek: „mikor és mit írtak át?”
- Fejlesztők/AI-felhasználók: a git repót klónozzák, a weboldal a kirakat.
- Laikus polgár: egy törvény hatályos szövegét akarja elolvasni, tisztán.

## Tónus és karakter

Közérdekű átláthatósági infrastruktúra: pontos, nyugodt, hivatali komolyság
melegséggel — irattár, nem startup. Magyar nyelvű UI. A tipográfia a hosszú
jogszabályszöveg olvasására van hangolva (nyomtatott jogtár-érzés, képernyőn).

## Anti-referenciák

- NEM SaaS-landing (nincs hero-metrika, nincs gradiens, nincs kártyarács).
- NEM nemzeti trikolor és NEM „navy-arany ügyvédi iroda”.
- NEM GOV.UK-klón (fekete-fehér sterilitás), NEM neon „legal-tech AI” esztétika.
- Semmi marketinges önfényezés: a tartalom (a törvényszöveg és a diff) a főszereplő.

## Stratégiai elvek

1. Olvashatóság mindenek felett: 65–75ch sorhossz, generózus sorköz, nyomdai ritmus.
2. A változás az érték: az idővonal és a diff elsőrangú felület, nem elrejtett extra.
3. Hivatkozhatóság: minden § mélylinkelhető; az URL-ek beszédesek és stabilak.
4. „Nem hiteles jogforrás” figyelmeztetés minden szövegoldalon, diszkréten, de láthatóan.
5. Nulla sallang: nincs süti-banner (nincs tracking), nincs modál, nincs fölösleges JS.
