import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { evOf, getJogszabalyok } from "@/lib/adat";

export const revalidate = 86400;

export async function generateStaticParams() {
  const jogszabalyok = await getJogszabalyok();
  const evek = [...new Set(jogszabalyok.map(evOf))];
  return evek.map((ev) => ({ ev: String(ev) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ev: string }>;
}): Promise<Metadata> {
  const { ev } = await params;
  const tetelek = (await getJogszabalyok()).filter((j) => evOf(j) === Number(ev));
  return {
    title: `${ev}. évi törvények`,
    description: `A ${ev}. évben kihirdetett ${tetelek.length} törvény listája, teljes szöveggel és változástörténettel.`,
    alternates: { canonical: `/evek/${ev}` },
  };
}

export default async function EvOldal({
  params,
}: {
  params: Promise<{ ev: string }>;
}) {
  const { ev: evParam } = await params;
  const ev = Number(evParam);
  const jogszabalyok = await getJogszabalyok();
  const tetelek = jogszabalyok.filter((j) => evOf(j) === ev);
  if (!Number.isInteger(ev) || tetelek.length === 0) notFound();

  const evek = [...new Set(jogszabalyok.map(evOf))].sort((a, b) => a - b);
  const i = evek.indexOf(ev);
  const elozo = i > 0 ? evek[i - 1] : undefined;
  const kovetkezo = i >= 0 && i < evek.length - 1 ? evek[i + 1] : undefined;

  return (
    <main className="lap">
      <h1>{ev}. évi törvények</h1>
      <p className="alcim-sor">
        {tetelek.length} törvény
        {elozo !== undefined ? (
          <>
            {" · "}
            <Link href={`/evek/${elozo}`}>← {elozo}</Link>
          </>
        ) : null}
        {kovetkezo !== undefined ? (
          <>
            {" · "}
            <Link href={`/evek/${kovetkezo}`}>{kovetkezo} →</Link>
          </>
        ) : null}
      </p>
      <ul className="jsz-lista">
        {tetelek.map((j) => (
          <li key={j.slug}>
            <Link className="jsz-sor" href={`/jogszabaly/${j.slug}`}>
              <span className="jsz-megjeloles">{j.megjeloles}</span>
              <span className="jsz-cim">{j.cim}</span>
              <span className="jsz-rov">{j.rovidites ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
