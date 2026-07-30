// Udvarias njt-crawler: rate-limit, retry exponenciális backoffal, lemez-cache.
// A hostról és a fejlécekről lásd docs/uzemeltetes.md — a njt.hu (jog.gov.hu nélkül)
// TLS-szinten reseteli a nem böngésző klienseket, ezért kizárólag a
// njt.jog.gov.hu hostot használjuk, HTTP/1.1-en (a Node fetch defaultja).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NJT_BASE, RATE_LIMIT_MS, USER_AGENT } from "./config.js";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const CACHE_DIR = process.env.NYILT_CACHE_DIR ?? join(GYOKER, "data", "cache");

/** Egy jogszabály egy időállapota az njt verziólistájából. */
export interface Idoallapot {
  version: number;
  /** hatálybalépés napja, YYYY-MM-DD (magyar helyi idő szerint) */
  hatalyba: string;
  /** a következő állapot hatálybalépésének napja, vagy null ha ez a legutolsó */
  hatalyatVeszti: string | null;
  current: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let utolsoKeres = 0;
const BACKOFF_MS = [2_000, 8_000, 30_000];

/** Rate-limitelt, retry-oló fetch az njt felé. Csak 200-at fogad el. */
export async function njtFetch(path: string, form?: Record<string, string>): Promise<string> {
  const url = `${NJT_BASE}${path}`;
  let utolsoHiba: unknown;
  for (let proba = 0; proba <= BACKOFF_MS.length; proba++) {
    const varakozas = utolsoKeres + RATE_LIMIT_MS - Date.now();
    if (varakozas > 0) await sleep(varakozas);
    utolsoKeres = Date.now();
    try {
      const res = await fetch(url, {
        method: form ? "POST" : "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "hu-HU,hu;q=0.9",
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 200) return await res.text();
      utolsoHiba = new Error(`HTTP ${res.status} — ${url}`);
      // 4xx-re (a 429 kivételével) nincs értelme újrapróbálni
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw utolsoHiba;
    } catch (e) {
      if (e === utolsoHiba) throw e;
      utolsoHiba = e;
    }
    if (proba < BACKOFF_MS.length) await sleep(BACKOFF_MS[proba]!);
  }
  throw new Error(`njt-kérés végleg meghiúsult: ${url} — ${String(utolsoHiba)}`);
}

async function cacheOlvas(relPath: string): Promise<string | null> {
  try {
    return await readFile(join(CACHE_DIR, relPath), "utf8");
  } catch {
    return null;
  }
}

async function cacheIr(relPath: string, tartalom: string): Promise<void> {
  const teljes = join(CACHE_DIR, relPath);
  await mkdir(dirname(teljes), { recursive: true });
  await writeFile(teljes, tartalom, "utf8");
}

/** Az njt ISO-timestampje ("2026-12-09T00:00:00+01:00") már magyar helyi idő → a dátumrész a helyes nap. */
function napra(iso: string): string {
  return iso.slice(0, 10);
}

/** a mai nap magyar helyi idő szerint (az njt hatálydátumaival ez vethető össze) */
export function maiNapBudapest(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
}

/**
 * Azonos napon hatályba lépő és aznap felül is írt (0 napot élt) állapotok
 * közül a ténylegesen érvényesült győz: előbb a 0 napos vesztesek, aztán
 * verziószám szerint — a csoport utolsó eleme a győztes. A verziószám önmagában
 * NEM megbízható döntő, mert nem monoton a dátummal.
 */
export function napiGyoztesek(allapotok: Idoallapot[]): Idoallapot[] {
  const csoportok = new Map<string, Idoallapot[]>();
  for (const a of allapotok) {
    const cs = csoportok.get(a.hatalyba) ?? [];
    cs.push(a);
    csoportok.set(a.hatalyba, cs);
  }
  const ki: Idoallapot[] = [];
  for (const cs of csoportok.values()) {
    cs.sort((x, y) => {
      const xElt = x.hatalyatVeszti === x.hatalyba ? 0 : 1;
      const yElt = y.hatalyatVeszti === y.hatalyba ? 0 : 1;
      return xElt - yElt || x.version - y.version;
    });
    ki.push(cs[cs.length - 1]!);
  }
  return ki.sort((a, b) => (a.hatalyba < b.hatalyba ? -1 : 1));
}

/**
 * Egy jogszabály összes időállapota, hatálybalépés szerint növekvő sorrendben.
 * FIGYELEM: az njt verziószáma NEM monoton a dátummal, ezért mindig a
 * comingIntoForce szerint rendezünk. `fresh: true` esetén (napi delta) a
 * cache-t megkerüljük, de az eredményt frissítjük benne.
 */
export async function getIdoallapotok(
  documentId: string,
  opts: { fresh?: boolean } = {},
): Promise<Idoallapot[]> {
  const cacheUt = join(documentId, "versions.json");
  let nyers = opts.fresh ? null : await cacheOlvas(cacheUt);
  if (nyers === null) {
    nyers = await njtFetch("/ajax/collectAllDocumentVersion.json", { documentId });
    await cacheIr(cacheUt, nyers);
  }
  const valasz = JSON.parse(nyers) as {
    data?: { version: number; comingIntoForce: string; expiresOn: string | null; current?: boolean }[];
  };
  if (!valasz.data || valasz.data.length === 0) {
    throw new Error(`Üres verziólista: ${documentId} — rossz documentId vagy njt-változás?`);
  }
  return valasz.data
    .map((v) => ({
      version: v.version,
      hatalyba: napra(v.comingIntoForce),
      hatalyatVeszti: v.expiresOn ? napra(v.expiresOn) : null,
      current: v.current === true,
    }))
    .sort((a, b) => (a.hatalyba < b.hatalyba ? -1 : a.hatalyba > b.hatalyba ? 1 : a.version - b.version));
}

/** Egy időállapot teljes njt-HTML-je (szerver oldali render), lemez-cache-sel. */
export async function getSnapshotHtml(documentId: string, version: number): Promise<string> {
  const cacheUt = join(documentId, `${version}.html`);
  const cachelt = await cacheOlvas(cacheUt);
  if (cachelt !== null) return cachelt;
  const html = await njtFetch(`/jogszabaly/${documentId}.${version}`);
  if (html.length < 10_000) {
    throw new Error(
      `Gyanúsan rövid snapshot (${html.length} byte): ${documentId}.${version} — nem cache-elem`,
    );
  }
  await cacheIr(cacheUt, html);
  return html;
}

/**
 * Az njt nagy jogszabályoknál csak részben rendereli a szöveget: a hiányzó
 * szakaszokat `borderStart` placeholder-divek jelölik (data-show-order), és a
 * /ajax/njtGetBlock.json adja vissza HTML-fragmentként — az összes blokk
 * kérhető EGY batch-POST-tal. Kis jogszabálynál nincs border → nincs blokk-kérés.
 */
export function borderekKiolvasasa(alapHtml: string): { start: number; last?: number }[] {
  const borderek: { start: number; last?: number }[] = [];
  const divRe = /<div[^>]*class="[^"]*\bborderStart\b[^"]*"[^>]*>/g;
  for (const m of alapHtml.matchAll(divRe)) {
    const tag = m[0];
    const start = tag.match(/data-show-order="(\d+)"/);
    if (!start) continue;
    const last = tag.match(/data-last-show-order="(\d+)"/);
    borderek.push(last ? { start: Number(start[1]), last: Number(last[1]) } : { start: Number(start[1]) });
  }
  return borderek;
}

async function njtFetchJson(path: string, body: unknown): Promise<string> {
  // A blokk-végpont application/json törzset vár (nem form-encodedet)
  const url = `${NJT_BASE}${path}`;
  const varakozas = utolsoKeres + RATE_LIMIT_MS - Date.now();
  if (varakozas > 0) await sleep(varakozas);
  utolsoKeres = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "hu-HU,hu;q=0.9",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} — ${url}`);
  return await res.text();
}

export interface TeljesSnapshot {
  alapHtml: string;
  /** a lazy-load-olt blokkok összefűzött HTML-je ("" ha a teljes szöveg renderelt volt) */
  blokkHtml: string;
}

/** Alap-HTML + az összes lazy blokk, cache-sel. Ebből áll össze a teljes szöveg. */
export async function getTeljesSnapshot(documentId: string, version: number): Promise<TeljesSnapshot> {
  const alapHtml = await getSnapshotHtml(documentId, version);
  const blokkUt = join(documentId, `${version}.blocks.html`);
  let blokkHtml = await cacheOlvas(blokkUt);
  if (blokkHtml === null) {
    const borderek = borderekKiolvasasa(alapHtml);
    if (borderek.length === 0) {
      blokkHtml = "";
    } else {
      blokkHtml = await njtFetchJson("/ajax/njtGetBlock.json", {
        documentId: `${documentId}.${version}`,
        data: borderek,
      });
      if (blokkHtml.length < 50) {
        throw new Error(
          `Üres blokk-válasz: ${documentId}.${version} (${borderek.length} border) — njt-változás?`,
        );
      }
    }
    await cacheIr(blokkUt, blokkHtml);
  }
  return { alapHtml, blokkHtml };
}
