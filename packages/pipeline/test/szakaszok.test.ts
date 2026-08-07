import { describe, expect, it } from "vitest";
import { horgonyId, szakaszokraBont } from "../src/szakaszok.js";
import { mdRender } from "../../../apps/web/lib/md.js";

describe("horgonyId", () => {
  it("§ jelet 'sz'-re cserél és ékezetet bont", () => {
    expect(horgonyId("6:272. § [Megbízási szerződés]")).toBe("6-272-sz-megbizasi-szerzodes");
  });
  it("80 karakterre vág", () => {
    expect(horgonyId("a".repeat(200)).length).toBe(80);
  });
});

describe("szakaszokraBont", () => {
  it("heading szerint bont, a heading elé eső szöveget eldobja", () => {
    const sz = szakaszokraBont("# Cím\nbevezető\n## Első\nalfa\n## Második\nbéta");
    expect(sz.map((s) => s.cim)).toEqual(["Első", "Második"]);
    expect(sz[0]!.szoveg).toBe("alfa");
  });
  it("sorszámoz a törvényen belül", () => {
    const sz = szakaszokraBont("## A\nx\n## B\ny");
    expect(sz.map((s) => s.sorszam)).toEqual([1, 2]);
  });
  it("üres szakaszt nem ad vissza", () => {
    expect(szakaszokraBont("## Üres\n## Van\nszöveg").map((s) => s.cim)).toEqual(["Van"]);
  });
  it("táblázat-elválasztót kihagy, cellákat összefűz", () => {
    const sz = szakaszokraBont("## T\n| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(sz[0]!.szoveg).toBe("a · b 1 · 2");
  });
  it("listajelet levág", () => {
    expect(szakaszokraBont("## L\n- első\n- második")[0]!.szoveg).toBe("első második");
  });

  // A HORGONY-INVARIÁNS: a bontó és a megjelenítő ugyanazt az id-t adja.
  it("ismétlődő címnél ugyanazt a horgonyt adja, mint az mdRender", () => {
    const md = "## Értelmező rendelkezések\nalfa\n## Értelmező rendelkezések\nbéta";
    const sz = szakaszokraBont(md);
    const { jegyzek } = mdRender(md);
    expect(sz.map((s) => s.horgony)).toEqual(jegyzek.map((j) => j.id));
    expect(sz[1]!.horgony).toBe("ertelmezo-rendelkezesek-2");
  });
  it("vegyes szintű headingeknél is egyezik a horgony az mdRenderrel", () => {
    const md = "## Fejezet\nx\n### Alcím\ny\n#### 1. §\nz\n#### 1. §\nw";
    const sz = szakaszokraBont(md);
    const { jegyzek } = mdRender(md);
    expect(sz.map((s) => s.horgony)).toEqual(jegyzek.map((j) => j.id));
  });
});
