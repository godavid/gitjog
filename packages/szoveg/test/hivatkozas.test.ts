import { describe, expect, it } from "vitest";
import { hivatkozasParse, szakaszKeres } from "../src/hivatkozas";
import { szakaszokraBont } from "../src/szakaszok";

describe("hivatkozasParse", () => {
  it("megjelölést documentId-re old fel", () => {
    expect(hivatkozasParse("2013. évi CXXII. törvény")).toEqual({
      documentId: "2013-122-00-00",
      megjeloles: "2013. évi CXXII. törvény",
    });
  });
  it("laza írásmódot is elfogad (kisbetű, tv., hiányzó pont)", () => {
    expect(hivatkozasParse("2013 évi cxxii tv")?.documentId).toBe("2013-122-00-00");
  });
  it("megjelölés + § együtt", () => {
    expect(hivatkozasParse("2013. évi CXXII. törvény 18. §")).toEqual({
      documentId: "2013-122-00-00",
      megjeloles: "2013. évi CXXII. törvény",
      paragrafus: "18. §",
    });
  });
  it("rövidítés + könyv:§ alak", () => {
    expect(hivatkozasParse("Ptk. 6:272. §")).toEqual({ rovidites: "Ptk", paragrafus: "6:272. §" });
  });
  it("betűs § (18/A) és kétszavas rövidítés", () => {
    expect(hivatkozasParse("Áfa tv. 18/a. §")).toEqual({ rovidites: "Áfa tv", paragrafus: "18/A. §" });
  });
  it("csak rövidítés", () => {
    expect(hivatkozasParse("Fftv.")).toEqual({ rovidites: "Fftv" });
  });
  it("szabad szöveg nem hivatkozás", () => {
    expect(hivatkozasParse("termőföld elővásárlási jog")).toBeNull();
    expect(hivatkozasParse("")).toBeNull();
  });
  it("§ önmagában (jogszabály nélkül) nem feloldható", () => {
    expect(hivatkozasParse("18. §")).toBeNull();
  });
  it("hibás római számra nem dob, null-t ad", () => {
    expect(hivatkozasParse("2013. évi VVVV. törvény")).toBeNull();
  });
});

describe("szakaszKeres", () => {
  const sz = szakaszokraBont(
    "## 1. § [Alap]\na\n## 18. § [Elővásárlás]\nb\n## 18/A. §\nc\n## 180. §\nd\n#### 6:272. § [Megbízás]\ne",
  );
  it("a § a heading-horgony előtagja szerint talál, nem szöveg szerint", () => {
    expect(szakaszKeres(sz, "18. §")?.szoveg).toBe("b");
    expect(szakaszKeres(sz, "180. §")?.szoveg).toBe("d");
    expect(szakaszKeres(sz, "18/A. §")?.szoveg).toBe("c");
    expect(szakaszKeres(sz, "6:272. §")?.szoveg).toBe("e");
  });
  it("hiányzó §-ra undefined", () => {
    expect(szakaszKeres(sz, "99. §")).toBeUndefined();
  });
});

describe("hivatkozasParse — hosszú bemenet", () => {
  it("hosszú számsoron is gyors (nincs négyzetes visszalépés)", () => {
    const kezdet = performance.now();
    hivatkozasParse("9".repeat(50_000));
    expect(performance.now() - kezdet).toBeLessThan(200);
  });
});
