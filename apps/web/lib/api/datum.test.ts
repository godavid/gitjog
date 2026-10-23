// `ervenyesDatum` egységteszt — a modul import nélküli tiszta függvény, ezért
// node:test-tel közvetlenül futtatható: node --test lib/api/datum.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { ervenyesDatum } from "./datum.ts";

test("valódi naptári dátum igaz", () => {
  assert.equal(ervenyesDatum("2026-10-01"), true);
  assert.equal(ervenyesDatum("2024-02-29"), true); // szökőév
});

test("alakilag jó, de nem létező nap hamis", () => {
  for (const d of ["2026-13-01", "2026-02-30", "2026-10-00", "2025-02-29", "2026-04-31"]) {
    assert.equal(ervenyesDatum(d), false, d);
  }
});

test("rossz alak hamis", () => {
  for (const d of ["2024-2-1", "", "2026-10-01T00:00:00Z"]) {
    assert.equal(ervenyesDatum(d), false, d);
  }
});
