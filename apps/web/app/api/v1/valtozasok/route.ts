// GET /api/v1/valtozasok?felveve_utan=…&q=föld — lásd lib/api/valtozasok.ts
import { valtozasokApi } from "@/lib/api/valtozasok";
import { REST } from "@/lib/api/semak";
import { apiRoute } from "@/lib/api/valasz";

export const dynamic = "force-dynamic";

// a „mi új?" kérdésre rövid cache: a napi delta után 15 percen belül friss
export const GET = apiRoute(REST.valtozasok, valtozasokApi, 900);
