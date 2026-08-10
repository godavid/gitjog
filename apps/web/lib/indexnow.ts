// IndexNow: a Bing, a Yandex és a Seznam közös protokollja arra, hogy egy oldal
// maga jelentse be a friss vagy megváltozott URL-jeit. Nem kell hozzá webmester-
// fiók és verifikáció, csak egy publikus kulcsfájl a domainen.
//
// Azért éri meg: a diff-oldalak azonnal indexelhetővé válnak ott is, ahol a
// crawler nem futtat JS-t, és a Bing indexére több AI-kereső is épít.

import { OLDAL_URL } from "@/lib/sitemap";

/** Nem titok: a kulcsfájl publikus, a kulcs csak a domain birtoklását igazolja. */
export const INDEXNOW_KULCS = "f2b522b792d5d8381a74992ca28abe51";

const VEGPONT = "https://api.indexnow.org/indexnow";
const MAX_URL = 10_000; // a protokoll kérésenkénti korlátja

export interface BekuldesEredmeny {
  bekuldott: number;
  kotegek: { darab: number; statusz: number }[];
}

export async function indexNowBekuldes(urlok: string[]): Promise<BekuldesEredmeny> {
  const host = new URL(OLDAL_URL).host;
  const egyediek = [...new Set(urlok)];
  const kotegek: BekuldesEredmeny["kotegek"] = [];

  for (let i = 0; i < egyediek.length; i += MAX_URL) {
    const koteg = egyediek.slice(i, i + MAX_URL);
    const valasz = await fetch(VEGPONT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KULCS,
        keyLocation: `${OLDAL_URL}/${INDEXNOW_KULCS}.txt`,
        urlList: koteg,
      }),
      cache: "no-store",
    });
    kotegek.push({ darab: koteg.length, statusz: valasz.status });
  }

  return { bekuldott: egyediek.length, kotegek };
}
