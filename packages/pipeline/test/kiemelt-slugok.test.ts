// Őr: a torvenylista-generalas.ts KIEMELT_SLUGOK táblája és a config.ts
// JOGSZABALYOK listája ugyanazokat a documentId → slug párokat tartalmazza.
// Eltérésnél a generált torvenyek.json és a kiemelt lista más slugot adna
// ugyanannak a jogszabálynak, és az adat-repóban két könyvtár keletkezne.
import { describe, expect, it } from "vitest";
import { JOGSZABALYOK } from "../src/config.js";
import { KIEMELT_SLUGOK } from "../src/torvenylista-generalas.js";

describe("KIEMELT_SLUGOK ↔ JOGSZABALYOK szinkron", () => {
  it("minden kiemelt jogszabály slugja egyezik a KIEMELT_SLUGOK bejegyzésével", () => {
    const elteresek = JOGSZABALYOK.filter((j) => KIEMELT_SLUGOK[j.documentId] !== j.slug).map(
      (j) => `${j.documentId}: config=${j.slug}, kiemelt=${KIEMELT_SLUGOK[j.documentId] ?? "(hiányzik)"}`,
    );
    expect(elteresek).toEqual([]);
  });

  it("a KIEMELT_SLUGOK minden kulcsa JOGSZABALYOK-beli documentId", () => {
    const ismert = new Set(JOGSZABALYOK.map((j) => j.documentId));
    const arvak = Object.keys(KIEMELT_SLUGOK).filter((id) => !ismert.has(id));
    expect(arvak).toEqual([]);
  });
});
