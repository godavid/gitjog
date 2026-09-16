import { describe, expect, it } from "vitest";
import { paragrafusKivag } from "../src/paragrafus";

const MD = `# 2013. évi CXXII. törvény
### II. Fejezet — A FÖLD
#### 6. Az elővásárlásra jogosultak sorrendje
18. § (1) A föld eladása esetén az alábbi sorrendben elővásárlási jog illeti meg:
- a) az államot

(2) A 18. § (1) bekezdés b) pontja szerinti földet használó földműves alatt…
19. § Az elővásárlási jog gyakorlása.
18/A. § Betűs paragrafus.
#### 7. Hatósági jóváhagyás
20. § Valami.`;

describe("paragrafusKivag", () => {
  it("a sor eleji § futamát vágja ki a következő §-ig, a tartalmazó heading horgonyával", () => {
    const r = paragrafusKivag(MD, "18. §");
    expect(r?.horgony).toBe("6-az-elovasarlasra-jogosultak-sorrendje");
    expect(r?.cim).toBe("6. Az elővásárlásra jogosultak sorrendje");
    expect(r?.szoveg.startsWith("18. § (1) A föld eladása")).toBe(true);
    expect(r?.szoveg).toContain("(2) A 18. § (1) bekezdés");
    expect(r?.szoveg).not.toContain("19. §");
  });
  it("szövegközi hivatkozás („a 18. § (1)”) nem számít §-kezdetnek", () => {
    expect(paragrafusKivag(MD, "19. §")?.szoveg).toBe("19. § Az elővásárlási jog gyakorlása.");
  });
  it("betűs § és heading-határ", () => {
    expect(paragrafusKivag(MD, "18/A. §")?.szoveg).toBe("18/A. § Betűs paragrafus.");
    expect(paragrafusKivag(MD, "20. §")?.horgony).toBe("7-hatosagi-jovahagyas");
  });
  it("hiányzó §-ra undefined; a 1. § nem illeszkedik a 18. §-ra", () => {
    expect(paragrafusKivag(MD, "1. §")).toBeUndefined();
    expect(paragrafusKivag(MD, "8. §")).toBeUndefined();
  });
});
