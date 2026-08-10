import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllapotokSlug, getJogszabalyok } from "@/lib/adat";

export const revalidate = 21600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [jogszabalyok, sajat] = await Promise.all([getJogszabalyok(), getAllapotokSlug(slug)]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel) return {};
  const nev = tetel.rovidites ?? tetel.megjeloles;
  const elsoEv = sajat[0]?.datum.slice(0, 4);
  return {
    title: `Idővonal — ${nev}`,
    description:
      `${nev} — összes időállapot: ${sajat.length} módosítás` +
      `${elsoEv ? ` ${elsoEv} óta` : ""}, dátummal; mindegyiknél megtekinthető a pontos szövegváltozás.`,
    alternates: { canonical: `/jogszabaly/${slug}/idovonal` },
  };
}

export default async function IdovonalOldal({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [jogszabalyok, sajat] = await Promise.all([getJogszabalyok(), getAllapotokSlug(slug)]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel || !sajat.length) notFound();

  const forditott = [...sajat].reverse(); // legfrissebb felül
  return (
    <main className="lap lap-szukebb">
      <h1>{tetel.rovidites ?? tetel.megjeloles} — idővonal</h1>
      <p className="alcim-sor">
        {tetel.megjeloles} {tetel.cim} · {sajat.length} időállapot ·{" "}
        <Link href={`/jogszabaly/${slug}`}>hatályos szöveg</Link>
      </p>
      <ol className="idovonal">
        {forditott.map((a, i) => {
          const elozo = forditott[i + 1];
          return (
            <li key={a.datum}>
              <span className="datum">{a.datum}</span>
              <span className="muvelet">
                {elozo ? (
                  <Link href={`/jogszabaly/${slug}/diff/${elozo.datum}/${a.datum}`}>
                    mi változott?
                  </Link>
                ) : (
                  "hatálybalépés"
                )}
                <a
                  href={`https://github.com/godavid/magyar-jogtar/blob/${a.sha}/jogszabalyok/${slug}/szoveg.md`}
                  rel="noopener"
                >
                  szöveg ekkor
                </a>
              </span>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
