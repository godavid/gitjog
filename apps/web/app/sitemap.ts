import type { MetadataRoute } from "next";
import { SITEMAP_SHARDOK, sitemapShard } from "@/lib/sitemap";

export const revalidate = 21600;

// A shardok a /sitemap/0.xml … /sitemap/5.xml címeken állnak elő; a robots.txt
// sorolja fel őket (a Next nem generál sitemap-indexet).
export async function generateSitemaps() {
  return Array.from({ length: SITEMAP_SHARDOK }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  // Next 16-tól az id Promise, és stringként érkezik: meg kell várni és számmá
  // alakítani — a `Number(promise)` NaN lenne, és minden shard üresen jönne vissza.
  return sitemapShard(Number(await id));
}
