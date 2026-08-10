// Napi IndexNow-bejelentés: az elmúlt napokban hatályba lépett módosítások
// jogszabály- és diff-oldalait küldi be. A Vercel cron hívja (ld. vercel.json),
// közvetlenül a napi delta workflow lefutása után.

import { legutobbiValtozasokFrissen } from "@/lib/adat";
import { indexNowBekuldes } from "@/lib/indexnow";
import { OLDAL_URL } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Ennyi napra visszamenőleg jelentünk be — a hézagot egy kimaradt futás se nyissa ki. */
const NAPOK = 3;
const MERET = 300; // ennyi legutóbbi időállapotból szűrünk

export async function GET(request: Request) {
  const titok = process.env.CRON_SECRET;
  if (titok && request.headers.get("authorization") !== `Bearer ${titok}`) {
    return Response.json({ hiba: "Nincs jogosultság" }, { status: 401 });
  }

  const hatar = new Date(Date.now() - NAPOK * 86_400_000).toISOString().slice(0, 10);
  const frissek = (await legutobbiValtozasokFrissen(MERET)).filter((v) => v.datum >= hatar);

  if (frissek.length === 0) {
    return Response.json({ hatar, valtozas: 0, bekuldott: 0 });
  }

  const urlok = frissek.flatMap((v) => [
    `${OLDAL_URL}/jogszabaly/${v.tetel.slug}`,
    ...(v.elozoDatum
      ? [`${OLDAL_URL}/jogszabaly/${v.tetel.slug}/diff/${v.elozoDatum}/${v.datum}`]
      : []),
  ]);
  // a változás-lista és a feed is frissül minden ilyen napon
  urlok.push(`${OLDAL_URL}/valtozasok`, OLDAL_URL);
  // az érintett havi oldalak is (hónapfordulón két hónap is szóba jön)
  for (const honap of new Set(frissek.map((v) => v.datum.slice(0, 7)))) {
    urlok.push(`${OLDAL_URL}/valtozasok/${honap}`);
  }

  const eredmeny = await indexNowBekuldes(urlok);
  return Response.json({ hatar, valtozas: frissek.length, ...eredmeny });
}
