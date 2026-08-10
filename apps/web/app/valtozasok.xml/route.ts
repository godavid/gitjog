// A legutóbbi jogszabály-módosítások RSS-feedje. Next 15-ben a route handler
// GET-je alapból nem cache-elt, ezért kell a force-static + revalidate páros.

import { getLegutobbiValtozasok } from "@/lib/adat";
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

export async function GET() {
  const valtozasok = await getLegutobbiValtozasok(DARAB);
  const frissites = valtozasok[0]?.datum;

  const tetelek = valtozasok
    .map((v) => {
      const nev = v.tetel.rovidites ?? v.tetel.megjeloles;
      const url = v.elozoDatum
        ? `${OLDAL_URL}/jogszabaly/${v.tetel.slug}/diff/${v.elozoDatum}/${v.datum}`
        : `${OLDAL_URL}/jogszabaly/${v.tetel.slug}`;
      const leiras = v.elozoDatum
        ? `${v.tetel.megjeloles} ${v.tetel.cim} — módosítás lépett hatályba ${v.datum} napján. A hivatkozott oldalon látszik, mi került bele a szövegbe és mi került ki belőle.`
        : `${v.tetel.megjeloles} ${v.tetel.cim} — hatálybalépés ${v.datum} napján.`;
      return [
        "    <item>",
        `      <title>${esc(`${v.datum} — ${nev}`)}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="false">${esc(`${v.tetel.slug}@${v.datum}`)}</guid>`,
        `      <pubDate>${new Date(v.datum).toUTCString()}</pubDate>`,
        `      <description>${esc(leiras)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Nyílt Jogtár — mi változott</title>",
    `    <link>${OLDAL_URL}/valtozasok</link>`,
    `    <atom:link href="${OLDAL_URL}/valtozasok.xml" rel="self" type="application/rss+xml" />`,
    "    <description>A legutóbb hatályba lépett magyar törvénymódosítások, mindegyiknél a pontos szövegváltozással.</description>",
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
