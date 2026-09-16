// MCP-szerver (streamable HTTP, állapot nélkül): a REST-tel azonos négy művelet
// toolként, plusz a ChatGPT-connector `search`/`fetch` aliasai. Nincs auth —
// publikus, közkincs adat; a válaszok korlátos méretűek (lib/api/kozos.ts).

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { diffApi } from "@/lib/api/diff";
import { keresesApi } from "@/lib/api/kereses";
import { ApiHiba, KORLAT } from "@/lib/api/kozos";
import { MCP } from "@/lib/api/semak";
import { szakaszApi } from "@/lib/api/szakasz";
import { valtozasokApi } from "@/lib/api/valtozasok";

export const maxDuration = 60;

type ToolValasz = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function szoveges(adat: unknown): ToolValasz {
  return { content: [{ type: "text", text: JSON.stringify(adat) }] };
}

async function futtat(fn: () => Promise<unknown>): Promise<ToolValasz> {
  try {
    return szoveges(await fn());
  } catch (e) {
    const uzenet = e instanceof ApiHiba ? `${e.status}: ${e.message}` : "Átmeneti hiba a forrás elérésekor — próbáld újra.";
    if (!(e instanceof ApiHiba)) console.error("[mcp]", e);
    return { content: [{ type: "text", text: uzenet }], isError: true };
  }
}

const OLVASO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const INSTRUKCIOK = `GitJog: a magyar törvények teljes szövege és teljes változástörténete (4300+ törvény, 1827-től), naponta frissítve.
Nem hiteles jogforrás — idézésnél mondd ki, hogy a hiteles szöveg az njt.jog.gov.hu-n van.
Munkamenet: (1) \`kereses\` — kérdésre vagy hivatkozásra („Ptk. 6:272. §”) a § teljes szövegét adja, citálható URL-lel; (2) \`szakasz\` — egy § egy adott napon, vagy § nélkül a jogszabály tartalomjegyzéke és időállapotai; (3) \`valtozasok\` — mi változott: cursorral (\`felveve_utan\`) vagy dátum/slug szűrővel, az érintett §-ok régi/új szövegével; (4) \`diff\` — két időállapot teljes §-szintű összevetése.
Ne kérd le egész törvényt: a §-szintű válaszok pár KB-osak. Dátum-érzékeny kérdésnél mindig add meg az időállapotot.`;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "kereses",
      {
        title: "Keresés a magyar törvényekben",
        description:
          "Melyik § szabályozza X-et? Teljes szövegű keresés magyar szótövezéssel, vagy hivatkozás feloldása („Fftv. 18. §”, „2013. évi CXXII. törvény”). " +
          `A találat a § teljes szövegét hozza (${KORLAT.keresesSzoveg} karakterig) és a § URL-jét — egy körben citálható.`,
        inputSchema: MCP.kereses,
        annotations: OLVASO,
      },
      (a) => futtat(() => keresesApi(a)),
    );

    server.registerTool(
      "szakasz",
      {
        title: "Egy § szövege egy időállapotban",
        description:
          "Egy jogszabály egy §-a (horgony vagy §-szám szerint), opcionálisan egy adott napon hatályos szöveggel. " +
          "§ nélkül a jogszabály metaadatát, időállapot-listáját és tartalomjegyzékét adja (nem a teljes szöveget).",
        inputSchema: MCP.szakasz,
        annotations: OLVASO,
      },
      (a) => futtat(() => szakaszApi(a)),
    );

    server.registerTool(
      "valtozasok",
      {
        title: "Mi változott?",
        description:
          "Hatályba lépett módosítások listája az érintett §-ok régi/új szövegével — egy hívás elég egy értesítéshez. " +
          "Figyeléshez: add meg a `felveve_utan` cursort (első hívásnál egy időbélyeg, utána a válasz `kovetkezo_felveve_utan` mezője) és szűrj `q`-val (címrészlet, pl. „föld”) vagy `slugs`-szal. " +
          "Történeti kérdésre (`mi változott a Btk.-ban 2024-ben?`) a `since`/`until`/`slugs` szűrők valók.",
        inputSchema: MCP.valtozasok,
        annotations: OLVASO,
      },
      (a) => futtat(() => valtozasokApi(a)),
    );

    server.registerTool(
      "diff",
      {
        title: "Két időállapot §-szintű különbsége",
        description:
          "Egy jogszabály két időállapotának összevetése: csak az eltérő §-ok, régi és új szöveggel, soronkénti blokkokkal. " +
          "Az időállapotok napjait a `szakasz` (§ nélkül) vagy a `valtozasok` adja.",
        inputSchema: MCP.diff,
        annotations: OLVASO,
      },
      (a) => futtat(() => diffApi(a)),
    );

    // ChatGPT-connector konvenció: search → {results:[{id,title,url}]}, fetch(id) → dokumentum
    server.registerTool(
      "search",
      {
        title: "Search (ChatGPT connector)",
        description: "Keresés a magyar törvényekben; az eredmény id-jét a `fetch` várja.",
        inputSchema: z.object({ query: z.string().min(1) }),
        annotations: OLVASO,
      },
      ({ query }) =>
        futtat(async () => {
          const v = await keresesApi({ q: query });
          return {
            results: v.talalatok.map((t) => ({
              id: `${t.slug}#${t.horgony}`,
              title: `${t.rovidites ?? t.megjeloles}${t.szakasz_cim ? ` — ${t.szakasz_cim}` : ` — ${t.cim}`}`,
              url: t.url,
            })),
          };
        }),
    );

    server.registerTool(
      "fetch",
      {
        title: "Fetch (ChatGPT connector)",
        description: "Egy `search`-találat teljes szövege az id („slug#horgony”) alapján.",
        inputSchema: z.object({ id: z.string().min(1) }),
        annotations: OLVASO,
      },
      ({ id }) =>
        futtat(async () => {
          const [slug = "", horgony = ""] = id.split("#");
          const v = await szakaszApi({ slug, horgony: horgony || undefined });
          const szoveg = "szoveg" in v ? v.szoveg : JSON.stringify(v.tartalomjegyzek);
          return {
            id,
            title: `${v.rovidites ?? v.megjeloles} — ${"szakasz_cim" in v ? v.szakasz_cim : v.cim}`,
            text: szoveg,
            url: v.url,
            metadata: { datum: v.datum, megjegyzes: v.megjegyzes },
          };
        }),
    );
  },
  {
    serverInfo: { name: "gitjog", version: "1.0.0" },
    instructions: INSTRUKCIOK,
    onEvent: (event) => {
      if (event.type === "ERROR") console.error("[mcp]", event);
    },
  },
);

export { handler as GET, handler as POST, handler as DELETE };
