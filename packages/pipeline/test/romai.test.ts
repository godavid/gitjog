import { describe, expect, it } from "vitest";
import { arabbolRomai, romaibolArab } from "../src/romai.js";

describe("arabbolRomai", () => {
  it.each([
    [1, "I"],
    [4, "IV"],
    [9, "IX"],
    [14, "XIV"],
    [40, "XL"],
    [90, "XC"],
    [400, "CD"],
    [900, "CM"],
    [1999, "MCMXCIX"],
    [2024, "MMXXIV"],
    [3999, "MMMCMXCIX"],
  ])("%i → %s", (n, romai) => {
    expect(arabbolRomai(n)).toBe(romai);
  });

  it.each([0, 4000, 1.5])("dob érvénytelen bemenetre: %s", (n) => {
    expect(() => arabbolRomai(n)).toThrow();
  });
});

describe("romaibolArab", () => {
  it("kis/nagybetű vegyesen is elfogadott", () => {
    expect(romaibolArab("MCMXCIX")).toBe(1999);
    expect(romaibolArab("mcmxcix")).toBe(1999);
    expect(romaibolArab("xIv")).toBe(14);
  });

  it.each(["", "ABC"])("dob érvénytelen bemenetre: '%s'", (s) => {
    expect(() => romaibolArab(s)).toThrow();
  });
});

describe("körbe-teszt", () => {
  it("minden n=1..2000-re romaibolArab(arabbolRomai(n)) === n", () => {
    for (let n = 1; n <= 2000; n++) {
      expect(romaibolArab(arabbolRomai(n))).toBe(n);
    }
  });
});
