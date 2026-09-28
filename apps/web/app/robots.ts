import type { MetadataRoute } from "next";
import { OLDAL_URL, SITEMAP_SHARDOK } from "@/lib/sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // az API-leírás maga dokumentum: az agentek erről indulnak
        allow: ["/", "/api/v1/openapi.json"],
        // a keresőoldal kérésenként lekérdezést indít és paraméterenként külön
        // URL — nincs mit indexelni rajta, viszont felemésztené a crawl-keretet
        // az /api/ gépi végpont, a keresőnek nincs rajta indexelnivalója
        disallow: ["/kereses", "/api/"],
      },
      {
        // A felhasználó kérésére, egyenként lekérő asszisztensek (nem indexelő
        // crawlerek). Az /llms.txt a REST-végpontokat ajánlja nekik; a robots.txt-t
        // tiszteletben tartó agent enélkül nem hívhatná meg őket.
        userAgent: ["Claude-User", "ChatGPT-User", "Perplexity-User"],
        allow: ["/", "/api/v1/"],
        disallow: ["/kereses", "/api/"],
      },
    ],
    sitemap: Array.from({ length: SITEMAP_SHARDOK }, (_, id) => `${OLDAL_URL}/sitemap/${id}.xml`),
  };
}
