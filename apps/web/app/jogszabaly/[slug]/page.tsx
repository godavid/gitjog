import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllapotok, getJogszabalyok, getSzoveg } from "@/lib/adat";
import { mdRender } from "@/lib/md";

export const revalidate = 3600;

export async function generateStaticParams() {
  const jogszabalyok = await getJogszabalyok();
  return jogszabalyok.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tetel = (await getJogszabalyok()).find((j) => j.slug === slug);
  if (!tetel) return {};
  return {
    title: `${tetel.rovidites ?? tetel.megjeloles} — ${tetel.cim}`,
    description: `${tetel.megjeloles} ${tetel.cim} — hatályos szöveg, időállapotok és módosítás-diffek.`,
  };
}

export default async function JogszabalyOldal({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [jogszabalyok, allapotok, szoveg] = await Promise.all([
    getJogszabalyok(),
    getAllapotok(),
    getSzoveg(slug),
  ]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel || !szoveg) notFound();

  const sajat = allapotok[slug] ?? [];
  const utolso = sajat.at(-1);
  const elozo = sajat.at(-2);
  const { html } = mdRender(szoveg);

  return (
    <main className="lap lap-szukebb">
      <div className="eszkozsor">
        <span>
          Hatályos állapot: <strong>{utolso?.datum ?? "?"}</strong> · {sajat.length} időállapot
        </span>
        <Link href={`/jogszabaly/${slug}/idovonal`}>Idővonal</Link>
        {elozo && utolso ? (
          <Link href={`/jogszabaly/${slug}/diff/${elozo.datum}/${utolso.datum}`}>
            Legutóbbi módosítás
          </Link>
        ) : null}
        <a href={`https://njt.jog.gov.hu/jogszabaly/${tetel.documentId}`} rel="noopener">
          Hiteles szöveg (njt)
        </a>
      </div>
      <article className="jogszoveg" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
