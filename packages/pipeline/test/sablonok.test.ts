import { describe, expect, it } from "vitest";
import { AGENTS_MD, LICENSE_HU_MD, LICENSE_TXT, README_MD } from "../src/sablonok.js";

describe("AGENTS_MD (az adat-repo agent-útmutatója)", () => {
  it("nem állítja, hogy a HEAD a hatályos állapot", () => {
    expect(AGENTS_MD).not.toContain("HEAD = current state");
  });
  it("nem állítja, hogy egy commit egy időállapot", () => {
    expect(AGENTS_MD).not.toContain("One commit = one point-in-time");
  });
  it("az index méretét nem 4+ MB-nak mondja", () => {
    expect(AGENTS_MD).not.toContain("4+ MB");
  });
  it("nem nevezi a blobless klónt shallow-nak", () => {
    expect(AGENTS_MD).not.toContain("shallow history is fine");
  });
  it("kimondja, hogy a history nem dátum szerint rendezett", () => {
    expect(AGENTS_MD).toContain("History is not date-ordered");
  });
  it("leírja az opaque kurzort", () => {
    expect(AGENTS_MD).toContain("kovetkezo_felveve_utan");
  });
  it("van karbantartási szakasza", () => {
    expect(AGENTS_MD).toContain("Maintaining this repository");
  });
});

describe("README_MD, LICENSE_TXT, LICENSE_HU_MD (backfill-magok)", () => {
  it("a README nem ad reflog-receptet (a main@{dátum} csak figyelmeztetésként szerepelhet)", () => {
    expect(README_MD).not.toContain("git diff 'main@{");
    expect(README_MD).not.toMatch(/^[^#\n]*main@\{[^}]*\}[^\n]*\n/m);
  });
  it("a LICENSE a CC0 hivatalos szövege", () => {
    expect(LICENSE_TXT.startsWith("Creative Commons Legal Code")).toBe(true);
  });
  it("van magyar licenc-magyarázat", () => {
    expect(LICENSE_HU_MD.length).toBeGreaterThan(0);
  });
});
