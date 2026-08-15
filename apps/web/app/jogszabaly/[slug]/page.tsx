import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { evOf, getAllapotokSlug, getJogszabalyok, getSzoveg } from "@/lib/adat";
import { datumSzoveg } from "@/lib/datum";
import { jsonLdSzoveg } from "@/lib/jsonld";
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
  const lezart = tetel.reteg === "lezart";
  return {
    title: tetel.rovidites
      ? `${tetel.rovidites} – ${tetel.megjeloles} ${lezart ? "már nem hatályos" : "hatályos"} szövege`
      : `${tetel.megjeloles} ${lezart ? "már nem hatályos" : "hatályos"} szövege – ${tetel.cim}`,
    description:
      `${tetel.megjeloles} ${tetel.cim} ${lezart ? "már nem hatályos, utolsó ismert" : "hatályos"} szövege` +
      `${utolso ? ` — ${lezart ? "az utolsó időállapot " : ""}${datumSzoveg(utolso.datum)} napjától` : ""}. ` +
      `${sajat.length} időállapot; módosításonként megnézhető, pontosan mi változott.`,
    alternates: {
      canonical: `/jogszabaly/${slug}`,
      types: { "application/rss+xml": `/jogszabaly/${slug}/valtozasok.xml` },
    },
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
  const lezart = tetel.reteg === "lezart";
  const { html } = mdRender(szoveg);

  // A megjelölés utolsó szava a jogszabály fajtája („törvény"). Csak azokat a
  // schema.org-mezőket töltjük ki, amikre tényleges adatunk van. Az első
  // időállapot dátuma a hatálybalépés, nem a kihirdetés, ezért abból
  // nem képezünk `legislationDate` mezőt.
  const tipus = tetel.megjeloles.split(" ").at(-1) ?? "jogszabály";
  const elso = sajat[0];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name: `${tetel.megjeloles} ${tetel.cim}`,
    ...(tetel.rovidites ? { alternateName: tetel.rovidites } : {}),
    legislationIdentifier: tetel.megjeloles,
    legislationType: tipus,
    ...(elso && utolso ? { temporalCoverage: `${elso.datum}/${utolso.datum}` } : {}),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSzoveg(jsonLd) }} />
      <h1>
        {tetel.rovidites ? `${tetel.rovidites} — ` : ""}
        {tetel.megjeloles} {tetel.cim}
      </h1>
      <p className="alcim-sor">
        {lezart ? "Utolsó ismert szöveg" : "Hatályos szöveg"}
        {utolso ? ` — ${datumSzoveg(utolso.datum)} napjától` : ""}.{" "}
        {lezart ? "A jogszabály már nem hatályos. " : null}
        {sajat.length > 1 ? (
          <>
            {sajat.length} időállapot{elso ? ` ${elso.datum.slice(0, 4)} óta` : ""}; minden
            módosításnál szó szerint megnézhető, mi került bele a szövegbe és mi került ki
            belőle.
          </>
        ) : (
          "Hatálybalépése óta nem módosult."
        )}
      </p>
      <div className="eszkozsor">
        <Link href={`/jogszabaly/${slug}/idovonal`}>Időállapotok</Link>
        {elozo && utolso ? (
          <Link href={`/jogszabaly/${slug}/diff/${elozo.datum}/${utolso.datum}`}>
            Legutóbbi módosítás
          </Link>
        ) : null}
        <Link href={`/evek/${evOf(tetel)}`}>{evOf(tetel)}. évi törvények</Link>
        <a href={`https://njt.jog.gov.hu/jogszabaly/${tetel.documentId}`} rel="noopener">
          Hiteles szöveg (njt)
        </a>
        <a href={`/jogszabaly/${slug}/szoveg.md`}>Nyers szöveg (.md)</a>
        <a href={`/jogszabaly/${slug}/valtozasok.xml`}>RSS</a>
      </div>
      <article className="jogszoveg" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
