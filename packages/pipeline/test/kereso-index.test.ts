import { describe, expect, it } from "vitest";
import { deltaSzinkronTetelek, szakaszSorok } from "../src/kereso-index.js";

const TETEL = {
  slug: "2013-evi-v-torveny-ptk",
  documentId: "2013-5-00-00",
  megjeloles: "2013. évi V. törvény",
  cim: "a Polgári Törvénykönyvről",
  rovidites: "Ptk.",
};

describe("szakaszSorok", () => {
  it("a jogszabály slugját és hatályosságát minden sorra ráteszi", () => {
    const sorok = szakaszSorok(TETEL, "## A\nalfa\n## B\nbéta", true);
    expect(sorok).toHaveLength(2);
    expect(sorok.every((s) => s.slug === TETEL.slug && s.hatalyos)).toBe(true);
  });
  it("hatálytalan jogszabálynál minden sor hatalyos=false", () => {
    const sorok = szakaszSorok(TETEL, "## A\nalfa", false);
    expect(sorok[0]!.hatalyos).toBe(false);
  });
  it("üres szövegre üres listát ad (nem dob)", () => {
    expect(szakaszSorok(TETEL, "", true)).toEqual([]);
  });
  it("megőrzi a szakaszok sorrendjét", () => {
    const sorok = szakaszSorok(TETEL, "## A\nx\n## B\ny\n## C\nz", true);
    expect(sorok.map((s) => s.sorszam)).toEqual([1, 2, 3]);
  });
});

describe("deltaSzinkronTetelek", () => {
  it("a parse-olt, perzisztált címet adja tovább a generált lista üres címe helyett", () => {
    const perzisztalt = {
      ...TETEL,
      slug: "2026-evi-i-torveny",
      documentId: "2026-1-00-00",
      megjeloles: "2026. évi I. törvény",
      cim: "a kereshető cím megőrzéséről",
      rovidites: null,
    };

    const tetelek = deltaSzinkronTetelek(
      [perzisztalt.slug],
      [perzisztalt],
      { [perzisztalt.documentId]: "aktiv" },
    );

    expect(tetelek).toEqual([{ tetel: perzisztalt, hatalyos: true }]);
  });

  it("lezárt jogszabályt hatálytalanként szinkronizál, ismeretlen slugot kihagy", () => {
    const perzisztalt = { ...TETEL, rovidites: TETEL.rovidites };
    const tetelek = deltaSzinkronTetelek(
      ["nincs-a-listaban", perzisztalt.slug],
      [perzisztalt],
      { [perzisztalt.documentId]: "lezart" },
    );

    expect(tetelek).toEqual([{ tetel: perzisztalt, hatalyos: false }]);
  });
});
