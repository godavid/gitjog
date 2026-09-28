import type { Metadata } from "next";
import Link from "next/link";
import { KodSor } from "@/components/KodSor";
import { getAllomanyStatisztika } from "@/lib/adat";
import {
  ADAT_REPO_URL,
  FRISSITES_UTAN,
  LLMS_URL,
  MCP_KLIENSEK,
  MCP_REGISTRY_NEV,
  MCP_REGISTRY_URL,
  MCP_TOOLOK,
  MCP_URL,
  OPENAPI_URL,
  REST_PELDAK,
  RSS_URL,
  githubAtom,
  torvenyRss,
} from "@/lib/csatornak";
import { jsonLdSzoveg } from "@/lib/jsonld";
import { OLDAL_URL } from "@/lib/sitemap";

export const revalidate = 86400;

const LEIRAS =
  "MCP-szerver, REST API, RSS és git a magyar törvények változásfigyeléséhez — AI-agenteknek, szkripteknek és RSS-olvasóknak, kulcs és regisztráció nélkül.";

export const metadata: Metadata = {
  title: "MCP-szerver, API és értesítés a törvényváltozásokról",
  description: LEIRAS,
  alternates: {
    canonical: "/agenteknek",
    // ugyanez a tartalom géppel olvasható alakban
    types: { "text/plain": "/llms.txt", "application/rss+xml": "/valtozasok.xml" },
  },
};

/** a példákban szereplő törvény: a legtöbbet módosított kódexek egyike */
const PELDA_SLUG = "2013-evi-v-torveny-ptk";

const CURSOR_ELSO = `curl "${OLDAL_URL}/api/v1/valtozasok?felveve_utan=$(date -u +%Y-%m-%dT%H:%M:%SZ)&slugs=${PELDA_SLUG}"`;
const GIT_PULL = "git pull --ff-only && git log --stat ORIG_HEAD..HEAD -- jogszabalyok/";

