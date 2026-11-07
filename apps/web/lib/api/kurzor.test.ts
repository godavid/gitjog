// A veszteségmentes keyset-cursor egységtesztje — a modul import nélküli,
// ezért node:test-tel közvetlenül futtatható: node --test lib/api/kurzor.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { kurzorKiir, kurzorParse, lapoz, type KurzorSor } from "./kurzor.ts";

const FELVEVE = "2026-10-06T17:43:08Z";

/** 219 sor azonos felveve-vel (a 2026-10-21-es élő eset alakja), kevert sorrendben */
function azonosFelveveSorok(): KurzorSor[] {
  const sorok: KurzorSor[] = [];
  for (let i = 0; i < 219; i++) {
    sorok.push({ felveve: FELVEVE, slug: `${1900 + (i % 120)}-evi-${i}-torveny`, datum: i % 2 ? "2026-10-01" : "2026-09-30" });
  }
  // determinisztikus keverés: a bemenet sorrendje nem számíthat
  return sorok.sort((a, b) => ((a.slug.length * 7 + a.datum.length) % 5) - ((b.slug.length * 7 + b.datum.length) % 5));
}

test("219 azonos felveve-s sor 50-es lapokon: 5 lap, rés és duplikátum nélkül", () => {
  const sorok = azonosFelveveSorok();
  const latott = new Set<string>();
  let cursor = "2026-10-01T00:00:00Z";
  let lapok = 0;
  for (;;) {
    const k = kurzorParse(cursor);
    assert.ok(k, cursor);
    const { lap, kovetkezo } = lapoz(sorok, k, 50);
    if (lap.length === 0) {
      assert.equal(kovetkezo, cursor, "üres lapon a cursor nem változik");
      break;
    }
    lapok++;
    for (const s of lap) {
      const kulcs = `${s.slug}|${s.datum}`;
      assert.ok(!latott.has(kulcs), `duplikátum: ${kulcs}`);
      latott.add(kulcs);
    }
    assert.equal(kovetkezo, kurzorKiir(lap[lap.length - 1]!));
    cursor = kovetkezo;
  }
  assert.equal(lapok, 5);
  assert.equal(latott.size, 219);
});

test("a lap legrégebbi elöl, (felveve, slug, datum) szerint", () => {
  const sorok: KurzorSor[] = [
    { felveve: "2026-10-17T03:31:00Z", slug: "b", datum: "2026-10-15" },
    { felveve: FELVEVE, slug: "b", datum: "2026-10-02" },
    { felveve: FELVEVE, slug: "b", datum: "2026-10-01" },
    { felveve: FELVEVE, slug: "a", datum: "2026-10-01" },
  ];
  const { lap, kovetkezo } = lapoz(sorok, kurzorParse("2026-10-01T00:00:00Z")!, 3);
  assert.deepEqual(
    lap.map((s) => `${s.slug}_${s.datum}`),
    ["a_2026-10-01", "b_2026-10-01", "b_2026-10-02"],
  );
  assert.equal(kovetkezo, `${FELVEVE}_b_2026-10-02`);
  const masodik = lapoz(sorok, kurzorParse(kovetkezo)!, 3);
  assert.deepEqual(masodik.lap.map((s) => s.slug), ["b"]);
  assert.equal(masodik.kovetkezo, "2026-10-17T03:31:00Z_b_2026-10-15");
});

test("puszta ISO időbélyeg: szigorúan utána, az alakot másodpercre normalizálja", () => {
  const k = kurzorParse("2026-10-06T19:43:08.250+02:00");
  assert.ok(k);
  assert.equal(k.felveve, FELVEVE);
  assert.equal(k.slug, undefined);
  assert.equal(k.nyers, "2026-10-06T19:43:08.250+02:00");
  const sorok: KurzorSor[] = [
    { felveve: FELVEVE, slug: "a", datum: "2026-10-01" },
    { felveve: "2026-10-06T17:43:09Z", slug: "b", datum: "2026-10-01" },
  ];
  const { lap } = lapoz(sorok, k, 10);
  assert.deepEqual(lap.map((s) => s.slug), ["b"]);
});

test("puszta dátum is időbélyeg (a régi kliensek így is hívtak): UTC éjfél", () => {
  assert.equal(kurzorParse("2026-10-06")?.felveve, "2026-10-06T00:00:00Z");
});

test("összetett cursor: az ISO rész, a slug és a dátum külön ellenőrzött", () => {
  const k = kurzorParse(`${FELVEVE}_2013-evi-v-torveny-ptk_2026-10-01`);
  assert.deepEqual(k, {
    nyers: `${FELVEVE}_2013-evi-v-torveny-ptk_2026-10-01`,
    felveve: FELVEVE,
    slug: "2013-evi-v-torveny-ptk",
    datum: "2026-10-01",
  });
  assert.equal(kurzorKiir(k!), k!.nyers);
});

test("rossz cursor null", () => {
  for (const s of [
    "",
    "tegnap",
    `${FELVEVE}_Ptk_2026-10-01`,
    `${FELVEVE}_ptk_2026-10`,
    `${FELVEVE}_ptk`,
    `${FELVEVE}_ptk_2026-10-01_x`,
    "nem-ido_ptk_2026-10-01",
  ]) {
    assert.equal(kurzorParse(s), null, JSON.stringify(s));
  }
});

test("üres lap: a bemeneti cursor változatlanul jön vissza", () => {
  const nyers = `${FELVEVE}_zzz_2026-10-01`;
  const { lap, kovetkezo } = lapoz([{ felveve: FELVEVE, slug: "a", datum: "2026-10-01" }], kurzorParse(nyers)!, 10);
  assert.equal(lap.length, 0);
  assert.equal(kovetkezo, nyers);
});
