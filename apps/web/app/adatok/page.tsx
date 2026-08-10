import type { Metadata } from "next";
import { ADAT_REPO, getAllomanyStatisztika } from "@/lib/adat";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Az adatokról",
  description:
    "Honnan jönnek a szövegek, milyen szerkezetben, milyen gyakran frissülnek, és hogyan használhatók fel újra. A teljes állomány egyetlen git repóból klónozható.",
  alternates: { canonical: "/adatok" },
};

export default async function AdatokOldal() {
  const { jogszabalySzam, allapotSzam } = await getAllomanyStatisztika();

  return (
    <main className="lap lap-szukebb">
      <h1>Az adatokról</h1>
      <p className="alcim-sor">
        Ez az oldal egy git repót jelenít meg. Minden törvény egy Markdown-fájl, minden commit egy
        időállapot: a commit dátuma a hatálybalépés napja, a diff maga a törvénymódosítás.
      </p>

      <section className="szoveg-szekcio">
        <h2>Forrás</h2>
        <p>
          A szövegek a{" "}
          <a href="https://njt.jog.gov.hu" rel="noopener">
            Nemzeti Jogszabálytár
          </a>{" "}
          publikus felületéről származnak, automatikus feldolgozással. Jelenleg {jogszabalySzam}{" "}
          törvény szerepel, összesen {allapotSzam} időállapottal. Nem szerepel
          benne minden jogszabály: azok a tételek maradtak ki, amelyeknek nincs konszolidált
          szövegük az njt-n.
        </p>
      </section>

      <section className="szoveg-szekcio">
        <h2>Frissítés</h2>
        <p>
          Naponta egyszer, automatikusan. Az aznap hatályba lépő módosítások új commitként kerülnek
          be az adat-repóba, és néhány órán belül megjelennek ezen az oldalon is.
        </p>
      </section>

      <section className="szoveg-szekcio">
        <h2>Felhasználás</h2>
        <p>
          A jogszabályok szövege a szerzői jogi törvény 1. § (4)–(5) bekezdése szerint nem tárgya a
          szerzői jogi védelemnek. A feldolgozást és a repó szerkezetét korlátozás nélkül
          felhasználhatod — hivatkozás jólesik, de nem feltétel. (Ez tájékoztatás, nem jogi tanács.)
        </p>
      </section>

      <section className="szoveg-szekcio">
        <h2>Klónozás</h2>
        <pre className="kodblokk">
          <code>git clone https://github.com/{ADAT_REPO}</code>
        </pre>
        <p>Szerkezet:</p>
        <pre className="kodblokk">
          <code>
            {`jogszabalyok/<slug>/szoveg.md   a konszolidált szöveg (HEAD = hatályos)
jogszabalyok/<slug>/meta.json   azonosító, cím, forrás-URL, időállapotok
index/jogszabalyok.json         az összes jogszabály listája
index/allapotok.json            időállapot → commit SHA térkép`}
          </code>
        </pre>
        <p>Néhány dolog, amit a git önmagában megválaszol:</p>
        <pre className="kodblokk">
          <code>
            {`# Mit módosítottak a Ptk.-n 2024-ben?
git log --since=2024-01-01 --until=2025-01-01 -- jogszabalyok/2013-evi-v-torveny-ptk/

# Két időállapot összevetése
git diff 'main@{2023-01-01}' 'main@{2025-01-01}' -- jogszabalyok/2012-evi-c-torveny-btk/szoveg.md

# Melyik szakasz mikor változott utoljára?
git blame jogszabalyok/2013-evi-v-torveny-ptk/szoveg.md`}
          </code>
        </pre>
        <p>
          Egyetlen szöveg letöltéséhez nem kell klónozni: minden jogszabály-oldalon ott a „Nyers
          szöveg (.md)" link, ami közvetlenül a Markdown-fájlra mutat.
        </p>
      </section>

      <section className="szoveg-szekcio">
        <h2>Figyelmeztetés</h2>
        <p>
          Nem hiteles jogforrás. Tájékozódási és kutatási célra készült, automatikus feldolgozással.
          A hiteles szöveg az{" "}
          <a href="https://njt.jog.gov.hu" rel="noopener">
            njt.jog.gov.hu
          </a>
          -n és a Magyar Közlönyben található.
        </p>
      </section>
    </main>
  );
}