export default async function AgenteknekOldal() {
  const { jogszabalySzam, allapotSzam } = await getAllomanyStatisztika();

  // Az oldal egy gépi felületet ír le; a WebAPI típus pontosan ezt jelenti.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "GitJog MCP-szerver és REST API",
    description: LEIRAS,
    url: `${OLDAL_URL}/agenteknek`,
    documentation: OPENAPI_URL,
    inLanguage: "hu",
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: "GitJog", url: OLDAL_URL },
    potentialAction: {
      "@type": "ConsumeAction",
      target: { "@type": "EntryPoint", urlTemplate: MCP_URL, name: "MCP (streamable HTTP)" },
    },
  };

  return (
    <main className="lap lap-szukebb agent-lap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSzoveg(jsonLd) }} />
      <h1>MCP-szerver, API és értesítés</h1>
      <p className="alcim-sor">
        A GitJog embernek és AI-agentnek egyaránt szól. Amit a böngészőben olvasol ({jogszabalySzam.toLocaleString("hu-HU")}{" "}
        törvény, {allapotSzam.toLocaleString("hu-HU")} időállapot), ugyanarról a domainről MCP-szerveren, REST API-n, RSS-en és
        git-klónként is elérhető, kulcs, regisztráció és süti nélkül.
      </p>

      <nav className="eszkozsor" aria-label="Az oldal szakaszai">
        <a href="#mcp">MCP-szerver</a>
        <a href="#figyeles">Értesítés változáskor</a>
        <a href="#api">REST API</a>
        <a href="#nyers">Nyers adat</a>
        <a href="/llms.txt">llms.txt</a>
      </nav>

      <section className="szoveg-szekcio" id="mcp" aria-labelledby="mcp-cim">
        <h2 id="mcp-cim">MCP-szerver AI-asszisztenseknek</h2>
        <p>
          Egy MCP-képes asszisztens közvetlenül kérdezheti a törvényeket. A válasz a § szövege a pontos
          időállapottal és a GitJog-URL-lel, így idézhető; egész törvényt nem kell beolvasnia.
          Streamable HTTP, bejelentkezés és kulcs nélkül.
        </p>
        <KodSor kod={MCP_URL} mit="az MCP-szerver címe" kiemelt />
        <p className="halk">
          A hivatalos MCP-registryben:{" "}
          <a href={MCP_REGISTRY_URL} rel="noopener">
            <code>{MCP_REGISTRY_NEV}</code>
          </a>
        </p>

        <h3>Bekötés</h3>
        <dl className="kliens-lista">
          {MCP_KLIENSEK.map((k) => (
            <div className="kliens" key={k.nev}>
              <dt>
                <span className="kliens-nev">{k.nev}</span>
                <span className="kliens-hol">{k.hol}</span>
              </dt>
              <dd>
                <KodSor kod={k.kod} mit={`bekötés (${k.nev})`} />
              </dd>
            </div>
          ))}
        </dl>

        <h3>Toolok</h3>
        <dl className="tool-lista">
          {MCP_TOOLOK.map((t) => (
            <div key={t.nev}>
              <dt>
                <code>{t.nev}</code>
              </dt>
              <dd>{t.mit}</dd>
            </div>
          ))}
        </dl>

        <h3>Kipróbálás</h3>
        <p>Bekötés után például ezt kérdezd az asszisztenstől:</p>
        <p className="pelda-kerdes">
          „Mi változott a földforgalmi törvényben 2024 óta? Idézd a módosult §‑okat, dátummal.”
        </p>
      </section>

      <section className="szoveg-szekcio" id="figyeles" aria-labelledby="figyeles-cim">
        <h2 id="figyeles-cim">Értesítés, ha változik egy törvény</h2>
        <p>
          Az állomány naponta egyszer frissül: az aznap hatályba lépő módosítások {FRISSITES_UTAN} után
          már lekérhetők. Válaszd, ami a munkafolyamatodba illik.
        </p>
        <dl className="csatorna-lista">
          <div>
            <dt>RSS: minden módosítás</dt>
            <dd>
              <p>RSS-olvasóba, vagy olyan szolgáltatásba, amely a feedből e-mailt küld.</p>
              <KodSor kod={RSS_URL} mit="az összesített RSS-feed címe" />
            </dd>
          </div>
          <div>
            <dt>RSS: egy törvény</dt>
            <dd>
              <p>
                Minden törvénynek saját feedje van; a törvény oldalán az „RSS” link mutat rá. A Ptk.
                feedje például:
              </p>
              <KodSor kod={torvenyRss(PELDA_SLUG)} mit="a Ptk. RSS-feedjének címe" />
            </dd>
          </div>
          <div>
            <dt>GitHub commit-feed (Atom)</dt>
            <dd>
              <p>
                Az adat-repó commitjai: minden commit egy hatályba lépett időállapot. Egy törvényre
                szűkítve a könyvtárának feedje kell.
              </p>
              <KodSor kod={githubAtom()} mit="a teljes commit-feed címe" />
              <KodSor kod={githubAtom(PELDA_SLUG)} mit="a Ptk. commit-feedjének címe" />
            </dd>
          </div>
          <div>
            <dt>Ütemezett agent vagy szkript</dt>
            <dd>
              <ol className="recept">
                <li>
                  Első futáskor kérdezz a mostani időponttól (vagy <code>q=</code> címszűrővel, vagy{" "}
                  <code>slugs=</code> listával):
                  <KodSor kod={CURSOR_ELSO} mit="az első cursoros hívás" />
                </li>
                <li>
                  A válasz <code>kovetkezo_felveve_utan</code> mezőjét tárold el: ez a cursor.
                </li>
                <li>
                  Naponta, {FRISSITES_UTAN} után hívd újra a tárolt cursorral. Üres <code>tetelek</code>{" "}
                  = nincs újdonság.
                </li>
                <li>
                  Ha van tétel: az <code>erintett_szakaszok</code> régi és új szövege elég egy
                  összefoglalóhoz, a <code>diff_url</code> a teljes különbség.
                </li>
              </ol>
              <p className="halk">
                MCP-n ugyanez a <code>valtozasok</code> tool, ugyanezekkel a paraméterekkel. A cursor a
                repóba kerülés ideje, nem a hatálybalépésé: a késve felvett, régi dátumú állapotot is
                jelzi.
              </p>
            </dd>
          </div>
          <div>
            <dt>git</dt>
            <dd>
              <p>Klónozott adat-repónál a frissítés és a változott törvények listája egy sor:</p>
              <KodSor kod={GIT_PULL} mit="a git-parancs" />
            </dd>
          </div>
        </dl>
      </section>

      <section className="szoveg-szekcio" id="api" aria-labelledby="api-cim">
        <h2 id="api-cim">REST API</h2>
        <p>
          Ugyanaz a négy művelet, egyszerű GET-tel és JSON-válasszal. A teljes leírás OpenAPI 3.1
          alakban:
        </p>
        <KodSor kod={OPENAPI_URL} mit="az OpenAPI-leírás címe" />
        <dl className="csatorna-lista">
          {REST_PELDAK.map((p) => (
            <div key={p.muvelet}>
              <dt>
                <code>{p.muvelet}</code>
                <span className="kliens-hol">{p.mire}</span>
              </dt>
              <dd>
                <KodSor kod={`curl '${p.url}'`} mit={`${p.muvelet}-példa`} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="szoveg-szekcio" id="nyers" aria-labelledby="nyers-cim">
        <h2 id="nyers-cim">Nyers adat</h2>
        <dl className="csatorna-lista">
          <div>
            <dt>llms.txt</dt>
            <dd>
              <p>
                Belépési pont agenteknek: ez az oldal géppel olvasható alakban, receptekkel:{" "}
                <a href="/llms.txt">{LLMS_URL}</a>
              </p>
            </dd>
          </div>
          <div>
            <dt>Egy törvény Markdownban</dt>
            <dd>
              <p>
                <code>/jogszabaly/&lt;slug&gt;/szoveg.md</code>; a törvény oldalán a „Nyers szöveg
                (.md)” link.
              </p>
            </dd>
          </div>
          <div>
            <dt>Az egész állomány</dt>
            <dd>
              <KodSor kod={`git clone ${ADAT_REPO_URL}`} mit="a klónozó parancs" />
              <p>
                A repó szerkezete, a felvételi napló és a felhasználás feltételei:{" "}
                <Link href="/adatok">Az adatokról</Link>.
              </p>
            </dd>
          </div>
        </dl>
      </section>

      <section className="szoveg-szekcio" aria-labelledby="idezes-cim">
        <h2 id="idezes-cim">Idézés előtt</h2>
        <p>
          Nem hiteles jogforrás: automatikus feldolgozás, tájékozódási és kutatási célra. A hiteles szöveg
          az{" "}
          <a href="https://njt.jog.gov.hu" rel="noopener">
            njt.jog.gov.hu
          </a>
          -n és a Magyar Közlönyben van. Dátum-érzékeny kérdésnél mindig add meg, melyik időállapotról
          van szó, egy agent-válaszban is.
        </p>
      </section>
    </main>
  );
}
