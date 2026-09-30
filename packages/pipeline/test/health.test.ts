import { describe, expect, it } from "vitest";
import {
  modositoBlokkValtozas,
  modositoTorveny,
  TerjedelemAnomalia,
  terjedelemEllenorzes,
} from "../src/health.js";
import { parsolSnapshot } from "../src/parse.js";

describe("terjedelemEllenorzes (agent-őr)", () => {
  it("normális változást átenged", () => {
    expect(() => terjedelemEllenorzes(100_000, 103_000, "teszt")).not.toThrow();
  });
  it("gyanús zsugorodásnál dob (fél alá)", () => {
    expect(() => terjedelemEllenorzes(100_000, 40_000, "teszt")).toThrow(/anomália/);
  });
  it("a hiba típusa TerjedelemAnomalia (a delta jogszabályonként kezeli)", () => {
    expect(() => terjedelemEllenorzes(100_000, 40_000, "teszt")).toThrow(TerjedelemAnomalia);
  });
  it("gyanús duzzadásnál dob (dupla fölé)", () => {
    expect(() => terjedelemEllenorzes(100_000, 250_000, "teszt")).toThrow(/anomália/);
  });
  it("kis fájlnál nem szól (ott a nagy relatív ugrás normális)", () => {
    expect(() => terjedelemEllenorzes(2_000, 9_000, "teszt")).not.toThrow();
  });
});

describe("módosító törvények kiürülése", () => {
  it("felismeri a módosító törvény címét", () => {
    expect(modositoTorveny("a környezetvédelemmel összefüggő törvények módosításáról")).toBe(true);
    expect(modositoTorveny("egyes törvények módosításáról ")).toBe(true);
  });
  it("nem téveszti össze az érdemi törvénnyel", () => {
    expect(modositoTorveny("a Büntető Törvénykönyvről")).toBe(false);
    expect(modositoTorveny("a Polgári Törvénykönyvről")).toBe(false);
    // a „módosításáról” csak a cím VÉGÉN számít
    expect(modositoTorveny("a szabálysértésekről szóló törvény módosításáról és egyebekről")).toBe(
      false,
    );
  });
  it("módosító törvénynél átengedi a zsugorodást (valós eset: 2025. évi CXXIV.)", () => {
    expect(() =>
      terjedelemEllenorzes(10_212, 3_311, "teszt", { zsugorodhat: true }),
    ).not.toThrow();
  });
  it("ugyanez jelzés nélkül továbbra is dob", () => {
    expect(() => terjedelemEllenorzes(10_212, 3_311, "teszt")).toThrow(/anomália/);
  });
  it("a szöveg teljes eltűnését módosító törvénynél is elfogja", () => {
    expect(() => terjedelemEllenorzes(100_000, 200, "teszt", { zsugorodhat: true })).toThrow(
      /anomália/,
    );
  });
  it("módosító törvénynél a duzzadás megengedett (valós eset: 2026. évi XVIII., 2026-08-26)", () => {
    // a lépcsőzetes hatálybalépés napján a beépülő szakaszok egy napra megjelennek
    expect(() =>
      terjedelemEllenorzes(16_590, 111_538, "teszt", { zsugorodhat: true }),
    ).not.toThrow();
    // …és másnap kiürülnek
    expect(() =>
      terjedelemEllenorzes(111_538, 17_225, "teszt", { zsugorodhat: true }),
    ).not.toThrow();
  });
  it("ugyanez a duzzadás jelzés nélkül továbbra is dob", () => {
    expect(() => terjedelemEllenorzes(16_590, 111_538, "teszt")).toThrow(/anomália/);
  });
});

describe("beágyazott módosító blokk megjelenése és kiürülése", () => {
  // `fordulat` darab módosító rendelkezés, kitöltve `hossz` karakterre
  const szoveg = (hossz: number, fordulat: number): string => {
    const m = "az „ügyészség, a” szövegrész helyébe az „ügyészség, az NVVH, a” szöveg lép.\n".repeat(fordulat);
    return m + "a".repeat(Math.max(0, hossz - m.length));
  };
  // valós eset: 2026. évi XXXIV. (NVVH-törvény), nem „…módosításáról” című —
  // 2026-09-27-én egy napra megjelent a 68–352. §, másnap kiürült
  const v4 = szoveg(79_748, 0);
  const v5 = szoveg(233_444, 718);
  const v6 = szoveg(94_755, 1);

  it("felismeri a módosító blokk megjelenését (duzzadás)", () => {
    expect(modositoBlokkValtozas(v4, v5)).toBe(true);
  });
  it("felismeri a módosító blokk kiürülését (zsugorodás)", () => {
    expect(modositoBlokkValtozas(v5, v6)).toBe(true);
  });
  it("módosító fordulatok nélküli duzzadást nem magyaráz", () => {
    expect(modositoBlokkValtozas(szoveg(100_000, 0), szoveg(250_000, 5))).toBe(false);
  });
  it("az iránynak egyeznie kell: duzzadás, miközben a fordulatok eltűnnek, gyanús", () => {
    expect(modositoBlokkValtozas(szoveg(100_000, 700), szoveg(250_000, 0))).toBe(false);
  });
  it("néhány fordulat nem magyaráz meg nagy ugrást", () => {
    expect(modositoBlokkValtozas(szoveg(10_000, 0), szoveg(30_000, 10))).toBe(false);
  });
  it("a jelzéssel az őr mindkét lépést átengedi", () => {
    expect(() =>
      terjedelemEllenorzes(v4.length, v5.length, "teszt", { zsugorodhat: modositoBlokkValtozas(v4, v5) }),
    ).not.toThrow();
    expect(() =>
      terjedelemEllenorzes(v5.length, v6.length, "teszt", { zsugorodhat: modositoBlokkValtozas(v5, v6) }),
    ).not.toThrow();
  });
  it("a teljes eltűnést a jelzés sem engedi át", () => {
    const ures = szoveg(200, 0);
    expect(() =>
      terjedelemEllenorzes(v5.length, ures.length, "teszt", {
        zsugorodhat: modositoBlokkValtozas(v5, ures),
      }),
    ).toThrow(/anomália/);
  });
});

describe("parser-őrfeltételek (szimulált njt-törés)", () => {
  it("tartalom nélküli oldalnál dob", () => {
    expect(() =>
      parsolSnapshot({ alapHtml: "<html><body>átdizájnolt oldal</body></html>", blokkHtml: "" }, "2013-5-00-00"),
    ).toThrow(/tartalomelem/);
  });
  it("border utáni renderelt elemnél dob (splicing-feltevés)", () => {
    const html =
      '<div id="sc2013-5-00-00-3" class="jogszabalyMainTitle">X</div>' +
      '<div id="sc2013-5-00-00-5" class="pH borderStart" data-show-order="60"></div>' +
      '<div id="sc2013-5-00-00-8" class="bekezdesNyito"><p>renderelt</p></div>';
    expect(() => parsolSnapshot({ alapHtml: html, blokkHtml: "x" }, "2013-5-00-00")).toThrow(
      /splicing/,
    );
  });
  it("bordernél hiányzó blokk-tartalomnál dob", () => {
    const html =
      '<div id="sc2013-5-00-00-3" class="jogszabalyMainTitle">X</div>' +
      '<div id="sc2013-5-00-00-5" class="pH borderStart" data-show-order="60"></div>';
    expect(() => parsolSnapshot({ alapHtml: html, blokkHtml: "" }, "2013-5-00-00")).toThrow(
      /nincs blokk-tartalom/,
    );
  });
});
