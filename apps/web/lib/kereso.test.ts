// A kereső adatbázis-rétege: a sor → találat leképezés és a konfigurációs hiba
// mindig fut; az élő keresés csak akkor, ha a KERESO_TESZT_DB_URL egy betöltött
// keresőindexű (kereses/kereses_api függvényes) Postgresre mutat.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jogszabalyNev, keres, keresTeljes, talalat, teljesTalalat } from "./kereso.ts";

const SOR = {
  slug: "ptk",
  megjeloles: "2013. évi V. törvény",
  rovidites: "Ptk.",
  jogszabaly_cim: "a Polgári Törvénykönyvről",
  szakasz_cim: "6:1. §",
  horgony: "61",
  reszlet: "a \u0002szerződés\u0003 létrejön",
  hatalyos: true,
};

test("a jogszabály neve a rövidítéssel és a megjelöléssel, rövidítés nélkül csak a megjelöléssel", () => {
  assert.equal(jogszabalyNev(SOR), "Ptk. (2013. évi V. törvény)");
  assert.equal(jogszabalyNev({ ...SOR, rovidites: null }), "2013. évi V. törvény");
});

test("a találat az SQL-oszlopokból épül, a kiemelés STX/ETX marad", () => {
  assert.deepEqual(talalat(SOR), {
    slug: "ptk",
    jogszabaly: "Ptk. (2013. évi V. törvény)",
    szakasz: "6:1. §",
    horgony: "61",
    reszlet: "a \u0002szerződés\u0003 létrejön",
    hatalyos: true,
  });
});

test("a teljes találat az API mezőit és a § szövegét is tartalmazza", () => {
  assert.deepEqual(teljesTalalat({ ...SOR, szoveg: "teljes szöveg" }), {
    slug: "ptk",
    jogszabaly: "Ptk. (2013. évi V. törvény)",
    megjeloles: "2013. évi V. törvény",
    rovidites: "Ptk.",
    jogszabalyCim: "a Polgári Törvénykönyvről",
    szakasz: "6:1. §",
    horgony: "61",
    reszlet: "a \u0002szerződés\u0003 létrejön",
    szoveg: "teljes szöveg",
    hatalyos: true,
  });
});

test("KERESO_DB_URL nélkül a keresés érthető hibával elbukik", async () => {
  const eredeti = process.env.KERESO_DB_URL;
  delete process.env.KERESO_DB_URL;
  try {
    await assert.rejects(keres("szerződés"), /Keresési hiba: .*KERESO_DB_URL/);
    await assert.rejects(keresTeljes("szerződés"), /Keresési hiba: .*KERESO_DB_URL/);
  } finally {
    if (eredeti !== undefined) process.env.KERESO_DB_URL = eredeti;
  }
});

const ELO_URL = process.env.KERESO_TESZT_DB_URL;

test("élő DB: a keresés találatot ad, kiemeléssel, a limitet betartva", { skip: !ELO_URL }, async () => {
  process.env.KERESO_DB_URL = ELO_URL;
  const talalatok = await keres("szerződés", false, 5);
  assert.ok(talalatok.length > 0 && talalatok.length <= 5);
  assert.ok(talalatok.every((t) => t.slug && typeof t.hatalyos === "boolean"));
  assert.ok(talalatok.some((t) => t.reszlet.includes("\u0002")));
  const teljes = await keresTeljes("szerződés", false, 3);
  assert.ok(teljes.length > 0 && teljes.length <= 3);
  assert.ok(teljes.every((t) => t.szoveg.length > 0 || t.szakasz === ""));
});
