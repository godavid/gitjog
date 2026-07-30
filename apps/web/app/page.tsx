import Link from "next/link";
import { getAllapotok, getJogszabalyok } from "@/lib/adat";

export const revalidate = 3600;

export default async function Fooldal() {
  const [jogszabalyok, allapotok] = await Promise.all([getJogszabalyok(), getAllapotok()]);
  return (
    <main className="lap">
      <h1>A magyar jogrendszer, verziókövetve</h1>
      <p className="alcim-sor">
        Egy commit = egy időállapot; a diff = a törvénymódosítás. {jogszabalyok.length} kiemelt
        jogszabály teljes időállapot-történettel, naponta frissítve a Nemzeti Jogszabálytárból.
      </p>
      <ul className="jsz-lista">
        {jogszabalyok.map((j) => {
          const utolso = allapotok[j.slug]?.at(-1)?.datum;
          return (
            <li key={j.slug}>
              <Link className="jsz-sor" href={`/jogszabaly/${j.slug}`}>
                <span className="jsz-megjeloles">{j.megjeloles}</span>
                <span className="jsz-cim">{j.cim}</span>
                <span className="jsz-rov">
                  {j.rovidites ?? ""}
                  {utolso ? ` · ${utolso}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
