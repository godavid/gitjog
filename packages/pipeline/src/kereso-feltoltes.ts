// A keresőindex teljes újraépítése az adat-repóból.
//   NYILT_DB_URL=postgres://... pnpm --filter @nyilt-jogtar/pipeline kereso-feltoltes
// Újrafuttatható: jogszabályonként törlés + beszúrás, tranzakcióban.

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

const lista = JSON.parse(
  await readFile(join(ADAT_REPO_DIR, "index", "jogszabalyok.json"), "utf8"),
) as IndexTetel[];
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
