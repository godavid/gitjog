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
  qSzuro:
    "Jogszabálycímre/rövidítésre illesztett szókezdet (kisbetű- és ékezet-független), „|”-vel több alternatíva, többszavas tag is lehet: „termőföld|földek forgalm|Földalap”. A tag szó elején illeszkedik („föld” → „földek”, de nem „külföld”); a puszta „föld” túl tág (földgáz, földmérés is).",
  valtozasokLimit: `Tételek száma (alap ${KORLAT.valtozasokAlap}, max ${KORLAT.valtozasokMax}).`,
  tol: "A korábbi időállapot napja (YYYY-MM-DD).",
  ig: "A későbbi időállapot napja (YYYY-MM-DD).",
  diffHorgony: "Csak ezt a §-t (horgony).",
};

// Felső hosszkorlát minden szabad szöveges paraméteren: a kereső-regexek és az
// FTS-lekérdezés ne kapjon tetszőleges méretű bemenetet.
const MAX = 200;
const szoveg = () => z.string().max(MAX);
const cursor = z.string().max(40);

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const restBool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");
const restSzam = z.coerce.number().int().positive();

export const MCP = {
  kereses: z.object({
    q: szoveg().min(1).describe(L.q),
    hatalyos: z.boolean().optional().describe(L.hatalyos),
    limit: z.number().int().positive().optional().describe(L.keresesLimit),
  }),
  szakasz: z.object({
    slug: szoveg().min(1).describe(L.slug),
    horgony: szoveg().optional().describe(L.horgony),
    paragrafus: szoveg().optional().describe(L.paragrafus),
    datum: datum.optional().describe(L.datum),
  }),
  valtozasok: z.object({
    felveve_utan: cursor.optional().describe(L.felveve_utan),
    since: datum.optional().describe(L.since),
    until: datum.optional().describe(L.until),
    slugs: z.array(szoveg()).max(KORLAT.valtozasokMax).optional().describe(L.slugs),
    q: szoveg().optional().describe(L.qSzuro),
    limit: z.number().int().positive().optional().describe(L.valtozasokLimit),
  }),
  diff: z.object({
    slug: szoveg().min(1).describe(L.slug),
    tol: datum.describe(L.tol),
    ig: datum.describe(L.ig),
    horgony: szoveg().optional().describe(L.diffHorgony),
  }),
};

export const REST = {
  kereses: z.object({
    q: szoveg().min(1),
    hatalyos: restBool.optional(),
    limit: restSzam.optional(),
  }),
  szakasz: z.object({
    slug: szoveg().min(1),
    horgony: szoveg().optional(),
    paragrafus: szoveg().optional(),
    datum: datum.optional(),
  }),
  valtozasok: z.object({
    felveve_utan: cursor.optional(),
    since: datum.optional(),
    until: datum.optional(),
    slugs: z
      .string()
      .max(MAX * 10)
      .optional()
      .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined)),
    q: szoveg().optional(),
    limit: restSzam.optional(),
  }),
  diff: z.object({
    slug: szoveg().min(1),
    tol: datum,
    ig: datum,
    horgony: szoveg().optional(),
  }),
};

export const LEIRAS = L;
