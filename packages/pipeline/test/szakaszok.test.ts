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
  it("heading szerint bont, és a heading ELŐTTI szöveget is megtartja", () => {
    const sz = szakaszokraBont("# Cím\nbevezető\n## Első\nalfa\n## Második\nbéta");
    expect(sz.map((s) => s.cim)).toEqual(["", "Első", "Második"]);
    expect(sz[0]!.szoveg).toBe("bevezető");
    expect(sz[0]!.horgony).toBe(""); // a jogszabály tetejére linkel
    expect(sz[1]!.szoveg).toBe("alfa");
  });
  it("sorszámoz a törvényen belül", () => {
    const sz = szakaszokraBont("## A\nx\n## B\ny");
    expect(sz.map((s) => s.sorszam)).toEqual([1, 2]);
  });

  // A HIÁNY, amit ez a modul javít: 1924 törvény (ebből 1025 hatályos) egyetlen
  // szakasszal sem került az indexbe, mert a szövegükben nincs ##-#### heading.
  it("heading NÉLKÜLI törvény teljes szövegét is indexeli", () => {
    const sz = szakaszokraBont("# 2010. évi CVI. törvény\nelső bekezdés\nmásodik bekezdés");
    expect(sz).toHaveLength(1);
    expect(sz[0]!.cim).toBe("");
    expect(sz[0]!.szoveg).toBe("első bekezdés második bekezdés");
  });
  it("a hosszú, heading nélküli törzset darabolja", () => {
    const bekezdes = "a".repeat(1000);
    const sz = szakaszokraBont(`# Cím\n${bekezdes}\n${bekezdes}\n${bekezdes}\n${bekezdes}`);
    expect(sz.length).toBeGreaterThan(1);
    expect(sz.every((s) => s.szoveg.length <= 2600)).toBe(true);
    expect(sz.map((s) => s.sorszam)).toEqual(sz.map((_, i) => i + 1));
  });
  it("a darabolás bekezdéshatáron történik (nem vág szót ketté)", () => {
    const sz = szakaszokraBont(`# Cím\n${"x".repeat(1500)}\n${"y".repeat(1500)}`);
    expect(sz).toHaveLength(2);
    expect(sz[0]!.szoveg).toBe("x".repeat(1500));
    expect(sz[1]!.szoveg).toBe("y".repeat(1500));
  });
  it("a headinges szakaszokat NEM darabolja (a mélylink egy §-ra mutasson)", () => {
    const sz = szakaszokraBont(`## 1. §\n${"a".repeat(9000)}`);
    expect(sz).toHaveLength(1);
    expect(sz[0]!.szoveg.length).toBe(9000);
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

  // A HORGONY-INVARIÁNS: minden kiadott horgony LÉTEZZEN az mdRender jegyzékében,
  // és ugyanahhoz a címhez tartozzon. (Listák puszta összevetése nem elég: üres
  // horgonyú — heading nélküli — szakaszok is vannak, és egy üres heading a
  // jegyzékbe bekerül, a szakaszok közé nem.)
  function horgonyokEgyeznek(md: string) {
    const { jegyzek } = mdRender(md);
    for (const s of szakaszokraBont(md).filter((s) => s.horgony)) {
      const j = jegyzek.find((j) => j.id === s.horgony);
      expect(j, `a(z) "${s.horgony}" horgony nincs a jegyzékben`).toBeDefined();
      expect(j!.cim).toBe(s.cim);
    }
  }

  it("ismétlődő címnél ugyanazt a horgonyt adja, mint az mdRender", () => {
    const md = "## Értelmező rendelkezések\nalfa\n## Értelmező rendelkezések\nbéta";
    horgonyokEgyeznek(md);
    expect(szakaszokraBont(md)[1]!.horgony).toBe("ertelmezo-rendelkezesek-2");
  });
  it("vegyes szintű headingeknél is egyezik a horgony az mdRenderrel", () => {
    horgonyokEgyeznek("## Fejezet\nx\n### Alcím\ny\n#### 1. §\nz\n#### 1. §\nw");
  });
  it("bevezető szöveg és üres heading mellett sem csúszik el a horgony", () => {
    horgonyokEgyeznek("# Cím\nbevezető\n## Üres\n## Van\nszöveg\n## Van\nmás");
  });
});
