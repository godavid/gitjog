import Link from "next/link";
import { getJogszabalyok, type JogszabalyTetel } from "@/lib/adat";

export const revalidate = 3600;

function evOf(j: JogszabalyTetel): number {
  return Number(j.documentId.slice(0, 4));
}

/** „1820-as évek” alakú címke; a negyvenes és hetvenes évek -es ragosak */
function evtizedCimke(evtized: number): string {
  const ketjegy = evtized % 100;
  const rag = ketjegy === 40 || ketjegy === 70 ? "es" : "as";
  return `${evtized}-${rag} évek`;
}

export default async function Fooldal() {
  const jogszabalyok = await getJogszabalyok();
  const kiemeltek = jogszabalyok.filter((j) => j.rovidites !== null);

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
      <h1>A magyar jogrendszer, verziókövetve</h1>
      <p className="alcim-sor">
        {jogszabalyok.length} törvény, {evek[0]}-től napjainkig, naponta frissítve.
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
