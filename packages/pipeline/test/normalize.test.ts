import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_DIR, borderekKiolvasasa, getTeljesSnapshot } from "../src/crawl.js";
import { parsolSnapshot, szovegTisztitas } from "../src/parse.js";
import { markdownGeneralas } from "../src/normalize.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("szovegTisztitas", () => {
  it("NBSP-t és szóköz-sorozatot normalizál, trimmel", () => {
    expect(szovegTisztitas("  a b   c \n d ")).toBe("a b c d");
  });
});

describe("borderekKiolvasasa", () => {
  it("start és opcionális last attribútumot olvas", () => {
    const html =
      '<div class="pH borderStart" data-show-order="60" data-b-n="1"></div>' +
      '<div class="pH borderStart" data-show-order="120" data-last-show-order="147"></div>';
    expect(borderekKiolvasasa(html)).toEqual([{ start: 60 }, { start: 120, last: 147 }]);
  });
});

describe("mini fixture (hálózat és cache nélkül)", () => {
  it("a parse+normalize pontosan az elvárt markdownt adja", async () => {
    const alapHtml = await readFile(join(FIXTURES, "mini-alap.html"), "utf8");
    const blokkHtml = await readFile(join(FIXTURES, "mini-blokk.html"), "utf8");
    const elvart = await readFile(join(FIXTURES, "mini-elvart.md"), "utf8");
    const p = parsolSnapshot({ alapHtml, blokkHtml }, "2099-1-00-00");
    expect(p.megjeloles).toBe("2099. évi I. törvény");
    expect(p.cim).toBe("a tesztelésről");
    expect(p.hatalyDatum).toBe("2099-01-01");
    expect(p.ismeretlenOsztalyok).toEqual([]);
    expect(markdownGeneralas(p)).toBe(elvart);
  });

  it("determinisztikus: kétszeri futás byte-azonos", async () => {
    const alapHtml = await readFile(join(FIXTURES, "mini-alap.html"), "utf8");
    const blokkHtml = await readFile(join(FIXTURES, "mini-blokk.html"), "utf8");
    const md1 = markdownGeneralas(parsolSnapshot({ alapHtml, blokkHtml }, "2099-1-00-00"));
    const md2 = markdownGeneralas(parsolSnapshot({ alapHtml, blokkHtml }, "2099-1-00-00"));
    expect(md1).toBe(md2);
  });
});

// Golden hashek valós njt-snapshotokra. Csak akkor futnak, ha a lemez-cache
// megvan (a backfill géppén) — CI-ben átugorja őket. Ha a parser/normalizáló
// szándékosan változik, a hasheket újra kell generálni (parse-proba + shasum).
const GOLDEN: { nev: string; documentId: string; verzio: number; sha256: string }[] = [
  { nev: "Ptk. v44", documentId: "2013-5-00-00", verzio: 44, sha256: "02474bb035a17d59aeb7b4fb04beb71f33e84b86038b9a7cf608122e430bbbe7" },
  { nev: "Btk. v82", documentId: "2012-100-00-00", verzio: 82, sha256: "e41978c3c9bde87dab52e1a1b412c54063f0d8303d26004794218c9768121ba0" },
  { nev: "Mt. v38", documentId: "2012-1-00-00", verzio: 38, sha256: "32b9c855d9259aeb108420ba2aa0432c062b37d15be46c6862cd8d087ae3ce0d" },
  { nev: "Alaptörvény v26", documentId: "2011-4301-02-00", verzio: 26, sha256: "746c6f53936daa9a03c0861c5e91d2c2b6f48e014678afb02709c3036b1352fe" },
];

describe.skipIf(!existsSync(CACHE_DIR))("golden hashek (cache-elt valós snapshotok)", () => {
  for (const g of GOLDEN) {
    it.skipIf(!existsSync(join(CACHE_DIR, g.documentId, `${g.verzio}.html`)))(g.nev, async () => {
      const s = await getTeljesSnapshot(g.documentId, g.verzio);
      const p = parsolSnapshot(s, g.documentId);
      expect(p.ismeretlenOsztalyok).toEqual([]);
      const md = markdownGeneralas(p);
      expect(createHash("sha256").update(md).digest("hex")).toBe(g.sha256);
    });
  }
});
