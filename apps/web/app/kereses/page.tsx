import type { Metadata } from "next";
import Link from "next/link";
import { keres } from "@/lib/kereso";

export const metadata: Metadata = { title: "Keresés" };

// a keresés kérés-időben fut (query paraméter), az index modul-cache-ből jön
export const dynamic = "force-dynamic";

export default async function KeresesOldal({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const kifejezes = (q ?? "").trim();
  const talalatok = kifejezes ? await keres(kifejezes) : [];

  return (
    <main className="lap lap-szukebb">
      <h1>Keresés</h1>
      {!kifejezes ? (
        <p className="alcim-sor">Írj be egy kifejezést a fenti keresőmezőbe.</p>
      ) : (
        <p className="alcim-sor">
          „{kifejezes}” — {talalatok.length} találat (egyelőre a kiemelt törvények teljes
          szövegében; a teljes állományra kiterjedő keresés hamarosan)
        </p>
      )}
      {kifejezes && talalatok.length === 0 ? (
        <p>
          Nincs találat. Próbáld másképp fogalmazni, vagy keresd a kifejezést a{" "}
          <a href={`https://njt.jog.gov.hu`} rel="noopener">
            Nemzeti Jogszabálytárban
          </a>
          .
        </p>
      ) : null}
      {talalatok.map((t, i) => (
        <div className="talalat" key={i}>
          <h3>
            <Link href={`/jogszabaly/${t.slug}${t.horgony ? `#${t.horgony}` : ""}`}>
              {t.szakasz || t.jogszabaly}
            </Link>
          </h3>
          <p className="forras">{t.jogszabaly}</p>
          <p>{t.reszlet}</p>
        </div>
      ))}
    </main>
  );
}
