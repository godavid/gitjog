import type { MetadataRoute } from "next";
import { OLDAL_URL, SITEMAP_SHARDOK } from "@/lib/sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // a keresőoldal kérésenként lekérdezést indít és paraméterenként külön
      // URL — nincs mit indexelni rajta, viszont felemésztené a crawl-keretet
      disallow: "/kereses",
    },
    sitemap: Array.from({ length: SITEMAP_SHARDOK }, (_, id) => `${OLDAL_URL}/sitemap/${id}.xml`),
  };
}
