import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DiffNezet from "@/components/DiffNezet";
import { getAllapotokSlug, getJogszabalyok, nyersUrl } from "@/lib/adat";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; tol: string; ig: string }>;
}): Promise<Metadata> {
  const { slug, tol, ig } = await params;
  const tetel = (await getJogszabalyok()).find((j) => j.slug === slug);
  return tetel
    ? { title: `Diff ${tol} → ${ig} — ${tetel.rovidites ?? tetel.megjeloles}` }
    : {};
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

  return (
    <main className="lap">
      <h1>{tetel.rovidites ?? tetel.megjeloles}: mi változott?</h1>
      <p className="alcim-sor">
        A {regi.datum} és {uj.datum} között hatályba lépett módosítások.{" "}
        <Link href={`/jogszabaly/${slug}/idovonal`}>Idővonal</Link>
        {" · "}
        <Link href={`/jogszabaly/${slug}`}>Hatályos szöveg</Link>
      </p>
      <DiffNezet regiUrl={nyersUrl(regi.sha, slug)} ujUrl={nyersUrl(uj.sha, slug)} />
    </main>
  );
}
