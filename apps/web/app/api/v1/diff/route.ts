// GET /api/v1/diff?slug=…&tol=2024-01-01&ig=2025-01-01 — lásd lib/api/diff.ts
import { diffApi } from "@/lib/api/diff";
import { REST } from "@/lib/api/semak";
import { apiRoute } from "@/lib/api/valasz";

export const dynamic = "force-dynamic";

// két rögzített időállapot diffje nem változik
export const GET = apiRoute(REST.diff, diffApi, 86_400);
