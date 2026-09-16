// GitHub push-webhook az adat-repóról: a napi delta pusha után az adat-cache
// címkéjét stale-re állítja, így a `valtozasok` és a többi végpont percek alatt
// friss — nem a 6 órás revalidate-ablak végén. HMAC-aláírás kötelező.

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { ADAT_TAG } from "@/lib/adat";

export const dynamic = "force-dynamic";

function alairasRendben(torzs: string, fejlec: string | null, titok: string): boolean {
  if (!fejlec?.startsWith("sha256=")) return false;
  const vart = Buffer.from(`sha256=${createHmac("sha256", titok).update(torzs).digest("hex")}`);
  const kapott = Buffer.from(fejlec);
  return vart.length === kapott.length && timingSafeEqual(vart, kapott);
}

export async function POST(req: Request) {
  const titok = process.env.GITHUB_WEBHOOK_SECRET;
  if (!titok) return Response.json({ hiba: "Nincs beállítva a webhook-titok" }, { status: 503 });

  const torzs = await req.text();
  if (!alairasRendben(torzs, req.headers.get("x-hub-signature-256"), titok)) {
    return Response.json({ hiba: "Érvénytelen aláírás" }, { status: 401 });
  }

  const esemeny = req.headers.get("x-github-event");
  if (esemeny === "ping") return Response.json({ ok: true, esemeny });
  if (esemeny !== "push") return Response.json({ ok: true, esemeny, revalidated: false });

  revalidateTag(ADAT_TAG, "max");
  return Response.json({ ok: true, esemeny, revalidated: true, tag: ADAT_TAG });
}
