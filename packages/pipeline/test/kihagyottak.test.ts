import { describe, expect, it } from "vitest";
import { kihagyottakSzuro, type KihagyottTetel } from "../src/kihagyottak.js";

const lista: KihagyottTetel[] = [
  { documentId: "1871-43-00-00", slug: "1871-evi-xliii-torveny", ok: "Üres verziólista" },
  { documentId: "1874-2-00-00", slug: "1874-evi-ii-torveny", ok: "Üres verziólista" },
  { documentId: "2026-5-00-00", slug: "2026-evi-v-torveny", ok: "csak jövőbeli állapotok" },
];

describe("kihagyottakSzuro", () => {
  it("kiveszi a documentId szerint bekerült jogszabályt", () => {
    const sz = kihagyottakSzuro(lista, new Set(["2026-5-00-00"]), new Set());
    expect(sz.map((k) => k.slug)).toEqual(["1871-evi-xliii-torveny", "1874-evi-ii-torveny"]);
  });

  it("kiveszi a slug szerint bekerült jogszabályt is", () => {
    const sz = kihagyottakSzuro(lista, new Set(), new Set(["1874-evi-ii-torveny"]));
    expect(sz.map((k) => k.documentId)).toEqual(["1871-43-00-00", "2026-5-00-00"]);
  });

  it("bekerült nélkül a lista és a sorrend változatlan", () => {
    const sz = kihagyottakSzuro(lista, new Set(["9999-1-00-00"]), new Set(["nincs-ilyen"]));
    expect(sz).toEqual(lista);
    expect(sz).not.toBe(lista);
  });

  it("üres listára üres eredmény", () => {
    expect(kihagyottakSzuro([], new Set(["2026-5-00-00"]), new Set())).toEqual([]);
  });
});
