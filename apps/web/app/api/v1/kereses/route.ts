// GET /api/v1/kereses?q=…&hatalyos=true&limit=10 — lásd lib/api/kereses.ts
import { keresesApi } from "@/lib/api/kereses";
import { REST } from "@/lib/api/semak";
import { apiRoute } from "@/lib/api/valasz";

export const dynamic = "force-dynamic";

export const GET = apiRoute(REST.kereses, keresesApi, 3_600);
