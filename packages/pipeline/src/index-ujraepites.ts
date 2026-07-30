// Karbantartó eszköz: az index/allapotok.json újraépítése az adat-repóból.
// Forrás: a meta.json-ok allapotok-listája (teljes) + a könyvtár-szintű
// commit-történet (allapotShaTerkep). Használat pl. index-séma javítás után:
//   NYILT_ADAT_REPO_DIR=<adat-repo> pnpm exec tsx src/index-ujraepites.ts

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JOGSZABALYOK } from "./config.js";
import { ADAT_REPO_DIR, allapotShaTerkep, commit, fajlIras } from "./commit.js";

const allapotIndex: Record<string, { datum: string; verzio: number; sha: string }[]> = {};
for (const js of JOGSZABALYOK) {
  const meta = JSON.parse(
    await readFile(join(ADAT_REPO_DIR, "jogszabalyok", js.slug, "meta.json"), "utf8"),
  ) as { allapotok: { datum: string; verzio: number }[] };
  const shak = await allapotShaTerkep(js.slug);
  allapotIndex[js.slug] = meta.allapotok
    .map((a) => ({ ...a, sha: shak.get(a.datum) ?? "" }))
    .filter((a) => a.sha !== "");
  const hianyzo = meta.allapotok.length - allapotIndex[js.slug]!.length;
  if (hianyzo > 0) console.log(`${js.slug}: ${hianyzo} állapotnak nincs commitja (?)`);
}
await fajlIras("index/allapotok.json", JSON.stringify(allapotIndex, null, 2) + "\n");
await commit("Index újraépítés: minden időállapot szerepel (könyvtár-szintű SHA-térkép)");
console.log("Index újraépítve és commitolva.");
