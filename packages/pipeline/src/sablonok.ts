// Az adat-repo statikus váz-fájljai (README, DISCLAIMER, LICENSE, LICENSE-HU, .gitattributes).
//
// Az igazság forrása az adat-repo (godavid/magyar-jog) élő fájlja: a README_MD, DISCLAIMER_MD,
// LICENSE_TXT és LICENSE_HU_MD magot csak egy friss backfill írja ki (backfill.ts, „váz” lépés),
// a napi delta nem nyúl hozzájuk. Ha az élő fájl változik, ezeket kézzel kell szinkronban tartani
// (forrás: https://raw.githubusercontent.com/godavid/magyar-jog/main/<fájl>). Kivétel az
// AGENTS_MD: annak a pipeline a gazdája, a delta írja felül az adat-repóban (lásd lent).
// A backtick és a `${` a sablonokban escape-elve áll.

export const README_MD = `# GitJog — a magyar jogrendszer git-natív verziókövetése

> **Hungarian legislation as a git repository.** 4,300+ acts in consolidated
> Markdown; each point-in-time version of an act is a commit dated on its date of
> entry into force (the SHAs are listed in \`jogszabalyok/<slug>/allapotok.json\`),
> so \`git diff\` between two of them is literally the amendment. History is not in
> date order: pick commits from \`allapotok.json\`, not with \`--since\` or \`@{date}\`.
> Updated daily. Public domain (CC0) — but **not an authentic source of law**, see
> [DISCLAIMER.md](DISCLAIMER.md). Browse it at
> [gitjog.remenyfarm.hu](https://gitjog.remenyfarm.hu).

Ez a repó a magyar törvények **konszolidált szövegét** tartalmazza Markdown
formátumban, úgy, hogy **a git history maga a jogtörténet**:

- **minden időállapot egy commit** — a commit dátuma a hatálybalépés napja (1970 előtti
  állapotnál 1970-01-01; a valódi dátum a commit-üzenetben és a \`meta.json\`-ban áll).
  Egy commit több jogszabály azonos napú állapotát is hordozhatja. Az \`Index frissítés\`
  és az \`Enumerálás-térkép frissítés\` commit nem időállapot, és egy jogszabály git
  logjában ismételt (visszajátszott) commitok is lehetnek. Egy jogszabály időállapotainak
  kanonikus commitjai: \`jogszabalyok/<slug>/allapotok.json\`,
- **a \`git diff\` két ilyen SHA között = a törvénymódosítás** — szó szerint látszik, mit vettek ki és mit tettek be,
- \`git log --follow jogszabalyok/2013-evi-v-torveny-ptk/szoveg.md\` — a Ptk. teljes módosítás-történet,
- \`git blame\` — megmutatja, melyik szakasz mikor változott utoljára,
- egy múltbeli időállapot: \`git show <sha>:jogszabalyok/<slug>/szoveg.md\`, ahol a \`<sha>\` a
  \`jogszabalyok/<slug>/allapotok.json\`-ból jön. Egy régi commit \`git checkout\`-ja **nem** az
  akkor hatályos joganyagot adja: a jogszabályok később, visszadátumozott commitokkal kerültek be.

## Példák

\`\`\`bash
# Mely időállapotai léptek hatályba a Ptk.-nak 2024-ben?
# A SHA-t mindig az allapotok.json-ból vedd: a history nem dátum szerint rendezett, ezért
# a \`git log --since/--until\` itt üres eredményt ad, a \`main@{dátum}\` pedig a helyi
# reflogot nézi (klónban mindkét oldala a HEAD, a diff üres).
jq -r '.[] | select(.datum >= "2024-01-01" and .datum < "2025-01-01") | "\\(.datum) \\(.sha)"' \\
  jogszabalyok/2013-evi-v-torveny-ptk/allapotok.json

# Két időállapot összevetése: a Btk. 2023-01-01-jén és 2025-01-01-jén hatályos szövege
B=jogszabalyok/2012-evi-c-torveny-btk
REGI=$(jq -r '[.[] | select(.datum <= "2023-01-01")] | max_by(.datum) | .sha' $B/allapotok.json)
UJ=$(jq -r '[.[] | select(.datum <= "2025-01-01")] | max_by(.datum) | .sha' $B/allapotok.json)
git diff "$REGI" "$UJ" -- $B/szoveg.md
\`\`\`

Agent-receptek és API: [AGENTS.md](AGENTS.md). Ha egy leírás és az adat eltér, az adat
(\`allapotok.json\`, \`meta.json\`) a mérvadó.

## Szerkezet

A \`jogszabalyok/\`, az \`index/\` és az \`AGENTS.md\` a [GitJog pipeline](https://github.com/godavid/gitjog)
kimenete (lásd a Karbantartás szakaszt).

\`\`\`
jogszabalyok/<slug>/szoveg.md        # konszolidált szöveg (HEAD = jellemzően a legutolsó felvett
                                     #   időállapot; biztosan: az allapotok.json utolsó SHA-ja).
                                     #   Nem feltétlenül hatályos jog: lásd enumeralas.json, lezart
jogszabalyok/<slug>/meta.json        # azonosítók, cím, forrás-URL (forras), időállapot-lista
jogszabalyok/<slug>/allapotok.json   # időállapotok: [{datum, verzio, sha}] — innen vedd a SHA-kat
index/jogszabalyok.json              # minden jogszabály: [{slug, documentId, megjeloles, cim, rovidites}]
index/allapotok.json                 # slugonként [{datum, verzio, sha}] (nagy fájl; a weboldal
                                     #   és a napi futás állapota)
index/felvetel/ÉÉÉÉ-HH.jsonl         # felvételi napló, soronként {felveve, slug, datum, sha}
index/enumeralas.json                # documentId → aktiv (hatályos vagy jövőbeli időállapota van) |
                                     #   lezart (hatályát vesztette) | nincs-szoveg (nincs a repóban);
                                     #   a napi futás ütemezése is
index/kihagyottak.json               # a backfill kihagyási listája okkal: [{documentId, slug, ok}];
                                     #   a napi futás nem frissíti, elavulhat (a friss lista: nincs-szoveg)
AGENTS.md                            # agent-útmutató; a gitjog sablonjából minden futás felülírja
CLAUDE.md                            # szimlink az AGENTS.md-re (ne szerkeszd, lásd AGENTS.md)
.github/workflows/napi-delta.yml     # a napi futás; a gitjog packages/pipeline/adatrepo/napi-delta.yml másolata
\`\`\`

Egyetlen szöveg letöltéséhez nem kell klónozni:

\`\`\`
https://raw.githubusercontent.com/godavid/magyar-jog/main/jogszabalyok/<slug>/szoveg.md
\`\`\`

## ⚠️ Nem hiteles jogforrás

Ez a repó **tájékozódási és kutatási célra** készült, automatikus feldolgozással a
[Nemzeti Jogszabálytár](https://njt.jog.gov.hu) publikus felületéből. **Nem hiteles
szöveg** — a hiteles jogforrás a njt.jog.gov.hu és a Magyar Közlöny. Részletek:
[DISCLAIMER.md](DISCLAIMER.md).

## Frissítés

A repót napi automatikus futás (GitHub Actions) tartja karban: minden olyan új
időállapotot commitol, amely legkésőbb aznap hatályba lépett, és még nincs a repóban.
Egy időállapot napokkal a hatálybalépése után is bekerülhet: a hatályát vesztett és a
szöveg nélküli jogszabályokat a futás csak hetente kérdezi le, és az njt is később
teheti közzé az új szöveget. A bekerülés idejét a havi \`index/felvetel/*.jsonl\` napló
rögzíti, nem a commit dátuma. Hiba vagy gyanús adat esetén a futás \`parser-riasztas\`
címkés issue-t nyit ebben a repóban. A feldolgozó kód nyílt:
[godavid/gitjog](https://github.com/godavid/gitjog). Weboldal:
[gitjog.remenyfarm.hu](https://gitjog.remenyfarm.hu).

## Karbantartás (embereknek és agenteknek)

- A \`jogszabalyok/\`, az \`index/\` és az \`AGENTS.md\` a gitjog pipeline kimenete: kézzel ne
  szerkeszd, a hibát a [godavid/gitjog](https://github.com/godavid/gitjog) forrásában javítsd.
  Az \`index/allapotok.json\` és az \`index/enumeralas.json\` a napi futás állapota is. Az
  \`AGENTS.md\`-t minden futás felülírja a gitjog \`packages/pipeline/src/sablonok.ts\`
  \`AGENTS_MD\` sablonjából.
- A \`.github/workflows/napi-delta.yml\` a gitjog \`packages/pipeline/adatrepo/napi-delta.yml\`
  másolata: a kettőt mindig együtt módosítsd.
- A \`main\` történetét soha ne írd át (rebase, force-push, \`git filter-repo\`), és ne rendezd
  dátum szerint: az indexek és a felvételi napló commit-SHA-kra hivatkoznak. A később talált
  múltbeli időállapot új commit a history végén (gitjog \`docs/uzemeltetes.md\`, Ismert korlátok),
  és a korábbi backfill-futások is a meglévő commitok után kerültek be, ezért a history nem
  dátum szerint rendezett.
- A napi futás alatt ne pusholj és ne olvassz be semmit a \`main\`-re (a cron 03:30 UTC, de a
  GitHub jellemzően csak 08:00 és 11:00 UTC között indítja, és kb. 25 percig fut; ellenőrzés:
  \`gh run list -R godavid/magyar-jog -w napi-delta.yml -L 1\`). A futás a push előtt írja be a
  commit-SHA-kat az indexbe; ha közben a \`main\` elmozdul, a \`git pull --rebase\` után ezek a
  SHA-k a \`main\`-ről nem érhetők el.
- Üzemeltetés, riasztások, hibaelhárítás:
  [gitjog docs/uzemeltetes.md](https://github.com/godavid/gitjog/blob/main/docs/uzemeltetes.md).

## Licenc

A jogszabályszöveg a szerzői jogról szóló 1999. évi LXXVI. törvény 1. § (4)
bekezdése alapján nem áll szerzői jogi védelem alatt (közkincs). A repó saját
hozzáadott rétege — szerkezet, metaadatok, index-fájlok — [CC0 1.0](LICENSE)
alatt áll; magyar magyarázat: [LICENSE-HU.md](LICENSE-HU.md). Röviden: bármire
felhasználható, gépi feldolgozásra is, forrásmegjelölés nélkül.

A feldolgozó kód külön repóban él ([godavid/gitjog](https://github.com/godavid/gitjog)),
MIT licenc alatt.
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

// A CC0 1.0 Universal hivatalos angol szövege, szó szerint (az adat-repo LICENSE fájlja).
export const LICENSE_TXT = `Creative Commons Legal Code

