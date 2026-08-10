// Egy hónap törvénymódosításai. Ez a felület arra a keresletre válaszol, amit ma
// kézzel írt „mi változott" cikkek szolgálnak ki: hónaponként keletkezik egy új,
// önmagában is teljes, hivatkozható oldal.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHaviBontas, getJogszabalyok, type JogszabalyTetel } from "@/lib/adat";
import { datumSzoveg, honapBan, honapErvenyes, honapSzoveg } from "@/lib/datum";

export const revalidate = 86400;

/** Csak a friss hónapok készülnek el buildkor; a régiek első kérésre (ISR). */
const ELORE_GENERALT = 12;

interface HaviTetel {
  tetel: JogszabalyTetel;
  datum: string;
  elozoDatum: string | null;
}

export async function generateStaticParams() {
  const { honapok } = await getHaviBontas();
  return Object.keys(honapok)
    .sort()
    .slice(-ELORE_GENERALT)
    .map((ho) => ({ ho }));
}

async function honapAdat(ho: string) {
  if (!honapErvenyes(ho)) return null;
  const [bontas, jogszabalyok] = await Promise.all([getHaviBontas(), getJogszabalyok()]);
  const nyers = bontas.honapok[ho];
  if (!nyers?.length) return null;

  const nevek = new Map(jogszabalyok.map((j) => [j.slug, j]));
  const tetelek: HaviTetel[] = [];
  for (const [i, datum, elozoDatum] of nyers) {
    const tetel = nevek.get(bontas.slugok[i] ?? "");
    if (tetel) tetelek.push({ tetel, datum, elozoDatum });
  }
  tetelek.sort(
    (a, b) =>
      b.datum.localeCompare(a.datum) ||
      a.tetel.megjeloles.localeCompare(b.tetel.megjeloles, "hu"),
  );

  const kulcsok = Object.keys(bontas.honapok).sort();
  const i = kulcsok.indexOf(ho);
  return {
    tetelek,
    elozo: i > 0 ? kulcsok[i - 1] : undefined,
    kovetkezo: i >= 0 && i < kulcsok.length - 1 ? kulcsok[i + 1] : undefined,
  };
}

/**
 * Egy hónap tételei kétfélék: meglévő törvény módosítása, illetve új törvény
 * hatálybalépése. Összemosva pontatlan volna („1 törvénymódosítás" egy 1902-es
 * hatálybalépésre), ezért mindkettőt a saját nevén nevezzük.
 */
function merleg(tetelek: HaviTetel[]): string {
  const modositas = tetelek.filter((t) => t.elozoDatum !== null).length;
  const uj = tetelek.length - modositas;
  const reszek = [
    modositas > 0 ? `${modositas} törvénymódosítás` : null,
    uj > 0 ? `${uj} új törvény` : null,
  ].filter((s) => s !== null);
  return reszek.join(" és ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ho: string }>;
}): Promise<Metadata> {
  const { ho } = await params;
  const adat = await honapAdat(ho);
  if (!adat) return {};
  return {
    title: `Mi változott ${honapBan(ho)}? — ${merleg(adat.tetelek)}`,
    description:
      `${honapSzoveg(ho)}: ${merleg(adat.tetelek)} lépett hatályba. ` +
      "Mindegyiknél megnézhető a pontos szövegváltozás — mi került bele és mi került ki.",
    alternates: { canonical: `/valtozasok/${ho}` },
  };
}

export default async function HonapOldal({ params }: { params: Promise<{ ho: string }> }) {
  const { ho } = await params;
  const adat = await honapAdat(ho);
  if (!adat) notFound();

  // dátumonként csoportosítva: egy naphoz jellemzően több módosítás tartozik
  const napok: { datum: string; tetelek: HaviTetel[] }[] = [];
  for (const v of adat.tetelek) {
    const utolso = napok.at(-1);
    if (utolso?.datum === v.datum) utolso.tetelek.push(v);
    else napok.push({ datum: v.datum, tetelek: [v] });
  }

  return (
    <main className="lap lap-szukebb">
      <h1>Mi változott {honapBan(ho)}?</h1>
      <p className="alcim-sor">
        {merleg(adat.tetelek)} lépett hatályba ebben a hónapban. Mindegyiknél megnézhető a
        pontos szövegváltozás — mi került bele a szövegbe és mi került ki belőle.
      </p>

      <div className="eszkozsor">
        {adat.elozo ? (
          <Link href={`/valtozasok/${adat.elozo}`}>← {honapSzoveg(adat.elozo)}</Link>
        ) : null}
        {adat.kovetkezo ? (
          <Link href={`/valtozasok/${adat.kovetkezo}`}>{honapSzoveg(adat.kovetkezo)} →</Link>
        ) : null}
        <Link href="/valtozasok">Friss változások</Link>
      </div>

      <ol className="idovonal">
        {napok.map((nap) => (
          <li key={nap.datum}>
            <span className="datum">{datumSzoveg(nap.datum)}</span>
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
    </main>
  );
}
