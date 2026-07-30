// Szerver oldali teljes szövegű kereső: MiniSearch-index §-szintű
// dokumentumokból, modul-szintű cache-sel (a Fluid Compute példány-újra-
// használata miatt a meleg kérések azonnaliak). Óránként újraépül.

import MiniSearch from "minisearch";
import { getJogszabalyok, getSzoveg, type JogszabalyTetel } from "./adat.js";

export interface KeresoDok {
  id: number;
  slug: string;
  jogszabaly: string; // pl. "Ptk. — 2013. évi V. törvény"
  szakasz: string; // a legközelebbi #### heading (pl. "6:272. § [Megbízási szerződés]")
  horgony: string;
  szoveg: string;
}

export interface Talalat {
  slug: string;
  jogszabaly: string;
  szakasz: string;
  horgony: string;
  reszlet: string;
}

interface IndexCsomag {
  mini: MiniSearch<KeresoDok>;
  dokumentumok: Map<number, KeresoDok>;
  epult: number;
}

import { horgonyId } from "./md.js";

function szakaszokraBont(tetel: JogszabalyTetel, md: string, kezdoId: number): KeresoDok[] {
  const nev = tetel.rovidites ? `${tetel.rovidites} (${tetel.megjeloles})` : tetel.megjeloles;
  const dokok: KeresoDok[] = [];
  let cim = "";
  let sorok: string[] = [];
  let id = kezdoId;
  const lezar = () => {
    const szoveg = sorok.join(" ").trim();
    if (szoveg) {
      dokok.push({ id: id++, slug: tetel.slug, jogszabaly: nev, szakasz: cim, horgony: cim ? horgonyId(cim) : "", szoveg });
    }
    sorok = [];
  };
  for (const sor of md.split("\n")) {
    const h = sor.match(/^#{2,4} (.+)$/);
    if (h) {
      lezar();
      cim = h[1]!;
    } else if (sor && !sor.startsWith("# ")) {
      sorok.push(sor.replace(/^ *- /, ""));
    }
  }
  lezar();
  return dokok;
}

let cache: IndexCsomag | null = null;
let epitesFolyamatban: Promise<IndexCsomag> | null = null;

async function epit(): Promise<IndexCsomag> {
  const jogszabalyok = await getJogszabalyok();
  const dokumentumok = new Map<number, KeresoDok>();
  let kovId = 1;
  const mini = new MiniSearch<KeresoDok>({
    fields: ["szakasz", "szoveg"],
    storeFields: [],
    searchOptions: { boost: { szakasz: 3 }, prefix: true, fuzzy: 0.1, combineWith: "AND" },
  });
  for (const tetel of jogszabalyok) {
    const md = await getSzoveg(tetel.slug);
    if (!md) continue;
    const dokok = szakaszokraBont(tetel, md, kovId);
    kovId += dokok.length + 1;
    for (const d of dokok) dokumentumok.set(d.id, d);
    mini.addAll(dokok);
  }
  return { mini, dokumentumok, epult: Date.now() };
}

async function getIndex(): Promise<IndexCsomag> {
  if (cache && Date.now() - cache.epult < 3_600_000) return cache;
  epitesFolyamatban ??= epit().then((cs) => {
    cache = cs;
    epitesFolyamatban = null;
    return cs;
  });
  return epitesFolyamatban;
}

function reszlet(szoveg: string, kifejezesek: string[]): string {
  const kis = szoveg.toLowerCase();
  let poz = -1;
  for (const k of kifejezesek) {
    poz = kis.indexOf(k.toLowerCase());
    if (poz >= 0) break;
  }
  if (poz < 0) poz = 0;
  const eleje = Math.max(0, poz - 90);
  const vege = Math.min(szoveg.length, poz + 210);
  return `${eleje > 0 ? "… " : ""}${szoveg.slice(eleje, vege).trim()}${vege < szoveg.length ? " …" : ""}`;
}

export async function keres(q: string, limit = 40): Promise<Talalat[]> {
  const { mini, dokumentumok } = await getIndex();
  return mini
    .search(q)
    .slice(0, limit)
    .map((t) => {
      const d = dokumentumok.get(t.id as number)!;
      return {
        slug: d.slug,
        jogszabaly: d.jogszabaly,
        szakasz: d.szakasz,
        horgony: d.horgony,
        reszlet: reszlet(d.szoveg, t.terms),
      };
    });
}
