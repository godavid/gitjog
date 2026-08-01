import { describe, expect, it } from "vitest";
import type { Idoallapot } from "../src/crawl.js";
import {
  esedekesE,
  KORFORGAS_NAPOK,
  maiHalmaz,
  retegBesorolas,
  retegOsszefoglalo,
  retegTerkepJson,
  type RetegTerkep,
} from "../src/enumeralas.js";

const MA = "2026-08-01";

function allapot(hatalyba: string, hatalyatVeszti: string | null): Idoallapot {
  return { version: 1, hatalyba, hatalyatVeszti, current: hatalyatVeszti === null };
}

describe("retegBesorolas", () => {
  it("nyitott végű utolsó állapot → aktív", () => {
    expect(retegBesorolas([allapot("2020-01-01", "2024-01-01"), allapot("2024-01-01", null)], MA)).toBe(
      "aktiv",
    );
  });
  it("jövőbeli hatályvesztés → aktív", () => {
    expect(retegBesorolas([allapot("2024-01-01", "2027-01-01")], MA)).toBe("aktiv");
  });
  it("múltbeli hatályvesztés → lezárt", () => {
    expect(retegBesorolas([allapot("2010-01-01", "2014-03-15")], MA)).toBe("lezart");
  });
  it("a hatályvesztés napján még aktív (az aznapi njt-változás elkapásáért)", () => {
    expect(retegBesorolas([allapot("2010-01-01", MA)], MA)).toBe("aktiv");
  });
  it("üres lista → nincs-szoveg", () => {
    expect(retegBesorolas([], MA)).toBe("nincs-szoveg");
  });
  it("a besorolás az UTOLSÓ állapotot nézi, nem az elsőt", () => {
    // korábbi állapot rég lejárt, de a legutolsó nyitott végű
    expect(
      retegBesorolas([allapot("1959-05-01", "2014-03-15"), allapot("2014-03-15", null)], MA),
    ).toBe("aktiv");
  });
});

describe("esedekesE", () => {
  it("aktív réteg minden nap esedékes", () => {
    for (let i = 0; i < 10; i++) {
      expect(esedekesE("aktiv", "2013-5-00-00", `2026-08-0${(i % 9) + 1}`)).toBe(true);
    }
  });

  it.each([["lezart"], ["nincs-szoveg"]] as const)(
    "%s réteg a körforgásban pontosan egy napon esedékes",
    (reteg) => {
      const napok = [
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
      ];
      expect(napok).toHaveLength(KORFORGAS_NAPOK);
      const talalat = napok.filter((n) => esedekesE(reteg, "1959-4-00-00", n));
      expect(talalat).toHaveLength(1);
    },
  );

  it("ugyanaz a nap ugyanazt adja (determinisztikus)", () => {
    expect(esedekesE("lezart", "1959-4-00-00", MA)).toBe(esedekesE("lezart", "1959-4-00-00", MA));
  });

  it("hónap- és évfordulón is folytonos a körforgás", () => {
    // 2026-08-31 és 2026-09-01 szomszédos napok → különböző szeletek
    const ids = ["1959-4-00-00", "2015-53-00-00", "1990-93-00-00", "2000-100-00-00"];
    const a = ids.map((id) => esedekesE("lezart", id, "2026-08-31"));
    const b = ids.map((id) => esedekesE("lezart", id, "2026-09-01"));
    expect(a).not.toEqual(b);
  });

  it("a terhelés nagyjából egyenletesen oszlik el a napok között", () => {
    const idk = Array.from({ length: 3500 }, (_, i) => `${1900 + (i % 120)}-${i}-00-00`);
    const napok = [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ];
    const szamok = napok.map((n) => idk.filter((id) => esedekesE("lezart", id, n)).length);
    expect(szamok.reduce((a, b) => a + b, 0)).toBe(idk.length); // minden tétel pontosan egyszer
    const atlag = idk.length / KORFORGAS_NAPOK;
    for (const sz of szamok) expect(Math.abs(sz - atlag)).toBeLessThan(atlag * 0.35);
  });
});

describe("maiHalmaz", () => {
  const lista = [
    { documentId: "2013-5-00-00", rovidites: "Ptk." },
    { documentId: "1959-4-00-00" },
    { documentId: "2015-53-00-00" },
    { documentId: "1900-1-00-00" },
  ];

  it("a kiemelt (rövidítéses) jogszabály mindig benne van", () => {
    const terkep: RetegTerkep = { "2013-5-00-00": "lezart" };
    const napok = ["2026-08-01", "2026-08-02", "2026-08-03"];
    for (const n of napok) {
      expect(maiHalmaz(lista, terkep, n).map((j) => j.documentId)).toContain("2013-5-00-00");
    }
  });

  it("ismeretlen documentId aktívnak számít (hiányzó térkép → teljes végigjárás)", () => {
    expect(maiHalmaz(lista, {}, MA)).toHaveLength(lista.length);
  });

  it("lezárt tételek nagy részét kihagyja", () => {
    const terkep: RetegTerkep = {
      "1959-4-00-00": "lezart",
      "2015-53-00-00": "lezart",
      "1900-1-00-00": "nincs-szoveg",
    };
    // a 3 nem-aktív tétel közül egy adott napon legfeljebb néhány esedékes
    expect(maiHalmaz(lista, terkep, MA).length).toBeLessThan(lista.length);
  });
});

describe("retegTerkepJson", () => {
  it("documentId szerint rendezett, determinisztikus kimenet", () => {
    const a = retegTerkepJson({ "2013-5-00-00": "aktiv", "1959-4-00-00": "lezart" });
    const b = retegTerkepJson({ "1959-4-00-00": "lezart", "2013-5-00-00": "aktiv" });
    expect(a).toBe(b);
    expect(a.indexOf("1959")).toBeLessThan(a.indexOf("2013"));
    expect(a.endsWith("\n")).toBe(true);
  });
});

describe("retegOsszefoglalo", () => {
  it("rétegenként számol", () => {
    expect(
      retegOsszefoglalo({ a: "aktiv", b: "aktiv", c: "lezart", d: "nincs-szoveg" }),
    ).toBe("aktív: 2, lezárt: 1, nincs szöveg: 1");
  });
});
