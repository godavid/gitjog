import type { MetadataRoute } from "next";
import { SITEMAP_SHARDOK, sitemapShard } from "@/lib/sitemap";

export const revalidate = 21600;

// A shardok a /sitemap/0.xml … /sitemap/5.xml címeken állnak elő; a robots.txt
// sorolja fel őket (a Next nem generál sitemap-indexet).
export async function generateSitemaps() {
  return Array.from({ length: SITEMAP_SHARDOK }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  // az id stringként is megérkezhet a metadata-route-tól: számmá kell alakítani,
  // különben az aritmetika konkatenálna és a shardok átfednének
  return sitemapShard(Number(id));
}
