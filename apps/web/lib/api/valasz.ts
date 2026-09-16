// REST-burkolat: query-paraméterek validálása, JSON-válasz CDN-cache fejléccel,
// hibák egységes alakban. A route-fájlok ennyit csinálnak: séma + függvény + cache-idő.

import type { ZodType } from "zod";
import { ApiHiba } from "./kozos";

const CORS = { "Access-Control-Allow-Origin": "*" };

export function parameterek<T>(req: Request, sema: ZodType<T>): T {
  const nyers = Object.fromEntries(new URL(req.url).searchParams.entries());
  const r = sema.safeParse(nyers);
  if (!r.success) {
    const uzenet = r.error.issues.map((i) => `${i.path.join(".") || "?"}: ${i.message}`).join("; ");
    throw new ApiHiba(400, `Hibás paraméter — ${uzenet}`, String(r.error.issues[0]?.path[0] ?? ""));
  }
  return r.data;
}

export function jsonValasz(adat: unknown, cacheMp: number): Response {
  return Response.json(adat, {
    headers: {
      ...CORS,
      "Cache-Control": `public, s-maxage=${cacheMp}, stale-while-revalidate=86400`,
    },
  });
}

export function hibaValasz(e: unknown): Response {
  if (e instanceof ApiHiba) {
    return Response.json(
      { hiba: e.message, mezo: e.mezo ?? null },
      { status: e.status, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }
  console.error("[api]", e);
  return Response.json(
    { hiba: "Átmeneti hiba a forrás elérésekor — próbáld újra kicsit később." },
    { status: 500, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

/** GET-route: paraméterek → függvény → JSON; a cache-idő a hívó döntése lehet a válasz alapján */
export function apiRoute<T>(
  sema: ZodType<T>,
  fn: (p: T) => Promise<unknown>,
  cacheMp: number | ((p: T) => number),
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      const p = parameterek(req, sema);
      const adat = await fn(p);
      return jsonValasz(adat, typeof cacheMp === "function" ? cacheMp(p) : cacheMp);
    } catch (e) {
      return hibaValasz(e);
    }
  };
}
