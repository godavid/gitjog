// JSON-LD blokkok szerializálása. Egyetlen helyen tartjuk az escape-elést:
// a `<` <-re cserélése zárja ki, hogy egy jogszabálycím kitörjön a
// script-blokkból (a JSON-ban ez ugyanazt a karakterláncot jelenti).

export function jsonLdSzoveg(adat: unknown): string {
  return JSON.stringify(adat).replace(/</g, "\\u003c");
}

export interface MorzsaElem {
  name: string;
  item: string;
}

/** schema.org BreadcrumbList — a mély oldalak (idővonal, diff) elhelyezése */
export function morzsaJsonLd(elemek: MorzsaElem[]): string {
  return jsonLdSzoveg({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: elemek.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      item: e.item,
    })),
  });
}
