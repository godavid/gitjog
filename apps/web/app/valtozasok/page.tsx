import type { Metadata } from "next";
import Link from "next/link";
import { getLegutobbiValtozasok, type ValtozasTetel } from "@/lib/adat";

export const revalidate = 21600;

const DARAB = 100;

export const metadata: Metadata = {
  title: "Mi változott mostanában?",
  description:
    "Mi változott mostanában a magyar jogban? A legutóbb hatályba lépett törvénymódosítások, mindegyiknél a pontos szövegváltozással.",
  alternates: {
    canonical: "/valtozasok",
    types: { "application/rss+xml": "/valtozasok.xml" },
  },
};

export default async function ValtozasokOldal() {
  const valtozasok = await getLegutobbiValtozasok(DARAB);

  // dátumonként csoportosítva: egy naphoz jellemzően több módosítás tartozik
  const napok: { datum: string; tetelek: ValtozasTetel[] }[] = [];
  for (const v of valtozasok) {
    const utolso = napok.at(-1);
    if (utolso?.datum === v.datum) utolso.tetelek.push(v);
    else napok.push({ datum: v.datum, tetelek: [v] });
  }

  return (
    <main className="lap lap-szukebb">
      <h1>Mi változott mostanában?</h1>
      <p className="alcim-sor">
        A legutóbb hatályba lépett törvénymódosítások. Minden tételnél megnézhető a pontos
        szövegváltozás — mi került bele, mi került ki. Feedben is olvasható:{" "}
        <a href="/valtozasok.xml">/valtozasok.xml</a>
      </p>

      {napok.length === 0 ? (
        <p>Az elmúlt időszakban nem lépett hatályba módosítás.</p>
      ) : (
        <ol className="idovonal">
          {napok.map((nap) => (
            <li key={nap.datum}>
              <span className="datum">{nap.datum}</span>
              <ul className="valtozas-nap">
                {nap.tetelek.map((v) => (
                  <li key={`${v.tetel.slug}-${v.datum}`}>
                    <Link href={`/jogszabaly/${v.tetel.slug}`}>
                      {v.tetel.rovidites ?? v.tetel.megjeloles}
                    </Link>{" "}
                    <span className="valtozas-cim">{v.tetel.cim}</span>{" "}
                    {v.elozoDatum ? (
                      <Link
                        href={`/jogszabaly/${v.tetel.slug}/diff/${v.elozoDatum}/${v.datum}`}
                        className="valtozas-diff"
                      >
                        mi változott?
                      </Link>
                    ) : (
                      <span className="valtozas-diff">hatálybalépés</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
