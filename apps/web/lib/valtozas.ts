// Két időállapot sorszintű összevetése. Szerver oldalon fut, hogy a diff a
// kiszolgált HTML-ben legyen: ez az oldal egyetlen olyan tartalma, amit máshol
// nem lehet megkapni, és a keresők/AI-crawlerek nem futtatnak JS-t.

import { diffLines } from "diff";

export type BlokkTipus = "uj" | "torolt" | "kontextus";

export interface Blokk {
  tipus: BlokkTipus;
  sorok: string[];
}

export interface Valtozas {
  blokkok: Blokk[];
  hozzaadott: number;
  torolt: number;
}

export function valtozasSzamitas(regi: string, uj: string): Valtozas {
  const blokkok: Blokk[] = diffLines(regi, uj).map((r) => ({
    tipus: r.added ? "uj" : r.removed ? "torolt" : "kontextus",
    sorok: r.value.replace(/\n$/, "").split("\n"),
  }));

  let hozzaadott = 0;
  let torolt = 0;
  for (const b of blokkok) {
    if (b.tipus === "uj") hozzaadott += b.sorok.length;
    else if (b.tipus === "torolt") torolt += b.sorok.length;
  }
  return { blokkok, hozzaadott, torolt };
}
