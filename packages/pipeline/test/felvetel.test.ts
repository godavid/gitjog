import { describe, expect, it } from "vitest";
import { naploFajl, naploSorok } from "../src/felvetel.js";

const FUTAS = new Date("2026-09-17T03:41:12.345Z");

describe("felvételi napló", () => {
  it("a futás UTC-hónapja adja a fájlnevet", () => {
    expect(naploFajl(FUTAS)).toBe("index/felvetel/2026-09.jsonl");
    // hónapforduló: Budapesten már október 1., UTC-ben még szeptember
    expect(naploFajl(new Date("2026-09-30T22:30:00Z"))).toBe("index/felvetel/2026-09.jsonl");
  });
  it("soronként egy JSON, másodperces időbélyeggel, záró újsorral", () => {
    const s = naploSorok(FUTAS, [
      { slug: "a", datum: "2026-09-17", sha: "1".repeat(40) },
      { slug: "b", datum: "2026-08-01", sha: "2".repeat(40) },
    ]);
    const sorok = s.split("\n");
    expect(sorok.at(-1)).toBe("");
    expect(sorok).toHaveLength(3);
    expect(JSON.parse(sorok[0]!)).toEqual({
      felveve: "2026-09-17T03:41:12Z",
      slug: "a",
      datum: "2026-09-17",
      sha: "1".repeat(40),
    });
  });
  it("üres lista üres szöveg", () => {
    expect(naploSorok(FUTAS, [])).toBe("");
  });
});
