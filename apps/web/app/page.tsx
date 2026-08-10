import type { Metadata } from "next";
import Link from "next/link";
import { evOf, getJogszabalyok, getLegutobbiValtozasok } from "@/lib/adat";
import { datumSzoveg } from "@/lib/datum";

export const revalidate = 21600;

const FRISS_DARAB = 12;

export async function generateMetadata(): Promise<Metadata> {
  const jogszabalyok = await getJogszabalyok();
  const elsoEv = Math.min(...jogszabalyok.map(evOf));
  return {
    title: { absolute: "Nyílt Jogtár — a magyar törvények szövege és változástörténete" },
    description:
      `A magyar törvények teljes szövege és változástörténete. ${jogszabalyok.length} törvény ` +
      `${elsoEv} óta, minden módosításnál látható, mi került bele és mi került ki. Nem hiteles jogforrás.`,
    alternates: {
      canonical: "/",
      // a page alternates-e teljesen kicseréli a layoutét, ezért az RSS-t itt is meg kell adni
      types: { "application/rss+xml": "/valtozasok.xml" },
    },
  };
}

/**
 * A leggyakrabban keresett kódexek elöl. A többi rövidítéses törvény utánuk
 * marad, az index sorrendjében (a rendezés stabil).
 */
const ELOL = ["Ptk.", "Btk.", "Mt.", "Szja tv.", "Áfa tv.", "Be.", "Pp.", "Ákr.", "Nkt.", "Eütv."];

/** „1820-as évek” alakú címke; a negyvenes és hetvenes évek -es ragosak */
function evtizedCimke(evtized: number): string {
  const ketjegy = evtized % 100;
  const rag = ketjegy === 40 || ketjegy === 70 ? "es" : "as";
  return `${evtized}-${rag} évek`;
}

export default async function Fooldal() {
  const [jogszabalyok, frissek] = await Promise.all([
    getJogszabalyok(),
    getLegutobbiValtozasok(FRISS_DARAB),
  ]);
  const rang = (rov: string | null) => {
    const i = ELOL.indexOf(rov ?? "");
    return i === -1 ? ELOL.length : i;
  };
  const kiemeltek = jogszabalyok
    .filter((j) => j.rovidites !== null)
    .sort((a, b) => rang(a.rovidites) - rang(b.rovidites));

  const evek = [...new Set(jogszabalyok.map(evOf))].sort((a, b) => a - b);
  const evtizedek = new Map<number, number[]>();
  for (const ev of evek) {
    const evtized = Math.floor(ev / 10) * 10;
    const sor = evtizedek.get(evtized);
    if (sor) sor.push(ev);
    else evtizedek.set(evtized, [ev]);
  }

  return (
    <main className="lap">
      <h1>A magyar törvények szövege és változástörténete</h1>
      <p className="alcim-sor">
        {jogszabalyok.length} törvény, {evek[0]}-től napjainkig. Minden módosításnál látszik, mi
        került bele a szövegbe és mi került ki belőle. Naponta frissül.
      </p>

      <form className="fo-kereso" action="/kereses" method="get">
        <input
          type="search"
          name="q"
          placeholder="Keresés a törvények teljes szövegében…"
          aria-label="Keresés a törvények teljes szövegében"
        />
        <button className="gomb" type="submit">
          Keresés
        </button>
      </form>
      <p className="kereso-pelda">
        Például: elévülés, felmondási idő, öröklési sorrend.
      </p>

      <section className="fo-szekcio">
        <h2>Legutóbbi változások</h2>
        <ul className="friss-lista">
          {frissek.map((v) => (
            <li key={`${v.tetel.slug}-${v.datum}`}>
              <span className="friss-datum">{datumSzoveg(v.datum)}</span>
              <Link className="friss-nev" href={`/jogszabaly/${v.tetel.slug}`}>
                {v.tetel.rovidites ?? v.tetel.megjeloles}
              </Link>
              <span className="friss-cim">{v.tetel.cim}</span>
              {v.elozoDatum ? (
                <Link
                  className="friss-diff"
                  href={`/jogszabaly/${v.tetel.slug}/diff/${v.elozoDatum}/${v.datum}`}
                >
                  mi változott?
                </Link>
              ) : (
                <span className="friss-diff">hatálybalépés</span>
              )}
            </li>
          ))}
        </ul>
        <p className="szekcio-lab">
          <Link href="/valtozasok">Összes változás</Link>
          {" · "}
          <a href="/valtozasok.xml">RSS</a>
        </p>
      </section>

      <section className="fo-szekcio">
        <h2>Kiemelt jogszabályok</h2>
        <ul className="jsz-lista">
          {kiemeltek.map((j) => (
            <li key={j.slug}>
              <Link className="jsz-sor" href={`/jogszabaly/${j.slug}`}>
                <span className="jsz-megjeloles">{j.megjeloles}</span>
                <span className="jsz-cim">{j.cim}</span>
                <span className="jsz-rov">{j.rovidites ?? ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="fo-szekcio">
        <h2>Böngészés évek szerint</h2>
        <div className="ev-racs">
          {[...evtizedek].map(([evtized, evtizedEvek]) => (
            <div className="ev-racs-sor" key={evtized}>
              <span className="ev-racs-cimke">{evtizedCimke(evtized)}</span>
              <span className="ev-racs-evek">
                {evtizedEvek.map((ev) => (
                  <Link key={ev} href={`/evek/${ev}`}>
                    {ev}
                  </Link>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
