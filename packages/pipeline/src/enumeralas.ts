// Réteges enumerálás: melyik jogszabály verziólistáját kell MA lekérdezni.
//
// A napi delta korábban mind az 5586 törvényt végigkérdezte (5586 × 550 ms
// rate limit ≈ 51 perc, a 60 perces job-limit alatt épphogy) — pedig a
// többségük soha többé nem változik. Három réteg:
//
//   aktiv        van hatályos vagy jövőbeli időállapota → MINDEN nap
//   lezart       az utolsó időállapota már hatályát vesztette → heti körforgás
//   nincs-szoveg üres njt-verziólista (kihagyottak.json) → heti körforgás
//
// A körforgás állapotmentes: a documentId hash-e választja ki, melyik napon
// esedékes egy nem-aktív tétel. Nincs "utoljára ellenőrizve" mező, amit
// karban kellene tartani, és a terhelés napról napra egyenletes.
//
// A besorolás az adat-repo index/enumeralas.json fájljában él; a napi delta
// minden lekérdezett tételnél frissíti, így egy lezárt törvény visszatérése
// (njt utólagos javítás) legfeljebb egy körforgásnyi késéssel derül ki.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Idoallapot } from "./crawl.js";

export type Reteg = "aktiv" | "lezart" | "nincs-szoveg";

/** documentId → réteg */
export type RetegTerkep = Record<string, Reteg>;

export const RETEG_FAJL = join("index", "enumeralas.json");
/** ennyi naponként kerül sorra egy nem-aktív tétel */
export const KORFORGAS_NAPOK = 7;

/**
 * Egy jogszabály rétege a friss verziólistája alapján. Üres lista (a hívó
 * UresVerziolistaHiba-t kap) esetén "nincs-szoveg" — azt a hívó állítja be.
 */
export function retegBesorolas(allapotok: Idoallapot[], ma: string): Reteg {
  if (allapotok.length === 0) return "nincs-szoveg";
  // a getIdoallapotok hatálybalépés szerint növekvő sorrendet ad
  const utolso = allapotok[allapotok.length - 1]!;
  // lezárt = a legutolsó állapot is hatályát vesztette már. A null (nyitott
  // végű) és a jövőbeli megszűnés egyaránt aktívnak számít; a hatályvesztés
  // NAPJÁN még aktív marad, hogy az aznapi njt-változást biztosan elkapjuk.
  return utolso.hatalyatVeszti !== null && utolso.hatalyatVeszti < ma ? "lezart" : "aktiv";
}

/** FNV-1a — stabil, platformfüggetlen szórás a körforgáshoz */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** napok száma az epoch óta (YYYY-MM-DD alapján, időzóna-mentesen) */
function napIndex(ma: string): number {
  const [ev, ho, nap] = ma.split("-").map(Number);
  return Math.floor(Date.UTC(ev!, ho! - 1, nap!) / 86_400_000);
}

/** A nem-aktív tételek közül ma az kerül sorra, akinek a hash-e a mai napra esik. */
export function esedekesE(reteg: Reteg, documentId: string, ma: string): boolean {
  if (reteg === "aktiv") return true;
  return hash32(documentId) % KORFORGAS_NAPOK === napIndex(ma) % KORFORGAS_NAPOK;
}

/**
 * A mai enumerálandó halmaz. Az ismeretlen (térképben nem szereplő) tétel
 * mindig aktívnak számít — így egy hiányzó vagy sérült enumeralas.json a
 * korábbi, teljes végigjárásra esik vissza, nem hagy ki adatot.
 * A rövidítéses (kiemelt) jogszabályokat mindig visszaadjuk.
 */
export function maiHalmaz<T extends { documentId: string; rovidites?: string }>(
  jogszabalyok: T[],
  terkep: RetegTerkep,
  ma: string,
): T[] {
  return jogszabalyok.filter(
    (j) => j.rovidites != null || esedekesE(terkep[j.documentId] ?? "aktiv", j.documentId, ma),
  );
}

export async function retegTerkepOlvas(adatRepoDir: string): Promise<RetegTerkep> {
  try {
    const nyers = await readFile(join(adatRepoDir, RETEG_FAJL), "utf8");
    const terkep = JSON.parse(nyers) as RetegTerkep;
    return typeof terkep === "object" && terkep !== null ? terkep : {};
  } catch {
    return {}; // nincs még térkép → minden aktívnak számít (teljes enumerálás)
  }
}

/** determinisztikus (documentId szerint rendezett) szerializálás */
export function retegTerkepJson(terkep: RetegTerkep): string {
  const rendezett: RetegTerkep = {};
  for (const id of Object.keys(terkep).sort()) rendezett[id] = terkep[id]!;
  return JSON.stringify(rendezett, null, 2) + "\n";
}

/** emberi összefoglaló a naplóba */
export function retegOsszefoglalo(terkep: RetegTerkep): string {
  const szam: Record<string, number> = { aktiv: 0, lezart: 0, "nincs-szoveg": 0 };
  for (const r of Object.values(terkep)) szam[r] = (szam[r] ?? 0) + 1;
  return `aktív: ${szam.aktiv}, lezárt: ${szam.lezart}, nincs szöveg: ${szam["nincs-szoveg"]}`;
}
