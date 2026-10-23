// GET /api/v1/szakasz?slug=…&paragrafus=18. §&datum=2024-01-01 — lásd lib/api/szakasz.ts
import { szakaszApi } from "@/lib/api/szakasz";
import { REST } from "@/lib/api/semak";
import { apiRoute } from "@/lib/api/valasz";
import { szakaszCacheMp } from "@/lib/api/cache-ido";

export const dynamic = "force-dynamic";

// csak a mai napnál korábbi dátum végleges → egy napig cache-elhető; a mai/jövőbeli
// datumot még érintheti a napi delta, ezért rövid cache (lásd cache-ido.ts)
export const GET = apiRoute(REST.szakasz, szakaszApi, (p) => szakaszCacheMp(p.datum));
