// Git commit-pipeline az adat-repóhoz: dátumhelyes commit-stream építése.
// Egy commit = egy hatálybalépési nap, benne az aznap változott összes fájl;
// az authored + committer date a hatálybalépés napja.

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ADAT_REPO_URL, NJT_BASE, type Jogszabaly } from "./config.js";

const execFileP = promisify(execFile);
const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ADAT_REPO_DIR = process.env.NYILT_ADAT_REPO_DIR ?? join(GYOKER, "data", "repo");

/** a commit-szerző az adat-repóban */
const BOT_NEV = "Nyílt Jogtár";
const BOT_EMAIL = "info@remenyfarm.hu";

export async function git(args: string[], opts: { datum?: string } = {}): Promise<string> {
  const env = { ...process.env };
  if (opts.datum) {
    // A git nem tud 1970 előtti (negatív epoch) commit-dátumot tárolni, ezért a
    // történeti (pl. 1902-es) hatálybalépések a korszakhatárra kerülnek — a valós
    // dátum a commit-üzenetben és a meta.json allapotok-listájában él.
    const datum = opts.datum < "1970-01-01" ? "1970-01-01" : opts.datum;
    // dél, magyar idő szerint — így a nap minden időzónában stabil
    const stamp = `${datum}T12:00:00+01:00`;
    env.GIT_AUTHOR_DATE = stamp;
    env.GIT_COMMITTER_DATE = stamp;
  }
  env.GIT_AUTHOR_NAME = BOT_NEV;
  env.GIT_AUTHOR_EMAIL = BOT_EMAIL;
  env.GIT_COMMITTER_NAME = BOT_NEV;
  env.GIT_COMMITTER_EMAIL = BOT_EMAIL;
  const { stdout } = await execFileP("git", ["-C", ADAT_REPO_DIR, ...args], {
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function repoInit(): Promise<void> {
  await mkdir(ADAT_REPO_DIR, { recursive: true });
  await execFileP("git", ["init", "-b", "main", ADAT_REPO_DIR]);
  await git(["remote", "add", "origin", ADAT_REPO_URL]);
}

export async function fajlIras(relUt: string, tartalom: string): Promise<void> {
  const teljes = join(ADAT_REPO_DIR, relUt);
  await mkdir(dirname(teljes), { recursive: true });
  await writeFile(teljes, tartalom, "utf8");
}

/**
 * Stage + commit. Ha tartalmilag nincs változás (pl. crash utáni újrafutásnál a
 * determinisztikus kimenet már commitolva van), NEM commitol és false-t ad —
 * így a megszakadt backfill duplikáció nélkül folytatható.
 */
export async function commit(uzenet: string, datum?: string): Promise<boolean> {
  await git(["add", "-A"]);
  const allapot = await git(["status", "--porcelain"]);
  if (allapot.trim() === "") return false;
  await git(["commit", "-q", "-m", uzenet], { datum });
  return true;
}

/**
 * Push a main-re, elutasításnál rebase és újrapróbálás.
 *
 * A remote előrébb járhat: átfedő Actions-futás (az ütemezett és egy kézi
 * indítás beleérhet egymás ablakába) vagy kézi push. Ilyenkor a napi delta nem
 * hasalhat el — 2026-08-08-án pontosan ez történt, non-fast-forward hibával és
 * riasztó issue-val, pedig az adat rendben volt.
 *
 * A rebase biztonságos: az AUTHOR-dátum (a hatálybalépés napja) megmarad, és az
 * index SHA-térképe a commit ÜZENETÉBŐL olvassa a dátumot, nem a committer-
 * dátumból (lásd shaTerkepParse), így az átírt committer-dátum nem zavar.
 */
export async function pushRebase(probak = 3): Promise<void> {
  for (let proba = 1; ; proba++) {
    try {
      await git(["push", "origin", "main"]);
      return;
    } catch (e) {
      if (proba >= probak) throw e;
      console.log(`Push elutasítva (${proba}. próba) — rebase és újrapróbálás.`);
      await git(["pull", "--rebase", "origin", "main"]);
    }
  }
}

export interface AllapotBejegyzes {
  datum: string;
  verzio: number;
}

export function metaJson(
  js: Jogszabaly,
  cim: string,
  allapotok: AllapotBejegyzes[],
): string {
  return (
    JSON.stringify(
      {
        documentId: js.documentId,
        megjeloles: js.megjeloles,
        cim,
        rovidites: js.rovidites ?? null,
        slug: js.slug,
        forras: `${NJT_BASE}/jogszabaly/${js.documentId}`,
        megjegyzes: "Nem hiteles szöveg — hiteles forrás: njt.jog.gov.hu és a Magyar Közlöny.",
        allapotok,
      },
      null,
      2,
    ) + "\n"
  );
}

/**
 * Egységes index-építés a repóban lévő meta.json-okból: index/jogszabalyok.json,
 * index/allapotok.json ÉS jogszabalyonként allapotok.json (a weboldal a kicsit
 * olvassa a több MB-os központi helyett). A meta nélküli (ki nem játszott)
 * jogszabályokat átugorja. Idempotens; a hívó commitol utána.
 */
export async function indexEpites(jogszabalyok: Jogszabaly[]): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  const lista: { slug: string; documentId: string; megjeloles: string; cim: string; rovidites: string | null }[] = [];
  const allapotIndex: Record<string, { datum: string; verzio: number; sha: string }[]> = {};
  for (const js of jogszabalyok) {
    let meta: { cim: string; rovidites: string | null; allapotok: AllapotBejegyzes[] };
    try {
      meta = JSON.parse(
        await readFile(join(ADAT_REPO_DIR, "jogszabalyok", js.slug, "meta.json"), "utf8"),
      );
    } catch {
      continue; // ehhez a jogszabályhoz (még) nincs adat
    }
    lista.push({
      slug: js.slug,
      documentId: js.documentId,
      megjeloles: js.megjeloles,
      cim: meta.cim || js.cim,
      rovidites: meta.rovidites ?? js.rovidites ?? null,
    });
    const shak = await allapotShaTerkep(js.slug);
    const sajat = meta.allapotok
      .map((a) => ({ datum: a.datum, verzio: a.verzio, sha: shak.get(a.datum) ?? "" }))
      .filter((a) => a.sha !== "");
    allapotIndex[js.slug] = sajat;
    await fajlIras(`jogszabalyok/${js.slug}/allapotok.json`, JSON.stringify(sajat, null, 2) + "\n");
  }
  lista.sort((a, b) => a.slug.localeCompare(b.slug));
  await fajlIras("index/jogszabalyok.json", JSON.stringify(lista, null, 2) + "\n");
  await fajlIras("index/allapotok.json", JSON.stringify(allapotIndex, null, 2) + "\n");
}

/**
 * slug → (datum → commit SHA) térkép a jogszabály KÖNYVTÁRÁNAK history-jából.
 * Szándékosan a könyvtár és nem a szoveg.md: van olyan njt-verzió, ahol a
 * szöveg nem változik (csak lábjegyzet, amit kiszűrünk) — ilyenkor csak a
 * meta.json módosul, de az állapotnak akkor is szerepelnie kell az indexben,
 * különben a napi delta örökké "újként" látná (fantom-állapot hurok).
 */
export async function allapotShaTerkep(slug: string): Promise<Map<string, string>> {
  const ki = await git(["log", "--reverse", "--format=%H|%cs|%s", "--", `jogszabalyok/${slug}/`]);
  return shaTerkepParse(ki);
}

/**
 * A `%H|%cs|%s` sorok feldolgozása. A kulcs NEM a commit dátuma lehet, mert az
 * 1970 előtti hatálybalépéseket a git() az epoch-határra csúsztatja (lásd ott) —
 * egy 1902-es időállapot commit-dátuma 1970-01-01, így a dátum szerinti
 * párosítás elvesztené. Az üzenet első sorában viszont MINDIG a valódi nap áll
 * ("… — időállapot 1902-09-21" / "Időállapotok 1902-09-21: …"), ezért az a
 * mérvadó; dátum nélküli üzenetnél (index-commitok) marad a commit dátuma.
 */
export function shaTerkepParse(gitLogKimenet: string): Map<string, string> {
  const terkep = new Map<string, string>();
  for (const sor of gitLogKimenet.trim().split("\n")) {
    if (!sor) continue;
    const [sha, commitDatum, ...uzenetReszek] = sor.split("|");
    if (!sha || !commitDatum) continue;
    const uzenetDatum = uzenetReszek.join("|").match(/\d{4}-\d{2}-\d{2}/)?.[0];
    terkep.set(uzenetDatum ?? commitDatum, sha); // azonos napra az utolsó commit győz
  }
  return terkep;
}
