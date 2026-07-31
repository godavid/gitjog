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
    // dél, magyar idő szerint — így a nap minden időzónában stabil
    const stamp = `${opts.datum}T12:00:00+01:00`;
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

export async function commit(uzenet: string, datum?: string): Promise<void> {
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", uzenet], { datum });
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
  const ki = await git(["log", "--reverse", "--format=%H|%cs", "--", `jogszabalyok/${slug}/`]);
  const terkep = new Map<string, string>();
  for (const sor of ki.trim().split("\n")) {
    if (!sor) continue;
    const [sha, datum] = sor.split("|");
    if (sha && datum) terkep.set(datum, sha); // azonos napon az utolsó commit győz
  }
  return terkep;
}
