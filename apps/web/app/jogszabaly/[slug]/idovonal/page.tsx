import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { evOf, getAllapotokSlug, getJogszabalyok } from "@/lib/adat";
import { datumSzoveg } from "@/lib/datum";
import { morzsaJsonLd } from "@/lib/jsonld";
import { OLDAL_URL } from "@/lib/sitemap";

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
    title: `${nev} módosításai — ${sajat.length} időállapot${elsoEv ? ` ${elsoEv} óta` : ""}`,
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
  const morzsa = morzsaJsonLd([
    { name: "Nyílt Jogtár", item: OLDAL_URL },
    { name: `${evOf(tetel)}. évi törvények`, item: `${OLDAL_URL}/evek/${evOf(tetel)}` },
    { name: tetel.rovidites ?? tetel.megjeloles, item: `${OLDAL_URL}/jogszabaly/${slug}` },
    { name: "Összes időállapot", item: `${OLDAL_URL}/jogszabaly/${slug}/idovonal` },
  ]);

  return (
    <main className="lap lap-szukebb">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: morzsa }}
      />
      <h1>{tetel.rovidites ?? tetel.megjeloles} — összes időállapot</h1>
      <p className="alcim-sor">
        {tetel.megjeloles} {tetel.cim} · {sajat.length} időállapot
        {sajat[0] ? ` ${sajat[0].datum.slice(0, 4)} óta` : ""} ·{" "}
        <Link href={`/jogszabaly/${slug}`}>hatályos szöveg</Link>
      </p>
      <ol className="idovonal">
        {forditott.map((a, i) => {
          const elozo = forditott[i + 1];
          return (
            <li key={a.datum}>
              <span className="datum">{datumSzoveg(a.datum)}</span>
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
