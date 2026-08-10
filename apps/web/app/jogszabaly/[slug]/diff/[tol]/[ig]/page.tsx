import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DiffNezet from "@/components/DiffNezet";
import { evOf, getAllapotokSlug, getJogszabalyok, getSzovegAt } from "@/lib/adat";
import { datumSzoveg } from "@/lib/datum";
import { morzsaJsonLd } from "@/lib/jsonld";
import { OLDAL_URL } from "@/lib/sitemap";
import { valtozasSzamitas } from "@/lib/valtozas";

// A két összevetett állapot commit-SHA-ra pinnelt, a kiszámolt diff tehát soha
// nem változik — örökre cache-elhető. Új módosításhoz új diff-oldal keletkezik.
export const revalidate = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; tol: string; ig: string }>;
}): Promise<Metadata> {
  const { slug, tol, ig } = await params;
  const tetel = (await getJogszabalyok()).find((j) => j.slug === slug);
  if (!tetel) return {};
  const nev = tetel.rovidites ?? tetel.megjeloles;
  return {
    title: `${nev} — mi változott? ${datumSzoveg(ig)}`,
    description: `${nev}: mi változott ${datumSzoveg(tol)} és ${datumSzoveg(ig)} között? A módosítás pontos szövege, bekezdésről bekezdésre, kiemelve.`,
    alternates: { canonical: `/jogszabaly/${slug}/diff/${tol}/${ig}` },
  };
}

export default async function DiffOldal({
  params,
}: {
  params: Promise<{ slug: string; tol: string; ig: string }>;
}) {
  const { slug, tol, ig } = await params;
  const [jogszabalyok, sajat] = await Promise.all([getJogszabalyok(), getAllapotokSlug(slug)]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  const regi = sajat.find((a) => a.datum === tol);
  const uj = sajat.find((a) => a.datum === ig);
  if (!tetel || !regi || !uj) notFound();

  const [regiSzoveg, ujSzoveg] = await Promise.all([
    getSzovegAt(regi.sha, slug),
    getSzovegAt(uj.sha, slug),
  ]);
  if (regiSzoveg === null || ujSzoveg === null) notFound();

  const { blokkok, hozzaadott, torolt } = valtozasSzamitas(regiSzoveg, ujSzoveg);

  // A szomszédos módosítások: a ~22 600 diff-oldal eddig csak az idővonalról
  // és a sitemapból volt elérhető, egymásra nem mutattak.
  const igIdx = sajat.findIndex((a) => a.datum === uj.datum);
  const elozoPar = igIdx >= 2 ? [sajat[igIdx - 2]!, sajat[igIdx - 1]!] : null;
  const kovetkezoPar = igIdx >= 0 && igIdx + 1 < sajat.length ? [sajat[igIdx]!, sajat[igIdx + 1]!] : null;

  const morzsa = morzsaJsonLd([
    { name: "Nyílt Jogtár", item: OLDAL_URL },
    { name: `${evOf(tetel)}. évi törvények`, item: `${OLDAL_URL}/evek/${evOf(tetel)}` },
    { name: tetel.rovidites ?? tetel.megjeloles, item: `${OLDAL_URL}/jogszabaly/${slug}` },
    {
      name: `Mi változott? ${datumSzoveg(uj.datum)}`,
      item: `${OLDAL_URL}/jogszabaly/${slug}/diff/${tol}/${ig}`,
    },
  ]);

  return (
    <main className="lap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: morzsa }} />
      <h1>
        {tetel.rovidites ?? tetel.megjeloles} — mi változott? {datumSzoveg(uj.datum)}
      </h1>
      <p className="alcim-sor">
        A {datumSzoveg(regi.datum)} és {datumSzoveg(uj.datum)} között hatályba lépett
        módosítások.{" "}
        {hozzaadott > 0 || torolt > 0 ? (
          <>
            {hozzaadott} sor került be, {torolt} sor került ki.
          </>
        ) : null}
      </p>
      <div className="eszkozsor">
        {elozoPar ? (
          <Link href={`/jogszabaly/${slug}/diff/${elozoPar[0].datum}/${elozoPar[1].datum}`}>
            ← Előző módosítás ({datumSzoveg(elozoPar[1].datum)})
          </Link>
        ) : null}
        {kovetkezoPar ? (
          <Link href={`/jogszabaly/${slug}/diff/${kovetkezoPar[0].datum}/${kovetkezoPar[1].datum}`}>
            Következő módosítás ({datumSzoveg(kovetkezoPar[1].datum)}) →
          </Link>
        ) : null}
        <Link href={`/jogszabaly/${slug}/idovonal`}>Időállapotok</Link>
        <Link href={`/jogszabaly/${slug}`}>Hatályos szöveg</Link>
      </div>
      <DiffNezet blokkok={blokkok} />
    </main>
  );
}
