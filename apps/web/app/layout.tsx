import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nyílt Jogtár",
    template: "%s · Nyílt Jogtár",
  },
  description:
    "A magyar jogrendszer git-natív verziókövetése: jogszabályok hatályos szövege, időállapotok és módosítás-diffek. Nem hiteles jogforrás.",
  metadataBase: new URL("https://jogtar.remenyfarm.hu"),
};

export default function GyokerElrendezes({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body>
        <header className="fejlec">
          <div className="fejlec-belso">
            <Link href="/" className="wordmark">
              <span className="pecsetjel">§</span>Nyílt Jogtár
            </Link>
            <form className="fejlec-kereso" action="/kereses" role="search">
              <input
                type="search"
                name="q"
                placeholder="Keresés a jogszabályokban…"
                aria-label="Keresés a jogszabályok teljes szövegében"
              />
              <button className="gomb" type="submit">
                Keresés
              </button>
            </form>
          </div>
        </header>
        {children}
        <footer className="lablec">
          <div className="lablec-belso">
            <span>
              Nem hiteles jogforrás, tájékozódási célra. Hiteles szöveg:{" "}
              <a href="https://njt.jog.gov.hu" rel="noopener">
                njt.jog.gov.hu
              </a>
            </span>
            <span>
              <a href="https://github.com/godavid/magyar-jogtar" rel="noopener">
                Adat-repo (git)
              </a>
              {" · "}
              <a href="https://github.com/godavid/gitjog" rel="noopener">
                Kód
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