CC0 1.0 Universal

    CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM AND DOES NOT PROVIDE
    LEGAL SERVICES. DISTRIBUTION OF THIS DOCUMENT DOES NOT CREATE AN
    ATTORNEY-CLIENT RELATIONSHIP. CREATIVE COMMONS PROVIDES THIS
    INFORMATION ON AN "AS-IS" BASIS. CREATIVE COMMONS MAKES NO WARRANTIES
    REGARDING THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS
    PROVIDED HEREUNDER, AND DISCLAIMS LIABILITY FOR DAMAGES RESULTING FROM
    THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS PROVIDED
    HEREUNDER.

Statement of Purpose

The laws of most jurisdictions throughout the world automatically confer
exclusive Copyright and Related Rights (defined below) upon the creator
and subsequent owner(s) (each and all, an "owner") of an original work of
authorship and/or a database (each, a "Work").

Certain owners wish to permanently relinquish those rights to a Work for
the purpose of contributing to a commons of creative, cultural and
scientific works ("Commons") that the public can reliably and without fear
of later claims of infringement build upon, modify, incorporate in other
works, reuse and redistribute as freely as possible in any form whatsoever
and for any purposes, including without limitation commercial purposes.
These owners may contribute to the Commons to promote the ideal of a free
culture and the further production of creative, cultural and scientific
works, or to gain reputation or greater distribution for their Work in
part through the use and efforts of others.

