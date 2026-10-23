// `szakaszCacheMp` egységteszt — a modul import nélküli tiszta függvény, ezért
// node:test-tel közvetlenül futtatható: node --test lib/api/cache-ido.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { szakaszCacheMp } from "./cache-ido.ts";

test("datum nélkül közepes cache", () => {
  assert.equal(szakaszCacheMp(undefined, "2026-10-23"), 3_600);
});

test("múltbeli datum egy napig cache-elhető", () => {
  assert.equal(szakaszCacheMp("2026-10-22", "2026-10-23"), 86_400);
  assert.equal(szakaszCacheMp("2024-01-01", "2026-10-23"), 86_400);
});

test("mai datum rövid cache — a napi delta még módosíthatja", () => {
  assert.equal(szakaszCacheMp("2026-10-23", "2026-10-23"), 900);
});

test("jövőbeli datum rövid cache", () => {
  assert.equal(szakaszCacheMp("2026-10-24", "2026-10-23"), 900);
  assert.equal(szakaszCacheMp("2027-01-01", "2026-10-23"), 900);
});
