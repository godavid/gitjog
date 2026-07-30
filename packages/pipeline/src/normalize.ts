// Parsolt snapshot → determinisztikus Markdown.
//
// A diff minősége ezen múlik: azonos bemenetre byte-azonos kimenet, fix
// sorvégek (LF), fix üressor-szabályok, semmilyen futásfüggő elem (dátum,
// sorszám, véletlen) nem kerül a kimenetbe. LLM-nek itt helye nincs.
//
// Szerkezeti leképezés (szándékosan lapos, a §-központú olvasást segíti):
//   konyv/resz            → ## CÍMKE — CÍM
//   focim/fejezet         → ### CÍMKE — CÍM
//   alcim                 → #### jel Cím
//   szakasz               → #### 6:272. § [Cím]
//   bekezdés              → sima bekezdés: "(1) Szöveg…" (egy sor = egy bekezdés)
//   pont (a), 1.)         → "- a) Szöveg…"
//   alpont (aa))          → "  - aa) Szöveg…"

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

    if (fo in CIMKE_PAR) {
      // címke (pl. "ELSŐ KÖNYV") + közvetlenül követő cím-elem összevonása
      let cim = "";
      if (kovetkezo && osztalyFo(kovetkezo) === CIMKE_PAR[fo]) {
        cim = szoveggel(kovetkezo);
        i++;
      }
      const szint = fo === "konyv" || fo === "resz" ? "##" : "###";
      sorok.push({ md: cim ? `${szint} ${szoveggel(e)} — ${cim}` : `${szint} ${szoveggel(e)}`, lista: 0 });
      continue;
    }
    if (fo === "konyvcim" || fo === "reszcim" || fo === "focimCim" || fo === "fejezetCim" || fo === "tagoloCim") {
      // pár nélkül maradt cím-elem (elvileg nem fordul elő) — önálló headingként
      sorok.push({ md: `### ${szoveggel(e)}`, lista: 0 });
      continue;
    }
    if (fo === "alaptorvenyFejezet") {
      sorok.push({ md: `## ${szoveggel(e)}`, lista: 0 });
      continue;
    }
    if (fo === "alcim" || fo === "tagolo") {
      sorok.push({ md: `#### ${szoveggel(e)}`, lista: 0 });
      continue;
    }
    // szakasz (§) és az Alaptörvény cikkei / záró rendelkezés-pontjai
    if (fo === "szakasz" || fo.startsWith("cikk") || fo === "rendelkezes") {
      sorok.push({ md: `#### ${szoveggel(e)}`, lista: 0 });
      continue;
    }
    if (fo.startsWith("betusPont") || fo.startsWith("szamosPont")) {
      sorok.push({ md: `- ${szoveggel(e).replace(/\n+/g, " ")}`, lista: 1 });
      continue;
    }
    if (fo.startsWith("ketbetusAlPont") || fo.startsWith("betusAlPont")) {
      sorok.push({ md: `  - ${szoveggel(e).replace(/\n+/g, " ")}`, lista: 2 });
      continue;
    }
    // bekezdés és minden más (ismeretlen osztály is): sima bekezdés-sor
    const md = szoveggel(e);
    if (md) sorok.push({ md, lista: 0 });
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
    if (kov && !(s.lista > 0 && kov.lista > 0)) kimenet.push("");
    else if (!kov) kimenet.push("");
  }
  return kimenet.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}
