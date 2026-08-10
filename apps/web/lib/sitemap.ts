// A sitemap URL-listája és a particionálás közös pontja: az app/sitemap.ts és
// az app/robots.ts is innen dolgozik, hogy a shardok száma egy helyen legyen.

import { unstable_cache } from "next/cache";
import type { MetadataRoute } from "next";
import { evOf, getAllapotok, getJogszabalyok } from "@/lib/adat";

export const OLDAL_URL = "https://jogtar.remenyfarm.hu";

// ~31 500 URL-nél egyetlen fájl is beleférne a sitemaponkénti 50 000-es limitbe,
// de a diff-oldalak száma minden módosítással nő, és egy 3–4 MB-os XML-t
// fölösleges egyben kiszolgálni. Hat shard bőven tartalékot ad.
export const SITEMAP_SHARDOK = 6;

/**
 * Egy shard URL-jei. A teljes lista (~31 500 elem) nem férne a Next adat-cache
 * 2 MB-os korlátjába, egy shardnyi viszont igen — így a Googlebot lekérései nem
 * indítanak minden alkalommal új letöltést a nagy állapot-térképből.
 */
export const sitemapShard = unstable_cache(
  async (id: number): Promise<MetadataRoute.Sitemap> => {
    const osszes = await sitemapUrlok();
    const meret = Math.ceil(osszes.length / SITEMAP_SHARDOK);
    return osszes.slice(id * meret, (id + 1) * meret);
  },
  ["sitemap-shard"],
  { revalidate: 21600 },
);

async function sitemapUrlok(): Promise<MetadataRoute.Sitemap> {
  const [jogszabalyok, allapotok] = await Promise.all([getJogszabalyok(), getAllapotok()]);

  const sorok: MetadataRoute.Sitemap = [
    { url: OLDAL_URL, changeFrequency: "daily", priority: 1 },
    { url: `${OLDAL_URL}/valtozasok`, changeFrequency: "daily", priority: 0.9 },
    { url: `${OLDAL_URL}/adatok`, changeFrequency: "monthly", priority: 0.3 },
  ];

  for (const ev of [...new Set(jogszabalyok.map(evOf))].sort((a, b) => a - b)) {
    sorok.push({ url: `${OLDAL_URL}/evek/${ev}`, changeFrequency: "yearly", priority: 0.3 });
  }

  for (const j of jogszabalyok) {
    const sajat = allapotok[j.slug];
    const utolso = sajat?.at(-1);
    const modositva = utolso ? new Date(utolso.datum) : undefined;

    sorok.push({
      url: `${OLDAL_URL}/jogszabaly/${j.slug}`,
      lastModified: modositva,
      changeFrequency: "monthly",
      priority: j.rovidites ? 0.8 : 0.5,
    });
    if (!sajat?.length) continue;

    sorok.push({
      url: `${OLDAL_URL}/jogszabaly/${j.slug}/idovonal`,
      lastModified: modositva,
      changeFrequency: "monthly",
      priority: 0.4,
    });
    // egymást követő időállapotok: minden szomszédos párra van diff-oldal
    for (let i = 1; i < sajat.length; i++) {
      sorok.push({
        url: `${OLDAL_URL}/jogszabaly/${j.slug}/diff/${sajat[i - 1]!.datum}/${sajat[i]!.datum}`,
        lastModified: new Date(sajat[i]!.datum),
        changeFrequency: "never",
        priority: 0.6,
      });
    }
  }

  return sorok;
}
