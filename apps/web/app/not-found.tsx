import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Nincs ilyen oldal" };

export default function NemTalalhato() {
  return (
    <main className="lap lap-szukebb">
      <h1>Nincs ilyen oldal</h1>
      <p className="alcim-sor">
        A keresett jogszabály vagy időállapot nem található. Elgépelt URL vagy megszűnt
        hivatkozás lehet — a törvények szövege és változástörténete innen elérhető:
      </p>
      <nav className="eszkozsor" aria-label="Kiutak">
        <Link href="/">Jogszabály-lista</Link>
        <Link href="/valtozasok">Friss változások</Link>
        <Link href="/kereses">Keresés a szövegekben</Link>
        <Link href="/adatok">Az adatokról és a git-repóról</Link>
      </nav>
    </main>
  );
}
