import { describe, expect, it } from "vitest";
import { szakaszSorok } from "../src/kereso-index.js";

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
