// Az adat-repo statikus váz-fájljai (README, DISCLAIMER, LICENSE, .gitattributes).

export const README_MD = `# Magyar Jogtár — a magyar jogrendszer git-natív verziókövetése

Ez a repó a legfontosabb magyar jogszabályok **konszolidált szövegét** tartalmazza
Markdown formátumban, úgy, hogy **a git history maga a jogtörténet**:

- **egy commit = egy időállapot** — a commit dátuma a hatálybalépés napja,
- **a \`git diff\` = a törvénymódosítás** — szó szerint látszik, mit vettek ki és mit tettek be,
- \`git log --follow jogszabalyok/2013-evi-v-torveny-ptk/szoveg.md\` — a Ptk. teljes módosítás-történet,
- \`git blame\` — megmutatja, melyik szakasz mikor változott utoljára,
- \`git checkout\` egy múltbeli commitra — az akkor hatályos állapot.

## Példák

\`\`\`bash
# Mit módosított a jogalkotó a Ptk.-n 2024-ben?
git log --since=2024-01-01 --until=2025-01-01 -- jogszabalyok/2013-evi-v-torveny-ptk/

# Két időállapot összevetése
git diff 'main@{2023-01-01}' 'main@{2025-01-01}' -- jogszabalyok/2012-evi-c-torveny-btk/szoveg.md
\`\`\`

## Szerkezet

\`\`\`
jogszabalyok/<slug>/szoveg.md   # a konszolidált szöveg (HEAD = aktuális állapot)
jogszabalyok/<slug>/meta.json   # azonosító, cím, forrás-URL, időállapot-lista
index/jogszabalyok.json         # az összes jogszabály listája
index/allapotok.json            # időállapot → commit SHA térkép (a weboldal használja)
\`\`\`

## ⚠️ Nem hiteles jogforrás

Ez a repó **tájékozódási és kutatási célra** készült, automatikus feldolgozással a
[Nemzeti Jogszabálytár](https://njt.jog.gov.hu) publikus felületéből. **Nem hiteles
szöveg** — a hiteles jogforrás a njt.jog.gov.hu és a Magyar Közlöny. Részletek:
[DISCLAIMER.md](DISCLAIMER.md).

## Frissítés

A repót napi automatikus futás (GitHub Actions) tartja karban: az aznap hatályba
lépő új időállapotokat commitolja. A feldolgozó kód nyílt:
[godavid/gitjog](https://github.com/godavid/gitjog). Weboldal:
[jogtar.remenyfarm.hu](https://jogtar.remenyfarm.hu).

## Licenc

A jogszabályszöveg a szerzői jogról szóló 1999. évi LXXVI. törvény 1. § (4)
bekezdése alapján nem áll szerzői jogi védelem alatt (közkincs). A repó saját
metaadatai és szerkezete: [CC0](LICENSE).
`;

export const DISCLAIMER_MD = `# Jogi nyilatkozat

1. **Nem hiteles jogforrás.** E repó tartalma automatikus feldolgozással készül a
   Nemzeti Jogszabálytár (njt.jog.gov.hu) publikus felületéből. A feldolgozás
   hibázhat; a szöveg eltérhet a hivatalos szövegtől. Hiteles forrás kizárólag a
   Nemzeti Jogszabálytár és a Magyar Közlöny.
2. **Nem jogi tanácsadás.** A repó és a hozzá tartozó weboldal tájékozódási,
   kutatási és oktatási célt szolgál. Jogi kérdésben mindig az elsődleges
   forrást és szakembert kell megkérdezni.
3. **Ismert korlátok.** A lábjegyzeteket (módosító hivatkozások) a szöveg nem
   tartalmazza; a képi tartalmak (pl. az Alaptörvény kottái) kimaradnak;
   a formázás (dőlt/félkövér) elvész — a normalizálás a szöveg tartalmát őrzi.
4. **Forrásmegjelölés.** Minden jogszabály \`meta.json\`-ja tartalmazza az njt
   forrás-URL-t. A crawler azonosítható User-Agenttel, rate-limittel, a
   robots.txt tiszteletben tartásával dolgozik.
`;

export const LICENSE_TXT = `A magyar jogszabályok szövege a szerzői jogról szóló 1999. évi LXXVI. törvény
1. § (4) bekezdése alapján nem áll szerzői jogi védelem alatt — közkincs.

A repó saját hozzáadott rétege (könyvtárszerkezet, metaadatok, index-fájlok,
commit-üzenetek) a CC0 1.0 Universal (közkincsbe adás) alatt áll:
https://creativecommons.org/publicdomain/zero/1.0/deed.hu

A feldolgozó kód külön repóban él (github.com/godavid/gitjog), MIT licenc alatt.
`;

export const GITATTRIBUTES = `* text=auto eol=lf
*.md diff=markdown
`;
