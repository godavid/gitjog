import type { Metadata } from "next";
import Link from "next/link";
import { keres, type Talalat } from "@/lib/kereso";

export const metadata: Metadata = { title: "Keresés" };

/**
 * A kereses() a találatot vezérlőkarakterekkel jelöli (STX/ETX), nem HTML-lel:
 * a ts_headline nem escape-eli a bemenetét, ezért nyers HTML-ként visszaadni
 * XSS-kockázat lenne. Így a React escape-el minden szövegcsomópontot.
 */
function kiemelve(reszlet: string) {
  return reszlet
    .split(/[\u0002\u0003]/)
    .map((darab, i) => (i % 2 === 1 ? <mark key={i}>{darab}</mark> : darab));
}

// a keresés kérés-időben fut (query paraméter), az adatbázis végzi a munkát
export const dynamic = "force-dynamic";

export default async function KeresesOldal({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mind?: string }>;
}) {
  const { q, mind } = await searchParams;
  const kifejezes = (q ?? "").trim();
  const mindenben = mind === "1";

  let talalatok: Talalat[] = [];
  let hiba = false;
  if (kifejezes) {
    try {
      talalatok = await keres(kifejezes, mindenben);
    } catch {
      hiba = true;
    }
  }

  return (
    <main className="lap lap-szukebb">
      <h1>Keresés</h1>

      <form className="fo-kereso kereso-urlap" action="/kereses" method="get">
        <input
          type="search"
          name="q"
          defaultValue={kifejezes}
          placeholder="Keresés a törvények teljes szövegében…"
          aria-label="Keresés a törvények teljes szövegében"
        />
        <button className="gomb" type="submit">
          Keresés
        </button>
        <label className="kereso-kapcsolo">
          <input type="checkbox" name="mind" value="1" defaultChecked={mindenben} />
          hatályát vesztett törvényekben is
        </label>
      </form>

      {hiba ? (
        <p className="alcim-sor">
          A keresés átmenetileg nem elérhető. A jogszabályok szövege továbbra is olvasható; a
          kereséshez addig a{" "}
          <a href="https://njt.jog.gov.hu" rel="noopener">
            Nemzeti Jogszabálytár
          </a>{" "}
          áll rendelkezésre.
        </p>
      ) : !kifejezes ? (
        <p className="alcim-sor">Írj be egy kifejezést a fenti keresőmezőbe.</p>
      ) : (
        <p className="alcim-sor">
          „{kifejezes}” — {talalatok.length} találat
          {mindenben ? " (a hatályát vesztett törvényekkel együtt)" : ""}
        </p>
      )}

      {kifejezes && !hiba && talalatok.length === 0 ? (
        <p>
          Nincs találat. Próbáld másképp fogalmazni
          {mindenben ? "" : ", vagy keress a hatályát vesztett törvényekben is"}.
        </p>
      ) : null}

      {talalatok.map((t, i) => (
        <div className="talalat" key={i}>
          <h3>
            <Link href={`/jogszabaly/${t.slug}${t.horgony ? `#${t.horgony}` : ""}`}>
              {t.szakasz || t.jogszabaly}
            </Link>
          </h3>
          <p className="forras">
            {t.jogszabaly}
            {t.hatalyos ? null : <span className="hatalytalan-jel">hatályát vesztette</span>}
          </p>
          <p>{kiemelve(t.reszlet)}</p>
        </div>
      ))}
    </main>
  );
}
