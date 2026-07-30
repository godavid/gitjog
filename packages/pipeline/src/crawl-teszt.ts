// F1 validációs futás: a három nagy törvény összes múltbeli időállapotának
// letöltése cache-be. Ismételt futásnak csak cache-t szabad olvasnia.

import { JOGSZABALYOK } from "./config.js";
import { getIdoallapotok, getTeljesSnapshot } from "./crawl.js";

const CELOK = ["2013-5-00-00", "2012-100-00-00", "2012-1-00-00"];
const ma = new Date().toISOString().slice(0, 10);

for (const id of CELOK) {
  const js = JOGSZABALYOK.find((j) => j.documentId === id)!;
  const allapotok = await getIdoallapotok(id);
  const multbeli = allapotok.filter((a) => a.hatalyba <= ma);
  console.log(`${js.rovidites ?? js.slug}: ${allapotok.length} állapot, ebből múltbeli: ${multbeli.length}`);
  for (const [i, a] of multbeli.entries()) {
    const s = await getTeljesSnapshot(id, a.version);
    console.log(
      `  [${i + 1}/${multbeli.length}] v${a.version} (${a.hatalyba}) — alap ${(s.alapHtml.length / 1024).toFixed(0)} KB + blokk ${(s.blokkHtml.length / 1024).toFixed(0)} KB`,
    );
  }
}
console.log("KÉSZ");
