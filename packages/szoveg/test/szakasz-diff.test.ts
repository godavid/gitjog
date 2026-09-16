import { describe, expect, it } from "vitest";
import { szakaszDiff, szakaszDiffOsszegzes } from "../src/szakasz-diff";

const REGI = "# T\n## 1. §\nalfa\n## 2. §\nbéta\n## 3. §\ngamma";

describe("szakaszDiff", () => {
  it("csak az eltérő §-okat adja vissza, típussal", () => {
    const uj = "# T\n## 1. §\nalfa\n## 2. §\nbéta módosítva\n## 4. §\ndelta";
    const v = szakaszDiff(REGI, uj);
    expect(v.map((x) => [x.horgony, x.tipus])).toEqual([
      ["2-sz", "modosult"],
      ["4-sz", "uj"],
      ["3-sz", "torolt"],
    ]);
    expect(v[0]!.regi).toBe("béta");
    expect(v[0]!.uj).toBe("béta módosítva");
    expect(v[0]!.blokkok?.some((b) => b.tipus === "uj")).toBe(true);
    expect(v[1]).toMatchObject({ regi: null, uj: "delta" });
    expect(v[2]).toMatchObject({ regi: "gamma", uj: null });
  });
  it("azonos szövegre üres", () => {
    expect(szakaszDiff(REGI, REGI)).toEqual([]);
  });
  it("heading nélküli (üres horgonyú) darabokat sorrend szerint párosít", () => {
    const v = szakaszDiff("# T\nelső\nmásodik", "# T\nelső\nharmadik");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ horgony: "", tipus: "modosult" });
  });
  it("összegzés", () => {
    const uj = "# T\n## 1. §\nalfa\n## 2. §\nbéta módosítva\n## 4. §\ndelta";
    expect(szakaszDiffOsszegzes(szakaszDiff(REGI, uj))).toMatchObject({ modosult: 1, uj: 1, torolt: 1 });
  });
});
