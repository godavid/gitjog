// A HEAD-blob ellenőrzés tiszta részei az index-ellenorzes szkripthez.
// Kérdés: a HEAD-en lévő `jogszabalyok/<slug>/szoveg.md` ugyanaz a blob, mint
// az index szerinti legutolsó időállapot commitjában? Ha nem, a HEAD régebbi
// (vagy más) szöveget mutat, mint amit az index legfrissebbnek tart — ez történt
// az 1930-evi-xxxvii-torveny esetén, ahol egy 1930-as állapot a 2017-es után
// került commitra. Egyetlen `git cat-file --batch-check` folyamat válaszol az
// összes kérdésre (slugonként két sor: HEAD és az index-sha).

import { spawnSync } from "node:child_process";

/** egy állapot-bejegyzés az index/allapotok.json-ban */
export interface AllapotBejegyzes {
  datum: string;
  verzio: number;
  sha?: string;
}

/** egy jelentett eltérés: slug + rövid magyar indoklás */
export interface Elteres {
  slug: string;
  indoklas: string;
}

const ERVENYES_SLUG = /^[a-z0-9-]+$/;
/** teljes SHA-1 (40) vagy SHA-256 (64) hex commit-azonosító */
export const ERVENYES_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function szovegUt(slug: string): string {
  return `jogszabalyok/${slug}/szoveg.md`;
}

/** a legutolsó időállapot: a legnagyobb dátum, azonos dátumnál a legnagyobb verzió */
export function utolsoAllapot(bejegyzesek: AllapotBejegyzes[]): AllapotBejegyzes | undefined {
  let utolso: AllapotBejegyzes | undefined;
  for (const b of bejegyzesek) {
    if (
      utolso === undefined ||
      b.datum > utolso.datum ||
      (b.datum === utolso.datum && b.verzio > utolso.verzio)
    ) {
      utolso = b;
    }
  }
  return utolso;
}

/**
 * A `git cat-file --batch-check` stdin-sorai: slugonként `HEAD:<út>` és `<sha>:<út>`.
 * A sha nélküli utolsó állapotot kihagyja (azt az „üres SHA" kategória jelenti).
 */
export function batchCheckSorok(
  slugok: string[],
  utolsok: Map<string, AllapotBejegyzes>,
): string[] {
  const sorok: string[] = [];
  for (const slug of slugok) {
    const utolso = utolsok.get(slug);
    if (utolso === undefined || !utolso.sha) continue;
    sorok.push(`HEAD:${szovegUt(slug)}`, `${utolso.sha}:${szovegUt(slug)}`);
  }
  return sorok;
}

/**
 * A `--batch-check` kimenetét (`<sha> <típus> <méret>` vagy `<objektum> missing`
 * soronként, a bemenet sorrendjében) a bemeneti sorokhoz párosítja.
 * Értéke a blob sha-ja, hiányzó objektumnál null.
 */
export function batchCheckParse(kimenet: string, sorok: string[]): Map<string, string | null> {
  const kimenetSorok = kimenet.split("\n").filter((s) => s.length > 0);
  if (kimenetSorok.length !== sorok.length) {
    throw new Error(
      `git cat-file --batch-check: ${sorok.length} bemeneti sorra ${kimenetSorok.length} kimeneti sor jött`,
    );
  }
  const terkep = new Map<string, string | null>();
  for (let i = 0; i < sorok.length; i++) {
    const mezok = kimenetSorok[i]!.trim().split(/\s+/);
    terkep.set(sorok[i]!, mezok[1] === "missing" ? null : mezok[0]!);
  }
  return terkep;
}

/** a HEAD-blob és az index szerinti utolsó állapot blobjának eltérései slugonként */
export function headBlobElteresek(
  headBlobok: Map<string, string | null>,
  allapotBlobok: Map<string, string | null>,
): Elteres[] {
  const elteresek: Elteres[] = [];
  for (const [slug, allapotBlob] of allapotBlobok) {
    const headBlob = headBlobok.get(slug) ?? null;
    if (allapotBlob === null) {
      elteresek.push({ slug, indoklas: "az index-sha commitjában nincs szoveg.md" });
    } else if (headBlob === null) {
      elteresek.push({ slug, indoklas: "a HEAD-en nincs szoveg.md" });
    } else if (headBlob !== allapotBlob) {
      elteresek.push({
        slug,
        indoklas: `a HEAD szoveg.md blobja (${headBlob.slice(0, 7)}) nem az utolsó állapoté (${allapotBlob.slice(0, 7)})`,
      });
    }
  }
  return elteresek;
}

/**
 * A teljes HEAD-blob ellenőrzés egy adat-repón: csak olvasó `git cat-file`,
 * egy folyamat, hálózat és írás nélkül. A sorrend: utolsó állapot slugonként →
 * stdin-sorok → egy batch-check → párosítás → eltérések.
 */
export function headBlobEllenorzes(
  repoDir: string,
  indexAllapotok: Record<string, AllapotBejegyzes[]>,
): Elteres[] {
  const utolsok = new Map<string, AllapotBejegyzes>();
  // A slug és a sha az adat-repo indexéből jön, és soronként a `git cat-file`
  // stdin-jére megy: egy sortörés vagy más karakter elcsúsztatná a sorpárosítást.
  // Az érvénytelen tételt nem kérdezzük le, hanem eltérésként jelentjük.
  const ervenytelen: Elteres[] = [];
  for (const [slug, bejegyzesek] of Object.entries(indexAllapotok)) {
    const utolso = utolsoAllapot(bejegyzesek);
    if (utolso === undefined) continue;
    if (!ERVENYES_SLUG.test(slug) || (utolso.sha && !ERVENYES_SHA.test(utolso.sha))) {
      ervenytelen.push({ slug: JSON.stringify(slug), indoklas: "érvénytelen slug vagy index-sha" });
      continue;
    }
    utolsok.set(slug, utolso);
  }
  const slugok = [...utolsok.keys()].sort();
  const sorok = batchCheckSorok(slugok, utolsok);
  if (sorok.length === 0) return ervenytelen;

  const futas = spawnSync("git", ["-C", repoDir, "cat-file", "--batch-check"], {
    input: sorok.join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (futas.error) throw futas.error;
  if (futas.status !== 0) {
    throw new Error(`git cat-file --batch-check kilépési kód ${futas.status}: ${futas.stderr}`);
  }
  const terkep = batchCheckParse(futas.stdout, sorok);

  const headBlobok = new Map<string, string | null>();
  const allapotBlobok = new Map<string, string | null>();
  for (const slug of slugok) {
    const utolso = utolsok.get(slug)!;
    if (!utolso.sha) continue;
    headBlobok.set(slug, terkep.get(`HEAD:${szovegUt(slug)}`) ?? null);
    allapotBlobok.set(slug, terkep.get(`${utolso.sha}:${szovegUt(slug)}`) ?? null);
  }
  return [...ervenytelen, ...headBlobElteresek(headBlobok, allapotBlobok)];
}
