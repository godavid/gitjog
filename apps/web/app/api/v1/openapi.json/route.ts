// OpenAPI 3.1 leírás a REST-végpontokról — a WebFetch-es agentek ezt olvassák.
// A paraméter-leírások a sémákkal közösek (lib/api/semak.ts), így nem csúsznak szét.

import { KORLAT, MEGJEGYZES } from "@/lib/api/kozos";
import { LEIRAS as L } from "@/lib/api/semak";
import { OLDAL_URL } from "@/lib/sitemap";

export const dynamic = "force-static";
export const revalidate = 86_400;

const datum = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2024-01-01" };
const q = (nev: string, leiras: string, sema: object, kotelezo = false) => ({
  name: nev,
  in: "query",
  required: kotelezo,
  description: leiras,
  schema: sema,
});
const hiba = { description: "Hiba", content: { "application/json": { schema: { $ref: "#/components/schemas/Hiba" } } } };
const valasz = (leiras: string, sema: string) => ({
  "200": { description: leiras, content: { "application/json": { schema: { $ref: `#/components/schemas/${sema}` } } } },
  "400": hiba,
  "404": hiba,
});

export function GET() {
  const doc = {
    openapi: "3.1.0",
    info: {
      title: "GitJog API",
      version: "1.0.0",
      description:
        "A magyar törvények teljes szövege és változástörténete, §-szintű végpontokkal. Kulcs nélkül, read-only. " +
        `MCP-szerver ugyanezekkel a műveletekkel: ${OLDAL_URL}/api/mcp. ${MEGJEGYZES}`,
      license: { name: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
    },
    servers: [{ url: `${OLDAL_URL}/api/v1` }],
    paths: {
      "/kereses": {
        get: {
          operationId: "kereses",
          summary: "Keresés vagy hivatkozás feloldása — a § teljes szövegével",
          parameters: [
            q("q", L.q, { type: "string" }, true),
            q("hatalyos", L.hatalyos, { type: "boolean", default: true }),
            q("limit", L.keresesLimit, { type: "integer", default: KORLAT.keresesAlap, maximum: KORLAT.keresesMax }),
          ],
          responses: { ...valasz("Találatok", "KeresesValasz"), "503": hiba },
        },
      },
      "/szakasz": {
        get: {
          operationId: "szakasz",
          summary: "Egy § szövege egy időállapotban; § nélkül meta + időállapotok + tartalomjegyzék",
          parameters: [
            q("slug", L.slug, { type: "string" }, true),
            q("horgony", L.horgony, { type: "string" }),
            q("paragrafus", L.paragrafus, { type: "string", example: "18. §" }),
            q("datum", L.datum, datum),
          ],
          responses: valasz("§ vagy jogszabály", "SzakaszValasz"),
        },
      },
      "/valtozasok": {
        get: {
          operationId: "valtozasok",
          summary: "Mi változott? — cursorral vagy dátum/slug szűrővel, az érintett §-ok szövegével",
          description:
            "Legalább egy szűrő kötelező: felveve_utan, since vagy slugs. Figyeléshez a `felveve_utan` cursort használd, és a válasz `kovetkezo_felveve_utan` értékét add vissza a következő hívásban.",
          parameters: [
            q("felveve_utan", L.felveve_utan, { type: "string", format: "date-time" }),
            q("since", L.since, datum),
            q("until", L.until, datum),
            q("slugs", `${L.slugs} Vesszővel elválasztva.`, { type: "string" }),
            q("q", L.qSzuro, { type: "string", example: "föld" }),
            q("limit", L.valtozasokLimit, { type: "integer", default: KORLAT.valtozasokAlap, maximum: KORLAT.valtozasokMax }),
          ],
          responses: valasz("Változás-tételek", "ValtozasokValasz"),
        },
      },
      "/diff": {
        get: {
          operationId: "diff",
          summary: "Két időállapot §-szintű különbsége",
          parameters: [
            q("slug", L.slug, { type: "string" }, true),
            q("tol", L.tol, datum, true),
            q("ig", L.ig, datum, true),
            q("horgony", L.diffHorgony, { type: "string" }),
          ],
          responses: valasz("§-szintű diff", "DiffValasz"),
        },
      },
    },
    components: {
      schemas: {
        Hiba: { type: "object", properties: { hiba: { type: "string" }, mezo: { type: ["string", "null"] } } },
        Talalat: {
          type: "object",
          properties: {
            slug: { type: "string" },
            megjeloles: { type: "string" },
            rovidites: { type: ["string", "null"] },
            cim: { type: "string" },
            szakasz_cim: { type: "string" },
            horgony: { type: "string" },
            szoveg: { type: "string" },
            csonkolt: { type: "boolean" },
            hatalyos: { type: "boolean" },
            url: { type: "string", format: "uri" },
          },
        },
        KeresesValasz: {
          type: "object",
          properties: {
            mod: { type: "string", enum: ["hivatkozas", "szoveg"] },
            talalatok: { type: "array", items: { $ref: "#/components/schemas/Talalat" } },
            megjegyzes: { type: "string" },
          },
        },
        SzakaszValasz: {
          type: "object",
          description: "§ megadásával: szoveg + horgony + sha; § nélkül: idoallapotok + tartalomjegyzek.",
          properties: {
            slug: { type: "string" },
            megjeloles: { type: "string" },
            rovidites: { type: ["string", "null"] },
            cim: { type: "string" },
            hatalyos: { type: "boolean" },
            url: { type: "string", format: "uri" },
            datum: { type: "string" },
            sha: { type: "string" },
            horgony: { type: "string" },
            szakasz_cim: { type: "string" },
            szoveg: { type: "string" },
            nyers_url: { type: "string", format: "uri" },
            idoallapotok: { type: "array", items: { type: "object", properties: { datum: { type: "string" }, sha: { type: "string" } } } },
            tartalomjegyzek: {
              type: "array",
              items: { type: "object", properties: { horgony: { type: "string" }, cim: { type: "string" }, hossz: { type: "integer" } } },
            },
            megjegyzes: { type: "string" },
          },
        },
        ErintettSzakasz: {
          type: "object",
          properties: {
            horgony: { type: "string" },
            cim: { type: "string" },
            tipus: { type: "string", enum: ["modosult", "uj", "torolt"] },
            regi: { type: ["string", "null"] },
            uj: { type: ["string", "null"] },
            csonkolt: { type: "boolean" },
          },
        },
        ValtozasTetel: {
          type: "object",
          properties: {
            slug: { type: "string" },
            megjeloles: { type: "string" },
            rovidites: { type: ["string", "null"] },
            cim: { type: "string" },
            datum: { type: "string" },
            elozo_datum: { type: ["string", "null"] },
            felveve: { type: ["string", "null"], format: "date-time" },
            erintett_szakaszok: { type: "array", items: { $ref: "#/components/schemas/ErintettSzakasz" } },
            tovabbi_szakaszok: { type: "integer" },
            diff_url: { type: ["string", "null"], format: "uri" },
            url: { type: "string", format: "uri" },
          },
        },
        ValtozasokValasz: {
          type: "object",
          properties: {
            mod: { type: "string", enum: ["naplo", "hatalybalepes"] },
            tetelek: { type: "array", items: { $ref: "#/components/schemas/ValtozasTetel" } },
            kovetkezo_felveve_utan: { type: ["string", "null"], format: "date-time" },
            megjegyzes: { type: "string" },
          },
        },
        DiffValasz: {
          type: "object",
          properties: {
            slug: { type: "string" },
            megjeloles: { type: "string" },
            tol: { type: "string" },
            ig: { type: "string" },
            tol_sha: { type: "string" },
            ig_sha: { type: "string" },
            osszegzes: {
              type: "object",
              properties: {
                modosult: { type: "integer" },
                uj: { type: "integer" },
                torolt: { type: "integer" },
                hozzaadott_sor: { type: "integer" },
                torolt_sor: { type: "integer" },
              },
            },
            szakaszok: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  horgony: { type: "string" },
                  cim: { type: "string" },
                  tipus: { type: "string", enum: ["modosult", "uj", "torolt"] },
                  regi: { type: ["string", "null"] },
                  uj: { type: ["string", "null"] },
                  blokkok: { type: "array", items: { type: "object" } },
                },
              },
            },
            url: { type: "string", format: "uri" },
            megjegyzes: { type: "string" },
          },
        },
      },
    },
  };
  return Response.json(doc, {
    headers: { "Cache-Control": "public, s-maxage=86400", "Access-Control-Allow-Origin": "*" },
  });
}
