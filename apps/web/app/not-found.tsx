import Link from "next/link";

export default function NemTalalhato() {
  return (
    <main className="lap lap-szukebb">
      <h1>Nincs ilyen oldal</h1>
      <p className="alcim-sor">
        A keresett jogszabály vagy időállapot nem található.{" "}
        <Link href="/">Vissza a jogszabály-listához</Link>
      </p>
    </main>
  );
}
