# DESIGN.md — GitJog

## Jelenet-mondat (téma-döntés)

Újságíró vagy jogász nappal, világos irodában, laptopon olvas hosszú
törvényszöveget és diffet görget: VILÁGOS téma az alap (papír-érzet),
`prefers-color-scheme: dark` támogatott (tintapapír-sötét, nem „tech-dark”).

## Szín (OKLCH, Restrained stratégia)

- Papír háttér: `oklch(0.97 0.006 85)` (meleg, enyhén sárgás papír)
- Tinta szöveg: `oklch(0.24 0.01 85)`
- Halvány tinta (másodlagos): `oklch(0.45 0.012 85)`
- Vonal/keret: `oklch(0.88 0.008 85)`
- AKCENT — pecsétzöld (hivatali bélyegző zöldje): `oklch(0.45 0.09 165)`;
  hover/aktív: `oklch(0.38 0.09 165)`. Max ~10% felület.
- Diff (funkcionális): beszúrás-háttér `oklch(0.94 0.05 150)`, törlés-háttér
  `oklch(0.94 0.045 25)`; sötétben ugyanez L≈0.30-on.
- Sötét téma (`@media (prefers-color-scheme: dark)`, minden token felülírva): háttér
  `oklch(0.22 0.01 85)`, mélyebb papír `oklch(0.25 0.012 85)`, szöveg `oklch(0.90 0.008 85)`,
  halvány tinta `oklch(0.68 0.01 85)`, vonal `oklch(0.34 0.012 85)`, pecsétzöld
  `oklch(0.72 0.09 165)`, hover/aktív `oklch(0.80 0.09 165)` (sötétben a hover világosabb).
- Soha #000/#fff; minden neutrális a papír-hue (85) felé húz. Egyetlen kivétel a
  nyomtatás (`@media print`): ott a papír `#fff`, és mindig a világos tokenek élnek.
- A tokenek forrása `apps/web/app/globals.css` (`:root`). A megosztókártyák
  (`apps/web/app/opengraph-image.tsx`, `apps/web/app/jogszabaly/[slug]/opengraph-image.tsx`,
  `apps/web/app/jogszabaly/[slug]/diff/[tol]/[ig]/opengraph-image.tsx`) és a favicon
  (`apps/web/app/icon.svg`) a világos tokenek sRGB hex-másolatát használják (papír
  `#f7f5f1`, tinta `#211f1a`, halvány tinta `#58554e`, pecsétzöld `#0e6549`, vonal
  `#dad7d2`); tokenváltozáskor ezeket is frissíteni kell.

## Tipográfia

- Jogszabályszöveg: serif stack — `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
- UI-elemek (nav, gombok, meta): system sans — `system-ui, -apple-system, "Segoe UI", sans-serif`
- Kód/diff: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`
- Skála (1.29-es ráta): 13 / 15 (UI-törzs, `body`) / 17 (jogszöveg-törzs, `.jogszoveg`)
  / 22 / 28 / 36. Köztes fokok a kódban: 14 (nav, meta, táblázat, keskenyen a kiemelt
  kódsor), 16 (beviteli mező az iOS-zoom ellen, találatcím, kiemelt kódsor), 20 / 24
  (jogszöveg h3 / h2; a gépi sáv MCP-címe 20), 18 (szöveges oldal h3), 11
  (hatálytalan-jelölő); keskeny képernyőn h1 26, szekciócím 20.
- Törzs sorhossz max 70ch, sorköz 1.65 a jogszövegben.

## Komponens-elvek

- Nincs kártya-grid: a jogszabály-lista (`.jsz-lista`, főoldal és `/evek/[ev]`)
  strukturált lista sor-elemekkel (megjelölés + cím + rövidítés), teljes sorra
  kattintható. Az utolsó változás dátuma 2026-08-01 (22508c9) óta nincs a sorban; a
  friss módosítások a „Legutóbbi változások” listában (`.friss-lista`) látszanak.
- Az idővonal valódi függőleges idővonal (dátum-tengely, csomópontok), nem kártyasor.
- Diff-nézet (`DiffNezet`): sorszintű, +/− háttértint, egyesített (unified) nézet; a
  változatlan blokkokból 3 sor kontextus marad, a többi egy „⋯ N változatlan sor ⋯”
  sorba csukódik. A fejlécben a két időállapot dátuma, nem szomszédos állapotoknál az
  összevont módosítási lépések száma, és a bekerült/kikerült sorok száma.
- § headingek horgony-linkkel (hover-en látszó ¶ jel, pecsétzöld).
- Disclaimersáv: keskeny, papírnál egy árnyalattal sötétebb sáv, nem banner.
- Fókuszgyűrű: 2px pecsétzöld outline, offset 2px — minden interaktív elemen.
- Gépi belépés sávja (főoldal, `.gepi-sav`): a lap egyetlen teljes szélességű,
  mélyebb papír-sávja, hajszálvonalakkal; benne a pecsétzöld § és a nagy mono
  MCP-cím. Kártya nem lesz belőle, és más oldalon nem ismétlődik.
- Másolható kódsor (`KodSor`): mono kódblokk, jobb felső sarkában „Másolás” gomb,
  amely JS nélkül nem jelenik meg (a szöveg akkor is kijelölhető). Keskeny
  képernyőn a kiemelt cím egy sorban marad, a gomb alá kerül.
- Tipográfiai csúcs: a 36 px-es fokot csak a főoldal címe (`h1.fo-cim`) használja.

## Mozgás

- Egyetlen szerzett pillanat: megérkezés egy hivatkozott helyre (`:target`) — a cél
  pecsétzöld kiemelést kap, ami kitart a görgetés alatt, majd elhalványul. Ez az
  agent-válaszokban citált §-URL-ek landolása. Horgonyos belső link ezért sima `<a>`
  (a `:target` kliens-navigáció után nem frissül).
- Visszajelzés: sikeres másoláskor a gomb pecsétként „rányomódik” (260 ms), a keret
  pecsétzöld lesz. Hover-színváltás 120–150 ms.
- `prefers-reduced-motion`: a kiemelés tartós tint mozgás nélkül, a pecsételés elmarad.
