import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllapotok, getJogszabalyok } from "@/lib/adat";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tetel = (await getJogszabalyok()).find((j) => j.slug === slug);
  return tetel ? { title: `Idővonal — ${tetel.rovidites ?? tetel.megjeloles}` } : {};
}

export default async function IdovonalOldal({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [jogszabalyok, allapotok] = await Promise.all([getJogszabalyok(), getAllapotok()]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  const sajat = allapotok[slug];
  if (!tetel || !sajat?.length) notFound();

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
