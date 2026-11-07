// A `@modelcontextprotocol/server` 2.3–2.4 hibájának megkerülése. Ha egy nem
// `initialize` üzenet `params._meta`-ja 2026 előtti protokollverziót nevez meg
// (`io.modelcontextprotocol/protocolVersion: "2025-06-18"`), az SDK modern
// kérésnek sorolja be, és 400-zal (-32022, „Unsupported protocol version”)
// elutasítja, ahelyett hogy a legacy ágon kiszolgálná. 2025-ös kliensek így
// munkamenetenként 2 kérést elvesztettek (2026-11 prod log). A 2025-ös
// protokollban ez a kulcs semmit nem jelent, ezért kivesszük: az üzenet claim
// nélküli legacy kérés lesz, amit az SDK rendben kiszolgál.

interface Uzenet {
  params?: { _meta?: Record<string, unknown> } & Record<string, unknown>;
}

const VERZIO_KULCS = "io.modelcontextprotocol/protocolVersion";
const ELSO_MODERN_VERZIO = "2026-07-28";

function objektum(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function egyUzenet(u: unknown): unknown {
  if (!objektum(u)) return u;
  const params = (u as Uzenet).params;
  if (!objektum(params) || !objektum(params._meta)) return u;
  const verzio = params._meta[VERZIO_KULCS];
  if (typeof verzio !== "string" || verzio >= ELSO_MODERN_VERZIO) return u;
  const meta = { ...params._meta };
  delete meta[VERZIO_KULCS];
  return { ...u, params: { ...params, _meta: meta } };
}

/** A JSON-RPC törzs (egy üzenet vagy batch) 2026 előtti `_meta` claim nélkül; ha nincs mit javítani, ugyanaz a referencia. */
export function legacyClaimNelkul(torzs: unknown): unknown {
  if (!Array.isArray(torzs)) return egyUzenet(torzs);
  const uj = torzs.map(egyUzenet);
  return uj.every((u, i) => u === torzs[i]) ? torzs : uj;
}
