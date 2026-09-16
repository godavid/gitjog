// GET /api/v1/szakasz?slug=…&paragrafus=18. §&datum=2024-01-01 — lásd lib/api/szakasz.ts
import { szakaszApi } from "@/lib/api/szakasz";
import { REST } from "@/lib/api/semak";
import { apiRoute } from "@/lib/api/valasz";

export const dynamic = "force-dynamic";

// konkrét dátum = múltbeli, változatlan állapot → egy napig cache-elhető
export const GET = apiRoute(REST.szakasz, szakaszApi, (p) => (p.datum ? 86_400 : 3_600));
