// njt snapshot-HTML → rendezett tartalomelem-lista.
//
// Az njt oldala a tartalmat `id="sc{documentId}-{seq}"` elemekben adja.
// FONTOS: a seq NEM dokumentumsorrend (a később beszúrt módosítások magas
// sorszámot kapnak), ezért kizárólag a DOM-sorrendre támaszkodunk.
// A szerver a szöveg elejét rendereli, a többi elem üres `pH` placeholder,
// amit a blokk-válasz (njtGetBlock) tartalmaz — a kettő konkatenációja adja
// a teljes szöveget. Ha ez a réteg-feltevés megdől (renderelt elem jönne egy
// border UTÁN), hangosan hibázunk, nem csendben rossz sorrendet írunk.

import * as cheerio from "cheerio";
import type { TeljesSnapshot } from "./crawl.js";

export interface Elem {
  /** az elem osztálylistája (pl. "bekezdesNyito", "szakasz") */
  osztaly: string;
  /** a `jel` span szövege (pl. "(1)", "a)", "1."), ha van */
  jel: string;
  /** a tisztított szöveg (lábjegyzet-hivatkozások nélkül, normalizált szóközökkel) */
  szoveg: string;
}

export interface ParsoltSnapshot {
  /** h1 — a jogszabály megjelölése, pl. "2013. évi V. törvény" */
  megjeloles: string;
  /** h2 — a jogszabály címe, pl. "a Polgári Törvénykönyvről" */
  cim: string;
  /** a lapon feltüntetett időállapot-dátum, YYYY-MM-DD */
  hatalyDatum: string;
  elemek: Elem[];
  /** ismeretlen osztályú elemek (health-ellenőrzéshez) */
  ismeretlenOsztalyok: string[];
}

/** szóköz-normalizálás: NBSP/keskeny szóköz → szóköz, sorozat → egy, trim */
export function szovegTisztitas(s: string): string {
  return s.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
}

function elemFeldolgozas($: cheerio.CheerioAPI, el: cheerio.Element): Elem {
  const $el = $(el);
  const osztaly = ($el.attr("class") ?? "")
    .split(/\s+/)
    .filter((c) => c && c !== "pslice" && c !== "mt")
    .join(" ");
  // lábjegyzet-hivatkozások eltávolítása — a számozásuk időben változik, tiszta zaj
  $el.find("sup.fnSup").remove();
  const jel = szovegTisztitas($el.find("span.jel").first().text());
  $el.find("span.jel").remove();
  // több belső <p> esetén (pl. Alaptörvény preambuluma) bekezdésenként bontunk,
  // különben a szövegek szóköz nélkül folynának össze
  const pk = $el.find("p").toArray();
  const szoveg =
    pk.length > 1
      ? pk.map((p) => szovegTisztitas($(p).text())).filter(Boolean).join("\n\n")
      : szovegTisztitas($el.text());
  return { osztaly, jel, szoveg };
}

function tartalomElemek($: cheerio.CheerioAPI, documentId: string): cheerio.Element[] {
  return $(`[id^="sc${documentId}-"]`).toArray();
}

export function parsolSnapshot(s: TeljesSnapshot, documentId: string): ParsoltSnapshot {
  const $alap = cheerio.load(s.alapHtml);
  const alapElemek = tartalomElemek($alap, documentId);
  if (alapElemek.length === 0) {
    throw new Error(`Nincs egyetlen tartalomelem sem: ${documentId} — njt-változás?`);
  }

  const elemek: Elem[] = [];
  const ismeretlen = new Set<string>();
  let megjeloles = "";
  let cim = "";
  let borderVolt = false;

  for (const el of alapElemek) {
    const $el = $alap(el);
    const osztalyok = ($el.attr("class") ?? "").split(/\s+/);
    if (osztalyok.includes("jogszabalyMainTitle")) {
      $el.find("sup").remove();
      megjeloles = szovegTisztitas($el.text());
      continue;
    }
    if (osztalyok.includes("jogszabalySubtitle")) {
      $el.find("sup.fnSup").remove();
      cim = szovegTisztitas($el.text());
      continue;
    }
    if (osztalyok.includes("borderStart")) {
      borderVolt = true;
      continue;
    }
    if (osztalyok.includes("pH")) continue; // üres placeholder — a blokkokból jön
    if (borderVolt) {
      // Réteg-feltevés megsértve: renderelt elem egy border után.
      throw new Error(
        `Renderelt elem borderStart után (${$el.attr("id")}) — a splicing-feltevés megdőlt, njt-változás?`,
      );
    }
    elemek.push(elemFeldolgozas($alap, el));
  }

  if (borderVolt && s.blokkHtml.length === 0) {
    throw new Error(`Volt borderStart, de nincs blokk-tartalom: ${documentId}`);
  }
  if (s.blokkHtml.length > 0) {
    const $blokk = cheerio.load(s.blokkHtml);
    for (const el of tartalomElemek($blokk, documentId)) {
      elemek.push(elemFeldolgozas($blokk, el));
    }
  }

  const hatalyNyers = szovegTisztitas($alap("div.hataly").first().text()); // "2026.03.01."
  const hatalyDatum = hatalyNyers.replace(/^(\d{4})\.(\d{2})\.(\d{2})\.?$/, "$1-$2-$3");

  if (!megjeloles) throw new Error(`Hiányzó jogszabály-cím (h1): ${documentId}`);

  // ismeretlen osztályok gyűjtése (a normalize ismertjein kívül)
  for (const e of elemek) {
    if (e.osztaly && !ISMERT_OSZTALYOK.has(e.osztaly.split(" ")[0]!)) ismeretlen.add(e.osztaly);
  }

  return { megjeloles, cim, hatalyDatum, elemek, ismeretlenOsztalyok: [...ismeretlen].sort() };
}

/** a normalize.ts által kezelt osztályok — a parser ez alapján jelez ismeretlent */
export const ISMERT_OSZTALYOK = new Set([
  "konyv",
  "konyvcim",
  "resz",
  "reszcim",
  "focim",
  "focimCim",
  "fejezet",
  "fejezetCim",
  "alcim",
  "szakasz",
  "bekezdesNyito",
  "bekezdesZaro",
  "bekezdes",
  "betusPontNyito",
  "betusPontZaro",
  "betusPont",
  "szamosPontNyito",
  "szamosPontZaro",
  "szamosPont",
  "ketbetusAlPont",
  "ketbetusAlPontNyito",
  "ketbetusAlPontZaro",
  "pontZaro",
  "tagolo",
  "tagoloCim",
  "betusAlPont",
  "betusAlPontNyito",
  "betusAlPontZaro",
  "preambulum",
  "alaptorvenyFejezet",
  "cikkRomai",
  "cikkArab",
  "cikkBetu",
  "rendelkezes",
  "szelet",
  "szoveg",
]);
