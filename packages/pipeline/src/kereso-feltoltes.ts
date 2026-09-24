// A keresőindex teljes újraépítése az adat-repóból.
//   NYILT_DB_URL=postgres://... pnpm --filter @gitjog/pipeline kereso-feltoltes
// Újrafuttatható: jogszabályonként törlés + beszúrás, tranzakcióban.
// Célzott pótlás (pl. elhasalt delta-szinkron után):
//   ... kereso-feltoltes -- --slugok=1995-evi-cxvii-torveny-szja,2011-evi-cx-torveny

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { ADAT_REPO_DIR } from "./commit.js";
import { jogszabalyIras, type IndexTetel } from "./kereso-index.js";

const url = process.env.NYILT_DB_URL;
if (!url) {
  console.error("HIBA: NYILT_DB_URL környezeti változó kell (Postgres connection string).");
  process.exit(1);
}

const teljesLista = JSON.parse(
  await readFile(join(ADAT_REPO_DIR, "index", "jogszabalyok.json"), "utf8"),
) as IndexTetel[];
const slugArg = process.argv.find((a) => a.startsWith("--slugok="));
const kertSlugok = slugArg ? new Set(slugArg.slice("--slugok=".length).split(",").filter(Boolean)) : null;
const lista = kertSlugok ? teljesLista.filter((t) => kertSlugok.has(t.slug)) : teljesLista;
if (kertSlugok && lista.length !== kertSlugok.size) {
  const ismert = new Set(lista.map((t) => t.slug));
  console.error(`HIBA: ismeretlen slug: ${[...kertSlugok].filter((s) => !ismert.has(s)).join(", ")}`);
  process.exit(1);
}
const retegek = JSON.parse(
  await readFile(join(ADAT_REPO_DIR, "index", "enumeralas.json"), "utf8"),
) as Record<string, string>;

const sql = postgres(url, { max: 4 });
let szakaszok = 0;
let kesz = 0;
for (const tetel of lista) {
  szakaszok += await jogszabalyIras(sql, tetel, retegek[tetel.documentId] !== "lezart");
  if (++kesz % 200 === 0) console.log(`[${kesz}/${lista.length}] ${szakaszok} szakasz`);
}
console.log(`KÉSZ: ${lista.length} jogszabály, ${szakaszok} szakasz.`);
await sql.end();
