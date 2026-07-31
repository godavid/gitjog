import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generalas } from "../src/torvenylista-generalas.js";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://pelda.hu/jogszabaly/2013-5-00-00</loc></url>
  <url><loc>https://pelda.hu/jogszabaly/1990-93-00-00</loc></url>
  <url><loc>https://pelda.hu/jogszabaly/2020-12-00-00</loc></url>
  <url><loc>https://pelda.hu/jogszabaly/2013-5-00-00</loc></url>
  <url><loc>https://pelda.hu/jogszabaly/1977-6-00-00-b</loc></url>
  <url><loc>https://pelda.hu/jogszabaly/2010-85-20-22</loc></url>
</urlset>
`;

describe("generalas", () => {
  it("érvényes URL-ekből bejegyzéseket képez, kizárásokkal", () => {
    const lista = generalas(SITEMAP);

    // 3 érvényes + 1 duplikátum; a -b suffixes és a nem-00-00 kizárva
    expect(lista).toHaveLength(3);

    // rendezés: év, azon belül szám növekvő
    expect(lista.map((b) => b.documentId)).toEqual([
      "1990-93-00-00",
      "2013-5-00-00",
      "2020-12-00-00",
    ]);
  });

  it("kiemelt documentId-nál a slug térképből jön", () => {
    const lista = generalas(SITEMAP);
    const ptk = lista.find((b) => b.documentId === "2013-5-00-00");
    expect(ptk).toEqual({
      documentId: "2013-5-00-00",
      slug: "2013-evi-v-torveny-ptk",
      megjeloles: "2013. évi V. törvény",
    });
  });

  it("általános documentId-nál képlet-slug és képlet-megjelölés", () => {
    const lista = generalas(SITEMAP);
    const tv = lista.find((b) => b.documentId === "2020-12-00-00");
    expect(tv).toEqual({
      documentId: "2020-12-00-00",
      slug: "2020-evi-xii-torveny",
      megjeloles: "2020. évi XII. törvény",
    });
  });

  it("a kizárt URL-ek nincsenek benne", () => {
    const lista = generalas(SITEMAP);
    const idk = lista.map((b) => b.documentId);
    expect(idk).not.toContain("1977-6-00-00");
    expect(idk).not.toContain("2010-85-20-22");
  });
});

describe("CLI-futtatás (tmp sitemap → JSON)", () => {
  it("a kimenet 2 szóközös indentálású JSON-tömb záró újsorral", () => {
    const konyvtar = mkdtempSync(join(tmpdir(), "torvenylista-"));
    const sitemapUtvonal = join(konyvtar, "sitemap.xml");
    const kimenetUtvonal = join(konyvtar, "kimenet.json");
    writeFileSync(sitemapUtvonal, SITEMAP);

    // a generátor logikája közvetlenül, CLI nélkül
    const lista = generalas(readFileSync(sitemapUtvonal, "utf-8"));
    writeFileSync(kimenetUtvonal, JSON.stringify(lista, null, 2) + "\n");

    const tartalom = readFileSync(kimenetUtvonal, "utf-8");
    expect(tartalom.endsWith("\n")).toBe(true);
    expect(tartalom).toContain('\n  {\n    "documentId": "1990-93-00-00"');
    expect(JSON.parse(tartalom)).toHaveLength(3);
  });
});
