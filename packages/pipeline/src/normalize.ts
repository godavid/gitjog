// Parsolt snapshot → determinisztikus Markdown.
//
// A diff minősége ezen múlik: azonos bemenetre byte-azonos kimenet, fix
// sorvégek (LF), fix üressor-szabályok, semmilyen futásfüggő elem (dátum,
// sorszám, véletlen) nem kerül a kimenetbe. LLM-nek itt helye nincs.
//
// Szerkezeti leképezés (szándékosan lapos, a §-központú olvasást segíti):
//   konyv/resz                → ## CÍMKE — CÍM
//   focim/fejezet             → ### CÍMKE — CÍM
//   alaptorvenyFejezet        → ## CÍM
//   alcim/tagolo(+Cim)        → #### jel Cím
//   szakasz / cikk / rendelkezés → #### 6:272. § [Cím]   (üres jelölőnél nincs heading)
//   bekezdés                  → sima bekezdés: "(1) Szöveg…" (egy sor = egy bekezdés)
//   pont (a), 1.)             → "- a) Szöveg…"
//   alpont (aa))              → "  - aa) Szöveg…"
//   táblázat                  → Markdown pipe-tábla külön blokkban

import type { Elem, ParsoltSnapshot } from "./parse.js";

type Sor = { md: string; lista: 0 | 1 | 2 };

function osztalyFo(e: Elem): string {
  return e.osztaly.split(" ")[0] ?? "";
}

const CIMKE_PAR: Record<string, string> = {
  konyv: "konyvcim",
  resz: "reszcim",
  focim: "focimCim",
  fejezet: "fejezetCim",
  tagolo: "tagoloCim",
};

function szoveggel(e: Elem): string {
  return e.jel ? (e.szoveg ? `${e.jel} ${e.szoveg}` : e.jel) : e.szoveg;
}

export function markdownGeneralas(p: ParsoltSnapshot): string {
  const sorok: Sor[] = [];
  const elemek = p.elemek;

  for (let i = 0; i < elemek.length; i++) {
    const e = elemek[i]!;
    const fo = osztalyFo(e);
    const kovetkezo = elemek[i + 1];
    const t = szoveggel(e);

    if (fo in CIMKE_PAR) {
      // címke (pl. "ELSŐ KÖNYV") + közvetlenül követő cím-elem összevonása
      let cim = "";
      if (kovetkezo && osztalyFo(kovetkezo) === CIMKE_PAR[fo]) {
        cim = szoveggel(kovetkezo);
        i++;
      }
      const szint = fo === "konyv" || fo === "resz" ? "##" : "###";
      const felirat = cim && t ? `${t} — ${cim}` : cim || t;
      if (felirat) sorok.push({ md: `${szint} ${felirat}`, lista: 0 });
    } else if (fo === "konyvcim" || fo === "reszcim" || fo === "focimCim" || fo === "fejezetCim" || fo === "tagoloCim") {
      // pár nélkül maradt cím-elem — önálló headingként
      if (t) sorok.push({ md: `### ${t}`, lista: 0 });
    } else if (fo === "alaptorvenyFejezet") {
      if (t) sorok.push({ md: `## ${t}`, lista: 0 });
    } else if (fo === "mellekletCimke") {
      if (t) sorok.push({ md: `### ${t}`, lista: 0 });
    } else if (fo === "alcim" || fo === "mellekletTitle" || fo === "mellekletTagolo") {
      if (t) sorok.push({ md: `#### ${t}`, lista: 0 });
    } else if (fo === "szakasz" || fo.startsWith("cikk") || fo === "rendelkezes") {
      // egyes törvényekben (pl. Mt.) a szakasz-div üres jelölő — akkor nincs heading
      if (t) sorok.push({ md: `#### ${t}`, lista: 0 });
    } else if (fo.startsWith("betusPont") || fo.startsWith("szamosPont") || fo === "mellekletPont") {
      if (t) sorok.push({ md: `- ${t.replace(/\n+/g, " ")}`, lista: 1 });
    } else if (fo.startsWith("ketbetusAlPont") || fo.startsWith("betusAlPont") || fo === "mellekletBetusPont") {
      if (t) sorok.push({ md: `  - ${t.replace(/\n+/g, " ")}`, lista: 2 });
    } else {
      // bekezdés és minden más (ismeretlen osztály is): sima bekezdés-sor
      if (t) sorok.push({ md: t, lista: 0 });
    }

    for (const tabla of e.tablazatok) sorok.push({ md: tabla, lista: 0 });
  }

  const kimenet: string[] = [`# ${p.megjeloles}`, ""];
  if (p.cim) {
    kimenet.push(p.cim, "");
  }
  for (let i = 0; i < sorok.length; i++) {
    const s = sorok[i]!;
    kimenet.push(s.md);
    const kov = sorok[i + 1];
    // listaelemek egy tömbben maradnak (nincs üres sor köztük), minden más után üres sor
    if (!kov || !(s.lista > 0 && kov.lista > 0)) kimenet.push("");
  }
  return kimenet.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}
