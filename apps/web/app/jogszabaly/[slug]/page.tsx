import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllapotokSlug, getJogszabalyok, getSzoveg, nyersUrl } from "@/lib/adat";
import { mdRender } from "@/lib/md";

export const revalidate = 21600;

export async function generateStaticParams() {
  const jogszabalyok = await getJogszabalyok();
  return jogszabalyok.filter((j) => j.rovidites !== null).map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [jogszabalyok, sajat] = await Promise.all([getJogszabalyok(), getAllapotokSlug(slug)]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel) return {};
  const utolso = sajat.at(-1);
  return {
    title: `${tetel.rovidites ?? tetel.megjeloles} — ${tetel.cim}`,
    description:
      `${tetel.megjeloles} ${tetel.cim} teljes szövege` +
      `${utolso ? ` — a ${utolso.datum} napján hatályos állapot` : ""}. ` +
      `${sajat.length} időállapot; módosításonként megnézhető, pontosan mi változott.`,
    alternates: { canonical: `/jogszabaly/${slug}` },
  };
}

export default async function JogszabalyOldal({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [jogszabalyok, sajat, szoveg] = await Promise.all([
    getJogszabalyok(),
    getAllapotokSlug(slug),
    getSzoveg(slug),
  ]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  if (!tetel || !szoveg) notFound();

  const utolso = sajat.at(-1);
  const elozo = sajat.at(-2);
  const { html } = mdRender(szoveg);

  // A megjelölés utolsó szava a jogszabály fajtája („törvény"). Csak azokat a
  // schema.org-mezőket töltjük ki, amikre tényleges adatunk van: a kihirdetés
  // dátuma és a hatályossági jelző nincs az indexben, ezért kimarad.
  const tipus = tetel.megjeloles.split(" ").at(-1) ?? "jogszabály";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name: `${tetel.megjeloles} ${tetel.cim}`,
    ...(tetel.rovidites ? { alternateName: tetel.rovidites } : {}),
    legislationIdentifier: tetel.megjeloles,
    legislationType: tipus,
    ...(utolso ? { legislationDateVersion: utolso.datum, dateModified: utolso.datum } : {}),
    ...(tipus === "törvény"
      ? { legislationPassedBy: { "@type": "Organization", name: "Országgyűlés" } }
      : {}),
    jurisdiction: "HU",
    legislationJurisdiction: "HU",
    inLanguage: "hu",
    url: `https://jogtar.remenyfarm.hu/jogszabaly/${slug}`,
    sameAs: `https://njt.jog.gov.hu/jogszabaly/${tetel.documentId}`,
  };

  return (
    <main className="lap lap-szukebb">
      {/* a `<` escape-elése zárja ki, hogy egy jogszabálycím kitörjön a script-blokkból */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
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
        <a href={nyersUrl("main", slug)} rel="noopener">
          Nyers szöveg (.md)
        </a>
      </div>
      <article className="jogszoveg" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
