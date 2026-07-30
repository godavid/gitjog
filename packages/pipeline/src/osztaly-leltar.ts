// Egyszeri felderítő: minden MVP-jogszabály AKTUÁLIS snapshotjának osztályai,
// kiemelve az ISMERT_OSZTALYOK-on kívülieket — a normalize bővítéséhez.
import * as cheerio from "cheerio";
import { JOGSZABALYOK } from "./config.js";
import { getIdoallapotok, getTeljesSnapshot } from "./crawl.js";
import { ISMERT_OSZTALYOK } from "./parse.js";

const ma = new Date().toISOString().slice(0, 10);
const ismeretlenek = new Map<string, string[]>(); // osztály → mely törvényekben

for (const js of JOGSZABALYOK) {
  const allapotok = await getIdoallapotok(js.documentId);
  const aktualis = allapotok.filter((a) => a.hatalyba <= ma).at(-1)!;
  const s = await getTeljesSnapshot(js.documentId, aktualis.version);
  for (const html of [s.alapHtml, s.blokkHtml]) {
    if (!html) continue;
    const $ = cheerio.load(html);
    $(`[id^="sc${js.documentId}-"]`).each((_, el) => {
      const cls = ($(el).attr("class") ?? "").split(/\s+/)[0];
      if (!cls || cls === "pH" || cls === "pslice") return;
      if (!ISMERT_OSZTALYOK.has(cls)) {
        const hol = ismeretlenek.get(cls) ?? [];
        if (!hol.includes(js.slug)) hol.push(js.slug);
        ismeretlenek.set(cls, hol);
      }
    });
  }
  console.log(`${js.slug}: v${aktualis.version} OK`);
}

console.log("\n=== ISMERETLEN OSZTÁLYOK ===");
for (const [cls, hol] of [...ismeretlenek.entries()].sort()) {
  console.log(`${cls}  ←  ${hol.slice(0, 5).join(", ")}${hol.length > 5 ? ` (+${hol.length - 5})` : ""}`);
}
if (ismeretlenek.size === 0) console.log("(nincs)");
