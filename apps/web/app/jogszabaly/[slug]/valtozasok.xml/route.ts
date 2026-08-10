// Egyetlen jogszabály változásainak RSS-feedje: „figyeltetés" olvasóprogramban.
// A globális feed (/valtozasok.xml) mintájára épül, arra szűkítve, hogy a
// felhasználó a saját néhány törvényét tudja követni.

import { getAllapotokSlug, getJogszabalyok } from "@/lib/adat";
import { datumSzoveg } from "@/lib/datum";
import { OLDAL_URL } from "@/lib/sitemap";

export const dynamic = "force-static";
export const revalidate = 21600;

const DARAB = 50;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(_keres: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [jogszabalyok, sajat] = await Promise.all([getJogszabalyok(), getAllapotokSlug(slug)]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel) return new Response("Nincs ilyen jogszabály", { status: 404 });

  const nev = tetel.rovidites ?? tetel.megjeloles;
  // legfrissebb elöl, de az előző állapotot is ismernünk kell a diff-linkhez
  const utolsok = sajat.slice(-DARAB).reverse();

  const tetelek = utolsok
    .map((a) => {
      const helye = sajat.findIndex((x) => x.datum === a.datum);
      const elozo = helye > 0 ? sajat[helye - 1] : undefined;
      const url = elozo
        ? `${OLDAL_URL}/jogszabaly/${slug}/diff/${elozo.datum}/${a.datum}`
        : `${OLDAL_URL}/jogszabaly/${slug}`;
      const leiras = elozo
        ? `${tetel.megjeloles} ${tetel.cim} — módosítás lépett hatályba ${datumSzoveg(a.datum)} napján. A hivatkozott oldalon látszik, mi került bele a szövegbe és mi került ki belőle.`
        : `${tetel.megjeloles} ${tetel.cim} — hatálybalépés ${datumSzoveg(a.datum)} napján.`;
      return [
        "    <item>",
        `      <title>${esc(`${nev} — mi változott? ${datumSzoveg(a.datum)}`)}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="false">${esc(`${slug}@${a.datum}`)}</guid>`,
        `      <pubDate>${new Date(a.datum).toUTCString()}</pubDate>`,
        `      <description>${esc(leiras)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const frissites = utolsok[0]?.datum;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc(`${nev} — mi változott`)}</title>`,
    `    <link>${OLDAL_URL}/jogszabaly/${esc(slug)}/idovonal</link>`,
    `    <atom:link href="${OLDAL_URL}/jogszabaly/${esc(slug)}/valtozasok.xml" rel="self" type="application/rss+xml" />`,
    `    <description>${esc(`${tetel.megjeloles} ${tetel.cim} — minden hatályba lépett módosítás, a pontos szövegváltozással.`)}</description>`,
    "    <language>hu</language>",
    ...(frissites ? [`    <lastBuildDate>${new Date(frissites).toUTCString()}</lastBuildDate>`] : []),
    tetelek,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
