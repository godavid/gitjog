// Paraméter-sémák. Az MCP-tool tipizált értékeket kap (boolean, number), a
// REST query-string mindent szövegként — ezért két alak, közös leírásokkal.

import { z } from "zod";
import { KORLAT } from "./kozos";

const L = {
  q: "Keresőkifejezés vagy hivatkozás: „termőföld elővásárlási jog”, „Ptk. 6:272. §”, „2013. évi CXXII. törvény 18. §”, „Fftv.”",
  hatalyos: "Csak hatályos szöveg (alap: true). false: a már nem hatályos jogszabályok szövege is.",
  keresesLimit: `Találatok száma (alap ${KORLAT.keresesAlap}, max ${KORLAT.keresesMax}).`,
  slug: "A jogszabály slugja, pl. „2013-evi-cxxii-torveny-foldforgalmi” (a `kereses` adja).",
  horgony: "A § horgonya, pl. „18-sz-elovasarlasi-jog” (a `kereses` vagy a tartalomjegyzék adja).",
  paragrafus: "A § száma horgony helyett: „18. §”, „6:272. §”, „18/A. §”.",
  datum: "Időállapot napja (YYYY-MM-DD): az ezen a napon hatályos szöveg. Alap: a legutolsó.",
  felveve_utan:
    "Cursor: ISO-8601 időbélyeg; csak az ezután a repóba került időállapotok. A válasz `kovetkezo_felveve_utan` mezőjét add vissza a következő hívásban.",
  since: "Hatálybalépés napjától (YYYY-MM-DD).",
  until: "Hatálybalépés napjáig (YYYY-MM-DD).",
  slugs: "Csak ezek a jogszabályok.",
  qSzuro: "Jogszabálycímre/rövidítésre illesztett részszó (kisbetű- és ékezet-független), pl. „föld”.",
  valtozasokLimit: `Tételek száma (alap ${KORLAT.valtozasokAlap}, max ${KORLAT.valtozasokMax}).`,
  tol: "A korábbi időállapot napja (YYYY-MM-DD).",
  ig: "A későbbi időállapot napja (YYYY-MM-DD).",
  diffHorgony: "Csak ezt a §-t (horgony).",
};

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const restBool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");
const restSzam = z.coerce.number().int().positive();

export const MCP = {
  kereses: z.object({
    q: z.string().min(1).describe(L.q),
    hatalyos: z.boolean().optional().describe(L.hatalyos),
    limit: z.number().int().positive().optional().describe(L.keresesLimit),
  }),
  szakasz: z.object({
    slug: z.string().min(1).describe(L.slug),
    horgony: z.string().optional().describe(L.horgony),
    paragrafus: z.string().optional().describe(L.paragrafus),
    datum: datum.optional().describe(L.datum),
  }),
  valtozasok: z.object({
    felveve_utan: z.string().optional().describe(L.felveve_utan),
    since: datum.optional().describe(L.since),
    until: datum.optional().describe(L.until),
    slugs: z.array(z.string()).optional().describe(L.slugs),
    q: z.string().optional().describe(L.qSzuro),
    limit: z.number().int().positive().optional().describe(L.valtozasokLimit),
  }),
  diff: z.object({
    slug: z.string().min(1).describe(L.slug),
    tol: datum.describe(L.tol),
    ig: datum.describe(L.ig),
    horgony: z.string().optional().describe(L.diffHorgony),
  }),
};

export const REST = {
  kereses: z.object({
    q: z.string().min(1),
    hatalyos: restBool.optional(),
    limit: restSzam.optional(),
  }),
  szakasz: z.object({
    slug: z.string().min(1),
    horgony: z.string().optional(),
    paragrafus: z.string().optional(),
    datum: datum.optional(),
  }),
  valtozasok: z.object({
    felveve_utan: z.string().optional(),
    since: datum.optional(),
    until: datum.optional(),
    slugs: z
      .string()
      .optional()
      .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined)),
    q: z.string().optional(),
    limit: restSzam.optional(),
  }),
  diff: z.object({
    slug: z.string().min(1),
    tol: datum,
    ig: datum,
    horgony: z.string().optional(),
  }),
};

export const LEIRAS = L;
