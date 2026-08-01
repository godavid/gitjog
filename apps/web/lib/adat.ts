// Adatréteg: a magyar-jogtar adat-repo tartalma raw.githubusercontent.com-ról.
// A HEAD-re mutató kérések óránként revalidálódnak (ISR), a commit-SHA-s
// kérések változhatatlanok, ezért örökre cache-elhetők.

export const ADAT_REPO = "godavid/magyar-jogtar";
const RAW = `https://raw.githubusercontent.com/${ADAT_REPO}`;

export interface JogszabalyTetel {
  slug: string;
  documentId: string;
  megjeloles: string;
  cim: string;
  rovidites: string | null;
}

export interface Allapot {
  datum: string; // YYYY-MM-DD
  verzio: number;
  sha: string; // az adott állapotot rögzítő commit
}

async function rawFetch(utvonal: string, orokre = false): Promise<string | null> {
  const valasz = await fetch(`${RAW}/${utvonal}`, {
    next: orokre ? { revalidate: false } : { revalidate: 3600 },
  });
  if (valasz.status === 404) return null;
  if (!valasz.ok) throw new Error(`Adat-repo fetch hiba: HTTP ${valasz.status} — ${utvonal}`);
  return valasz.text();
}

export async function getJogszabalyok(): Promise<JogszabalyTetel[]> {
  const nyers = await rawFetch("main/index/jogszabalyok.json");
  if (!nyers) throw new Error("Hiányzó index/jogszabalyok.json az adat-repóban");
  return JSON.parse(nyers) as JogszabalyTetel[];
}

export async function getAllapotok(): Promise<Record<string, Allapot[]>> {
  const nyers = await rawFetch("main/index/allapotok.json");
  if (!nyers) throw new Error("Hiányzó index/allapotok.json az adat-repóban");
  return JSON.parse(nyers) as Record<string, Allapot[]>;
}

/** egy jogszabály állapotlistája a kis per-törvény fájlból */
export async function getAllapotokSlug(slug: string): Promise<Allapot[]> {
  const nyers = await rawFetch(`main/jogszabalyok/${slug}/allapotok.json`);
  if (!nyers) return [];
  return JSON.parse(nyers) as Allapot[];
}

export async function getSzoveg(slug: string): Promise<string | null> {
  return rawFetch(`main/jogszabalyok/${slug}/szoveg.md`);
}

/** egy múltbeli időállapot szövege az azt rögzítő commit SHA-jánál (immutábilis) */
export async function getSzovegAt(sha: string, slug: string): Promise<string | null> {
  return rawFetch(`${sha}/jogszabalyok/${slug}/szoveg.md`, true);
}

export function nyersUrl(sha: string, slug: string): string {
  return `${RAW}/${sha}/jogszabalyok/${slug}/szoveg.md`;
}
