// A gépi és értesítési csatornák egyetlen forrása: a főoldal, az /agenteknek
// oldal és az /llms.txt ugyanezekből a címekből és bekötési receptekből
// dolgozik, hogy a három felület ne térhessen el egymástól.

import { ADAT_REPO } from "@/lib/adat";
import { OLDAL_URL } from "@/lib/sitemap";

export const MCP_URL = `${OLDAL_URL}/api/mcp`;
export const OPENAPI_URL = `${OLDAL_URL}/api/v1/openapi.json`;
export const RSS_URL = `${OLDAL_URL}/valtozasok.xml`;
export const LLMS_URL = `${OLDAL_URL}/llms.txt`;
export const ADAT_REPO_URL = `https://github.com/${ADAT_REPO}`;
/** a hivatalos MCP-registry bejegyzés neve (server.json `name`) */
export const MCP_REGISTRY_NEV = "io.github.godavid/gitjog";
export const MCP_REGISTRY_URL = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${MCP_REGISTRY_NEV}`;
/** a napi frissítés befejezésének legkorábbi ideje — ütemezett figyelőnek */
export const FRISSITES_UTAN = "03:30 UTC";

export const torvenyRss = (slug: string) => `${OLDAL_URL}/jogszabaly/${slug}/valtozasok.xml`;
export const githubAtom = (slug?: string) =>
  slug
    ? `${ADAT_REPO_URL}/commits/main/jogszabalyok/${slug}.atom`
    : `${ADAT_REPO_URL}/commits/main.atom`;

/** MCP-toolok, a route.ts regisztrációjával egyezően */
export const MCP_TOOLOK: { nev: string; mit: string }[] = [
  { nev: "kereses", mit: "melyik § szabályozza X-et — a § teljes szövegével és URL-jével, egy körben citálható" },
  { nev: "szakasz", mit: "egy § egy adott napon hatályos szövege; § nélkül a tartalomjegyzék és az időállapotok" },
  { nev: "valtozasok", mit: "mi változott: az érintett §-ok régi és új szövege, figyeléshez cursorral" },
  { nev: "diff", mit: "két időállapot teljes, §-szintű különbsége" },
  { nev: "search / fetch", mit: "ugyanez a ChatGPT connector- és deep research-felületének elvárt alakjában" },
];

/** REST-példák műveletenként; a slug és a dátumok valós, élő értékek */
export const REST_PELDAK: { muvelet: string; mire: string; url: string }[] = [
  {
    muvelet: "kereses",
    mire: "melyik § szabályozza?",
    url: `${OLDAL_URL}/api/v1/kereses?q=termőföld+elővásárlási+jog`,
  },
  {
    muvelet: "szakasz",
    mire: "egy § egy adott napon",
    url: `${OLDAL_URL}/api/v1/szakasz?slug=2013-evi-cxxii-torveny-foldforgalmi&paragrafus=18.+§&datum=2024-01-01`,
  },
  {
    muvelet: "valtozasok",
    mire: "mi változott 2026 óta?",
    url: `${OLDAL_URL}/api/v1/valtozasok?since=2026-01-01&q=termőföld|földek forgalm|Földalap`,
  },
  {
    muvelet: "diff",
    mire: "két időállapot különbsége",
    url: `${OLDAL_URL}/api/v1/diff?slug=2013-evi-cxxii-torveny-foldforgalmi&tol=2023-01-01&ig=2024-01-01`,
  },
];

/** Kliensenkénti bekötés: hol kell megadni, és a szó szerint másolható `kod`. */
export const MCP_KLIENSEK: { nev: string; hol: string; kod: string }[] = [
  {
    nev: "Claude Code",
    hol: "terminálban",
    kod: `claude mcp add --transport http gitjog ${MCP_URL}`,
  },
  {
    nev: "Claude, ChatGPT és más alkalmazások",
    hol: "egyéni (custom) connectorként; Claude-ban: Settings → Connectors → Add custom connector",
    kod: MCP_URL,
  },
  {
    nev: "Cursor",
    hol: "~/.cursor/mcp.json",
    kod: JSON.stringify({ mcpServers: { gitjog: { url: MCP_URL } } }, null, 2),
  },
  {
    nev: "VS Code",
    hol: ".vscode/mcp.json",
    kod: JSON.stringify({ servers: { gitjog: { type: "http", url: MCP_URL } } }, null, 2),
  },
];
