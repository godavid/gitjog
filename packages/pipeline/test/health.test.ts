import { describe, expect, it } from "vitest";
import { terjedelemEllenorzes } from "../src/health.js";
import { parsolSnapshot } from "../src/parse.js";

describe("terjedelemEllenorzes (agent-őr)", () => {
  it("normális változást átenged", () => {
    expect(() => terjedelemEllenorzes(100_000, 103_000, "teszt")).not.toThrow();
  });
  it("gyanús zsugorodásnál dob (fél alá)", () => {
    expect(() => terjedelemEllenorzes(100_000, 40_000, "teszt")).toThrow(/anomália/);
  });
  it("gyanús duzzadásnál dob (dupla fölé)", () => {
    expect(() => terjedelemEllenorzes(100_000, 250_000, "teszt")).toThrow(/anomália/);
  });
  it("kis fájlnál nem szól (ott a nagy relatív ugrás normális)", () => {
    expect(() => terjedelemEllenorzes(2_000, 9_000, "teszt")).not.toThrow();
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
