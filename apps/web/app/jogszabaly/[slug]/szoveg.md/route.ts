// A jogszabály nyers Markdown-szövege azonos eredetről. Eddig az egyetlen nyers
// hivatkozás a GitHub raw felületére vitt el a domainről; így az ügynökök és a
// crawlerek itt is megkapják a forrást, feldolgozható alakban.

import { getAllapotokSlug, getJogszabalyok, getSzoveg } from "@/lib/adat";

export const dynamic = "force-static";
export const revalidate = 21600;

export async function GET(_keres: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [jogszabalyok, szoveg, sajat] = await Promise.all([
    getJogszabalyok(),
    getSzoveg(slug),
    getAllapotokSlug(slug),
  ]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel || szoveg === null) {
    return new Response("Nincs ilyen jogszabály", { status: 404 });
  }

  const utolso = sajat.at(-1);
  // A fejléc-megjegyzés a szöveg elé kerül: aki csak ezt a fájlt kapja meg,
  // abból is lássa, melyik időállapotról van szó és hogy nem hiteles forrás.
  const fejlec = [
    `<!-- ${tetel.megjeloles} ${tetel.cim}`,
    utolso ? `     Hatályos állapot: ${utolso.datum}, ${sajat.length} időállapotból.` : null,
    `     Forrás: https://njt.jog.gov.hu/jogszabaly/${tetel.documentId} (hiteles szöveg)`,
    `     Ez a fájl automatikus feldolgozás eredménye — nem hiteles jogforrás. -->`,
    "",
  ]
    .filter((s) => s !== null)
    .join("\n");

  return new Response(`${fejlec}${szoveg}`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