For these and/or other purposes and motivations, and without any
expectation of additional consideration or compensation, the person
associating CC0 with a Work (the "Affirmer"), to the extent that he or she
is an owner of Copyright and Related Rights in the Work, voluntarily
elects to apply CC0 to the Work and publicly distribute the Work under its
terms, with knowledge of his or her Copyright and Related Rights in the
Work and the meaning and intended legal effect of CC0 on those rights.

1. Copyright and Related Rights. A Work made available under CC0 may be
protected by copyright and related or neighboring rights ("Copyright and
Related Rights"). Copyright and Related Rights include, but are not
limited to, the following:

  i. the right to reproduce, adapt, distribute, perform, display,
     communicate, and translate a Work;
 ii. moral rights retained by the original author(s) and/or performer(s);
iii. publicity and privacy rights pertaining to a person's image or
     likeness depicted in a Work;
 iv. rights protecting against unfair competition in regards to a Work,
     subject to the limitations in paragraph 4(a), below;
  v. rights protecting the extraction, dissemination, use and reuse of data
     in a Work;
 vi. database rights (such as those arising under Directive 96/9/EC of the
     European Parliament and of the Council of 11 March 1996 on the legal
     protection of databases, and under any national implementation
     thereof, including any amended or successor version of such
     directive); and
vii. other similar, equivalent or corresponding rights throughout the
     world based on applicable law or treaty, and any national
     implementations thereof.

2. Waiver. To the greatest extent permitted by, but not in contravention
of, applicable law, Affirmer hereby overtly, fully, permanently,
irrevocably and unconditionally waives, abandons, and surrenders all of
Affirmer's Copyright and Related Rights and associated claims and causes
of action, whether now known or unknown (including existing as well as
future claims and causes of action), in the Work (i) in all territories
worldwide, (ii) for the maximum duration provided by applicable law or
treaty (including future time extensions), (iii) in any current or future
medium and for any number of copies, and (iv) for any purpose whatsoever,
including without limitation commercial, advertising or promotional
purposes (the "Waiver"). Affirmer makes the Waiver for the benefit of each
member of the public at large and to the detriment of Affirmer's heirs and
successors, fully intending that such Waiver shall not be subject to
revocation, rescission, cancellation, termination, or any other legal or
equitable action to disrupt the quiet enjoyment of the Work by the public
as contemplated by Affirmer's express Statement of Purpose.

3. Public License Fallback. Should any part of the Waiver for any reason
be judged legally invalid or ineffective under applicable law, then the
Waiver shall be preserved to the maximum extent permitted taking into
account Affirmer's express Statement of Purpose. In addition, to the
extent the Waiver is so judged Affirmer hereby grants to each affected
person a royalty-free, non transferable, non sublicensable, non exclusive,
irrevocable and unconditional license to exercise Affirmer's Copyright and
Related Rights in the Work (i) in all territories worldwide, (ii) for the
maximum duration provided by applicable law or treaty (including future
time extensions), (iii) in any current or future medium and for any number
of copies, and (iv) for any purpose whatsoever, including without
limitation commercial, advertising or promotional purposes (the
"License"). The License shall be deemed effective as of the date CC0 was
applied by Affirmer to the Work. Should any part of the License for any
reason be judged legally invalid or ineffective under applicable law, such
partial invalidity or ineffectiveness shall not invalidate the remainder
of the License, and in such case Affirmer hereby affirms that he or she
will not (i) exercise any of his or her remaining Copyright and Related
Rights in the Work or (ii) assert any associated claims and causes of
action with respect to the Work, in either case contrary to Affirmer's
express Statement of Purpose.

4. Limitations and Disclaimers.

 a. No trademark or patent rights held by Affirmer are waived, abandoned,
    surrendered, licensed or otherwise affected by this document.
 b. Affirmer offers the Work as-is and makes no representations or
    warranties of any kind concerning the Work, express, implied,
    statutory or otherwise, including without limitation warranties of
    title, merchantability, fitness for a particular purpose, non
    infringement, or the absence of latent or other defects, accuracy, or
    the present or absence of errors, whether or not discoverable, all to
    the greatest extent permissible under applicable law.
 c. Affirmer disclaims responsibility for clearing rights of other persons
    that may apply to the Work or any use thereof, including without
    limitation any person's Copyright and Related Rights in the Work.
    Further, Affirmer disclaims responsibility for obtaining any necessary
    consents, permissions or other rights required for any use of the
    Work.
 d. Affirmer understands and acknowledges that Creative Commons is not a
    party to this document and has no duty or obligation with respect to
    this CC0 or use of the Work.

`;

// A LICENSE magyar magyarázata (az adat-repo LICENSE-HU.md fájlja).
export const LICENSE_HU_MD = `# Licenc — magyarul

Ez a fájl a [LICENSE](LICENSE) (CC0 1.0 Universal) magyar nyelvű magyarázata.
Jogvita esetén az angol nyelvű CC0-szöveg az irányadó.

## A jogszabályok szövege: közkincs

A magyar jogszabályok szövege a szerzői jogról szóló 1999. évi LXXVI. törvény
1. § (4) bekezdése alapján **nem áll szerzői jogi védelem alatt**. Jogszabály
nem lehet szerzői mű, ezért a szövegek szabadon másolhatók, terjeszthetők és
feldolgozhatók.

## A repó saját rétege: CC0 1.0

A repó saját hozzáadott rétege — a könyvtárszerkezet, a metaadatok, az
index-fájlok, a normalizált Markdown-formátum és a commit-üzenetek — a
**CC0 1.0 Universal** közkincsbe adás alatt áll. Gyakorlatilag: bármire
felhasználhatod, kereskedelmi célra is, engedélykérés és forrásmegjelölés
nélkül. (Hivatkozni jólesik, de nem feltétel.)

Ez kifejezetten vonatkozik a gépi feldolgozásra is: nyelvi modell tanítására,
keresőindex építésére, kutatási korpuszként való felhasználásra.

## A feldolgozó kód

A crawler és a weboldal külön repóban él:
[github.com/godavid/gitjog](https://github.com/godavid/gitjog), MIT licenc alatt.

## Amit a licenc NEM ad

A licenc a felhasználás jogát rendezi, a tartalom helyességét nem szavatolja.
Ez a repó **nem hiteles jogforrás**: automatikus feldolgozással készül, hibázhat.
A hiteles szöveg a [Nemzeti Jogszabálytár](https://njt.jog.gov.hu) és a Magyar
Közlöny. Részletek: [DISCLAIMER.md](DISCLAIMER.md).
`;

export const GITATTRIBUTES = `* text=auto eol=lf
*.md diff=markdown
`;

// Agent-útmutató az adat-repóhoz (angolul: külső agenteknek szól). A pipeline a gazdája:
// a delta csak azon a futáson írja ki, amely új időállapotot vesz fel (az Index commit előtt;
// az „új időállapot nélküli” ág korábban visszatér), így az index-utócommitba kerül, ha
// változott. Az adat-repóban kézzel szerkesztve a módosítás a következő ilyen futáson elvész.
export const AGENTS_MD = `# AGENTS.md — how to use this repository as an AI agent
<!-- GENERATED FILE. Source: godavid/gitjog packages/pipeline/src/sablonok.ts (AGENTS_MD). Do not edit here: the daily run overwrites it. -->

This repository is the **full text and full amendment history of Hungarian acts of
Parliament** (4,300+ acts, 1827–today), maintained as a git repository:

- \`jogszabalyok/<slug>/szoveg.md\` — consolidated text of one act. HEAD is the **latest ingested
  version**, not necessarily the law in force (see "What HEAD means" below)
- \`jogszabalyok/<slug>/meta.json\` — identifiers, title, source URL (\`forras\`), list of point-in-time versions
- \`jogszabalyok/<slug>/allapotok.json\` — versions of this act: \`[{datum, verzio, sha}]\` — **take commit SHAs from here**
- \`index/jogszabalyok.json\` — list of all acts: \`[{slug, documentId, megjeloles, cim, rovidites}]\` (official designation, title, abbreviation)
- \`index/allapotok.json\` — all versions of all acts, keyed by slug (3+ MB; prefer the per-act file)
- \`index/felvetel/YYYY-MM.jsonl\` — **ingestion log**: one line per version added, with the time it entered the repo
- \`index/enumeralas.json\` — \`documentId\` → layer: \`aktiv\` (has a version in force or a future one) |
  \`lezart\` (repealed) | \`nincs-szoveg\` (no consolidated text on njt, so not in this repo)
- \`index/kihagyottak.json\` — snapshot from the initial backfill of acts without a consolidated text,
  with reasons (\`[{documentId, slug, ok}]\`); the daily run cleans it but does not maintain it. The
  authoritative list of missing acts is the \`nincs-szoveg\` layer of \`enumeralas.json\`, not this file

Key names are ASCII (no accents): \`datum\`, \`felveve\`, \`verzio\`, \`megjeloles\`, \`cim\`, \`rovidites\`, \`kovetkezo_felveve_utan\`.

**Not an authentic source of law.** Derived automatically from https://njt.jog.gov.hu; the
authentic text is there and in Magyar Közlöny. Say so when you quote it. Public domain (CC0).

## What HEAD means

HEAD of \`jogszabalyok/<slug>/szoveg.md\` is the last version the pipeline ingested for that act
(the last SHA in its \`allapotok.json\`). It is **not necessarily the law in force today**:

- a repealed act (\`lezart\` layer) keeps its last text at HEAD;
- a version with a future entry-into-force date is ingested as soon as njt publishes it, so HEAD
  may be a text that is not yet in force;
- a version that entered into force recently may not be in the repo yet (see Caveats: lag).

To get the text in force on a given day, pick from \`allapotok.json\` the entry with the largest
\`datum\` that is \`<=\` that day, and read it with \`git show <sha>:jogszabalyok/<slug>/szoveg.md\`.

## How commits work

- **One commit per entry-into-force day**, carrying every act that changed on that day. The commit
  date (author and committer) is the **date of entry into force**, not the time the version was
  added (the ingestion log has that). Dates before 1970 are clamped to 1970-01-01 in git metadata;
  the real date is in the commit message and in \`meta.json\`/\`allapotok.json\`.
- \`Index frissítés …\` and \`Enumerálás-térkép frissítés\` commits are pipeline bookkeeping with
  wall-clock dates. They are not versions of any act.
- **History is not date-ordered.** Acts were backfilled in several runs, and a version found later
  is appended at the end of history with a back-dated commit. Therefore \`git log --since/--until\`,
  \`git log --until\`, \`main@{<date>}\` and \`git checkout\` of an "old" commit do **not** give you the
  law of that day. Take SHAs from \`allapotok.json\`, and **always give a path filter** to \`git log\`
  (\`-- jogszabalyok/<slug>/\`), otherwise index commits and other acts flood the output.
- \`git diff <sha_old> <sha_new> -- jogszabalyok/<slug>/szoveg.md\` between two SHAs from
  \`allapotok.json\` is literally the amendment.
- The amending act that caused a change is **not** recorded in the text (the consolidated source
  does not carry it). The commit message lists the njt source URLs of the ingested versions
  (\`Forrás (njt):\` lines); that URL is the version's own njt page, which names the amending acts.

## Cheapest way in: the API and the MCP server

Do not read whole \`szoveg.md\` files (most are under 100 KB, the largest is 2.33 MB) into
context. The website exposes section-level (§) endpoints, no key needed:

- MCP (streamable HTTP): \`https://gitjog.remenyfarm.hu/api/mcp\`
- REST + OpenAPI: \`https://gitjog.remenyfarm.hu/api/v1/openapi.json\`
- Human-readable guide: \`https://gitjog.remenyfarm.hu/llms.txt\`

Tools / endpoints (all read-only):

| tool | what it answers |
|---|---|
| \`kereses\` | "which § regulates X?" and reference resolution ("Ptk. 6:272. §", "2013. évi CXXII. törvény") — returns the § text, ready to cite |
| \`szakasz\` | one § at a given date; without a § it returns the act's metadata, versions and table of contents |
| \`valtozasok\` | "what changed since I last looked?" — cursor-based: start with an ISO-8601 timestamp in \`felveve_utan\`, then pass the response's \`kovetkezo_felveve_utan\` back **unchanged** (an opaque string, e.g. \`2026-10-06T17:43:08Z_2013-evi-v-torveny-ptk_2026-10-01\`); pages are oldest-first, gap-free and duplicate-free; returns the affected §§ with old/new text |
| \`diff\` | full §-level comparison of two versions |

## Working from a clone (git-native recipes)

\`\`\`bash
# one act only: a blobless partial clone (--filter=blob:none) keeps the FULL history and
# fetches file contents on demand; it is not a shallow clone
git clone --filter=blob:none --sparse https://github.com/godavid/magyar-jog
cd magyar-jog && git sparse-checkout set jogszabalyok/2013-evi-cxxii-torveny-foldforgalmi index

# PRIMARY RECIPE — every version of an act with its commit SHA (dates = entry into force)
jq -c '.[] | [.datum, .sha]' jogszabalyok/2013-evi-cxxii-torveny-foldforgalmi/allapotok.json

# the text in force on a given day
S=jogszabalyok/2013-evi-cxxii-torveny-foldforgalmi
SHA=$(jq -r '[.[] | select(.datum <= "2024-01-01")] | max_by(.datum) | .sha' $S/allapotok.json)
git show "$SHA:$S/szoveg.md"

# what changed between two versions (SHAs from allapotok.json)
git diff <sha_old> <sha_new> -- jogszabalyok/<slug>/szoveg.md

# the amendment history as git sees it (ALWAYS with a path filter; order is not by date)
git log --date=short --format='%ad %h %s' -- jogszabalyok/<slug>/szoveg.md

# which version last touched a given line
git blame -L 120,140 -- jogszabalyok/<slug>/szoveg.md

# what was added to the repository since a timestamp (all acts; log starts 2026-09-21,
# one file per UTC month, keys {felveve, slug, datum, sha})
cat index/felvetel/*.jsonl | jq -c 'select(.felveve > "2026-09-15T00:00:00Z")'
\`\`\`

Structural units (book, part, chapter, subtitle) and many sections (§) are Markdown headings (\`##\`–\`####\`),
but not all: in many acts a § is plain text (e.g. \`18. § (1) …\`) under the nearest heading, and some acts have no headings at all.
A heading such as \`6:272. § [Megbízási szerződés]\` (Ptk.) has the anchor \`6-272-sz-megbizasi-szerzodes\` on the
website (\`/jogszabaly/<slug>#<anchor>\`). To get a § by number, call \`szakasz\` with \`paragrafus\` (e.g. \`18. §\`);
do not build the anchor yourself.

## Caveats

- The daily run is scheduled at 03:30 UTC, but GitHub usually starts it between 08:00 and 11:00 UTC,
  and it runs for about 25 minutes.
- **Lag:** a version often appears days after its entry into force (228 of 397 versions ingested in
  the first weeks of the log arrived 2–7 days late): njt publishes consolidated texts with a delay,
  and repealed or text-less acts are polled only weekly. Use \`felveve\` in the ingestion log, not
  the commit date, to know when something entered the repo.
- Which amending act caused a change is not recorded in the text; the njt URL in the commit
  message (\`Forrás (njt):\`) is the trail.
- Acts without a consolidated text on njt.jog.gov.hu are missing (about 1,250; the \`nincs-szoveg\`
  layer of \`index/enumeralas.json\`).
- Dates before 1970 are clamped in git metadata; the real date is in the commit message and \`meta.json\`.

## Traps (ranked by how often they bite)

1. \`git log --since/--until\`, \`git log @{date}\`, \`main@{<date>}\`: history is not date-ordered and
   \`@{date}\` reads the local reflog. Both give empty or wrong results. Use \`allapotok.json\`.
2. \`git checkout <old commit>\` is **not** the law of that day: acts were ingested later with
   back-dated commits, so the tree at that commit lacks everything backfilled afterwards.
3. The largest \`verzio\` number is not the latest version: for 282 acts njt version numbers are
   not monotonic with the date. Sort by \`datum\`.
4. Keys are ASCII (\`datum\`, \`felveve\`, \`verzio\`, \`cim\`); there are no accented JSON keys.
5. \`index/kihagyottak.json\` is a backfill snapshot, not the list of missing acts; use the
   \`nincs-szoveg\` layer of \`index/enumeralas.json\`.
6. \`git show <sha>\` on an \`Index frissítés\` or \`Enumerálás-térkép frissítés\` commit shows pipeline
   bookkeeping, not a version of an act. Take SHAs only from \`allapotok.json\`.
7. Reading a whole \`szoveg.md\` into context (up to 2.33 MB) wastes it; use the \`szakasz\` and
   \`kereses\` tools, or \`git show <sha>:<path>\` with a line range.

## Vocabulary

| term | meaning |
|---|---|
| \`datum\` | date of entry into force of a version (\`YYYY-MM-DD\`); the commit date of its commit |
| \`felveve\` | ISO-8601 time the version entered this repository (ingestion log); never equals the commit date |
| \`verzio\` | njt's own version number of a version; not monotonic with \`datum\`, do not sort by it |
| \`documentId\` | njt identifier of an act (\`YYYY-NUMBER-00-00\`) |
| \`slug\` | URL and directory name of an act in this repository (\`jogszabalyok/<slug>/\`) |
| \`megjeloles\` | official designation of an act ("2013. évi V. törvény") |
| \`aktiv\` / \`lezart\` / \`nincs-szoveg\` | layers in \`index/enumeralas.json\`: in force or future version exists / repealed / no consolidated text |

## Maintaining this repository

- \`jogszabalyok/\`, \`index/\` and \`AGENTS.md\` are output of the GitJog pipeline
  (https://github.com/godavid/gitjog). Never hand-edit them: fix the pipeline instead. \`AGENTS.md\`
  is rewritten from the \`AGENTS_MD\` template in \`packages/pipeline/src/sablonok.ts\` on every daily
  run that adds a version, so a hand edit is lost.
- \`.github/workflows/napi-delta.yml\` is a byte-identical copy of
  \`packages/pipeline/adatrepo/napi-delta.yml\` in gitjog: update both together.
- The \`main\` history is never rewritten (no rebase, force-push or \`git filter-repo\`) and never
  reordered: the indexes and the ingestion log reference commit SHAs.
- Do not push to \`main\` while the daily run is active (03:30 UTC cron, usually started 08:00–11:00
  UTC, about 25 minutes): the run writes the new SHAs into the index before it pushes.
- Operations runbook: https://github.com/godavid/gitjog/blob/main/docs/uzemeltetes.md. Human
  overview and licence: [README.md](README.md), [LICENSE](LICENSE), [LICENSE-HU.md](LICENSE-HU.md).
`;
