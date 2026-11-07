// `legacyClaimNelkul` egységteszt — a modul import nélküli tiszta függvény, ezért
// node:test-tel közvetlenül futtatható: node --test lib/api/mcp-boritek.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { legacyClaimNelkul } from "./mcp-boritek.ts";

const KULCS = "io.modelcontextprotocol/protocolVersion";

test("2025-ös claim: a kulcs kikerül, a többi _meta marad", () => {
  const be = {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/list",
    params: { _meta: { [KULCS]: "2025-06-18", progressToken: 1 }, cursor: "x" },
  };
  assert.deepEqual(legacyClaimNelkul(be), {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/list",
    params: { _meta: { progressToken: 1 }, cursor: "x" },
  });
});

test("notification 2025-ös claimmel is javul", () => {
  const be = { jsonrpc: "2.0", method: "notifications/initialized", params: { _meta: { [KULCS]: "2025-11-25" } } };
  assert.deepEqual(legacyClaimNelkul(be), { jsonrpc: "2.0", method: "notifications/initialized", params: { _meta: {} } });
});

test("batch: minden elem javul", () => {
  const be = [
    { jsonrpc: "2.0", id: 1, method: "ping", params: { _meta: { [KULCS]: "2025-06-18" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ];
  assert.deepEqual(legacyClaimNelkul(be), [
    { jsonrpc: "2.0", id: 1, method: "ping", params: { _meta: {} } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
});

test("modern (2026-07-28+) claim változatlan — azonos referencia", () => {
  const be = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [KULCS]: "2026-07-28" } } };
  assert.equal(legacyClaimNelkul(be), be);
});

test("claim nélküli, nem string claim és nem objektum törzs változatlan", () => {
  const nincs = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { progressToken: 1 } } };
  const nemString = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [KULCS]: 5 } } };
  assert.equal(legacyClaimNelkul(nincs), nincs);
  assert.equal(legacyClaimNelkul(nemString), nemString);
  assert.equal(legacyClaimNelkul(null), null);
  assert.equal(legacyClaimNelkul("x"), "x");
});
