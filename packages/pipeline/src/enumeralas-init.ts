// Az index/enumeralas.json első feltöltése a meglévő lemez-cache-ből.
//
//   pnpm --filter @nyilt-jogtar/pipeline enumeralas-init [-- --push]
//
// A backfill után a data/cache minden jogszabály versions.json-ját tartalmazza,
// ezért a besorolás hálózati kérés nélkül elkészül. Ahol mégis hiányzik a
// cache, ott a getIdoallapotok letölti (rate-limitelve). Utána a napi delta
// tartja karban a térképet — ezt a szkriptet nem kell újra futtatni.

import { teljesJogszabalyLista } from "./config.js";
import { getIdoallapotok, maiNapBudapest, UresVerziolistaHiba } from "./crawl.js";
import { ADAT_REPO_DIR, commit, fajlIras, git } from "./commit.js";
import {
  retegBesorolas,
  retegOsszefoglalo,
  retegTerkepJson,
  RETEG_FAJL,
  type RetegTerkep,
} from "./enumeralas.js";

const push = process.argv.includes("--push");
const ma = maiNapBudapest();

const jogszabalyok = await teljesJogszabalyLista();
const terkep: RetegTerkep = {};
let hiba = 0;

for (const js of jogszabalyok) {
  try {
    terkep[js.documentId] = retegBesorolas(await getIdoallapotok(js.documentId), ma);
  } catch (e) {
    if (e instanceof UresVerziolistaHiba) {
      terkep[js.documentId] = "nincs-szoveg";
      continue;
    }
    // letöltési hiba: aktívnak hagyjuk — a napi delta úgyis lekérdezi és pontosít
    terkep[js.documentId] = "aktiv";
    hiba++;
  }
}

console.log(`${jogszabalyok.length} jogszabály besorolva — ${retegOsszefoglalo(terkep)}`);
if (hiba > 0) console.log(`(${hiba} tétel letöltési hiba miatt aktívként — a delta pontosítja)`);

await fajlIras(RETEG_FAJL, retegTerkepJson(terkep));
if (await commit(`Enumerálás-térkép (${retegOsszefoglalo(terkep)})`)) {
  console.log(`${RETEG_FAJL} commitolva.`);
  if (push) {
    await git(["push", "origin", "main"]);
    console.log("Push KÉSZ → origin/main");
  }
} else {
  console.log("A térkép változatlan — nincs commit.");
}
