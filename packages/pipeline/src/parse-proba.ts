// Kézi próbafuttatás: egy cache-elt snapshot → Markdown a szórt ellenőrzéshez.
import { writeFile } from "node:fs/promises";
import { getTeljesSnapshot } from "./crawl.js";
import { parsolSnapshot } from "./parse.js";
import { markdownGeneralas } from "./normalize.js";

const [documentId = "2013-5-00-00", verzio = "44", kiFajl = "/tmp/proba.md"] = process.argv.slice(2);
const s = await getTeljesSnapshot(documentId, Number(verzio));
const p = parsolSnapshot(s, documentId);
const md = markdownGeneralas(p);
await writeFile(kiFajl, md, "utf8");
console.log(`megjelölés: ${p.megjeloles} | cím: ${p.cim} | hatály: ${p.hatalyDatum}`);
console.log(`elemek: ${p.elemek.length} | ismeretlen osztályok: ${p.ismeretlenOsztalyok.join(", ") || "-"}`);
console.log(`md hossz: ${md.length} kar → ${kiFajl}`);
