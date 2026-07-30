# DESIGN.md — Nyílt Jogtár

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
- Sötét téma: háttér `oklch(0.22 0.01 85)`, szöveg `oklch(0.90 0.008 85)`.
- Soha #000/#fff; minden neutrális a papír-hue (85) felé húz.

## Tipográfia

- Jogszabályszöveg: serif stack — `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
- UI-elemek (nav, gombok, meta): system sans — `system-ui, -apple-system, "Segoe UI", sans-serif`
- Kód/diff: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`
- Skála (1.29-es ráta): 13 / 15 / 17 (törzs) / 22 / 28 / 36
- Törzs sorhossz max 70ch, sorköz 1.65 a jogszövegben.

## Komponens-elvek

- Nincs kártya-grid: a jogszabály-lista strukturált TÁBLÁZAT/lista sor-elemekkel
  (megjelölés + cím + rövidítés + utolsó változás), teljes sorra kattintható.
- Az idővonal valódi függőleges idővonal (dátum-tengely, csomópontok), nem kártyasor.
- Diff-nézet: sorszintű, +/− háttértint, egyesített (unified) nézet; a fejlécben
  a két időállapot dátuma és a köztük eltelt idő.
- § headingek horgony-linkkel (hover-en látszó ¶ jel, pecsétzöld).
- Disclaimersáv: keskeny, papírnál egy árnyalattal sötétebb sáv, nem banner.
- Fókuszgyűrű: 2px pecsétzöld outline, offset 2px — minden interaktív elemen.
