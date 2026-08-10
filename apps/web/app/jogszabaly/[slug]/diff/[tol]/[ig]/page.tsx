import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DiffNezet from "@/components/DiffNezet";
import { getAllapotokSlug, getJogszabalyok, getSzovegAt } from "@/lib/adat";
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
    title: `Diff ${tol} → ${ig} — ${nev}`,
    description: `${nev}: mi változott ${tol} és ${ig} között? A módosítás pontos szövege, bekezdésről bekezdésre, kiemelve.`,
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

  return (
    <main className="lap">
      <h1>{tetel.rovidites ?? tetel.megjeloles}: mi változott?</h1>
      <p className="alcim-sor">
        A {regi.datum} és {uj.datum} között hatályba lépett módosítások.{" "}
        {hozzaadott > 0 || torolt > 0 ? (
          <>
            {hozzaadott} sor került be, {torolt} sor került ki.{" "}
          </>
        ) : null}
        <Link href={`/jogszabaly/${slug}/idovonal`}>Idővonal</Link>
        {" · "}
        <Link href={`/jogszabaly/${slug}`}>Hatályos szöveg</Link>
      </p>
      <DiffNezet blokkok={blokkok} />
    </main>
  );
}
