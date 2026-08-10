import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import Link from "next/link";
import { OLDAL_URL } from "@/lib/sitemap";
import "./globals.css";

const LEIRAS =
  "A magyar törvények teljes szövege és változástörténete. Minden módosításnál látható, mi került bele a szövegbe és mi került ki belőle. Nem hiteles jogforrás.";

export const metadata: Metadata = {
  title: {
    default: "Nyílt Jogtár",
    template: "%s · Nyílt Jogtár",
  },
  description: LEIRAS,
  metadataBase: new URL(OLDAL_URL),
  alternates: {
    types: { "application/rss+xml": "/valtozasok.xml" },
  },
  // description szándékosan nincs itt: különben minden aloldal megosztásán ez
  // az általános szöveg jelenne meg az oldalspecifikus leírás helyett
  openGraph: {
    type: "website",
    locale: "hu_HU",
    siteName: "Nyílt Jogtár",
  },
  twitter: { card: "summary_large_image" },
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
              <Link href="/adatok">Az adatokról</Link>
              {" · "}
              <Link href="/valtozasok">Változások</Link>
              {" · "}
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
        {/* Vercel Web Analytics: süti nélküli, oldalszintű mérés — a látogató
            nem azonosítható, ezért nem kell hozzá süti-banner. */}
        <Analytics />
      </body>
    </html>
  );
}
