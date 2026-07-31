// Karbantartó eszköz: a teljes index újraépítése az adat-repóból (meta.json-ok +
// könyvtár-szintű commit-történet). Használat pl. index-séma változás után:
//   NYILT_ADAT_REPO_DIR=<adat-repo> pnpm exec tsx src/index-ujraepites.ts

import { teljesJogszabalyLista } from "./config.js";
import { commit, indexEpites } from "./commit.js";

await indexEpites(await teljesJogszabalyLista());
await commit("Index újraépítés (jogszabalyok.json, allapotok.json, per-jogszabály állapotfájlok)");
console.log("Index újraépítve és commitolva.");
