// index/kihagyottak.json: a backfill által szöveg nélkül kihagyott jogszabályok.
// A lista csak bővül (backfill.ts összefésüli a régit az újjal), ezért az utóbb
// mégis bekerült jogszabályokat a napi deltának kell kivennie belőle.

export interface KihagyottTetel {
  documentId: string;
  slug: string;
  ok: string;
}

/**
 * Kiszűri a listából azokat, amelyek documentId-ja vagy slug-ja már a felvett
 * (az index/jogszabalyok.json-ban szereplő) jogszabályok közt van. A sorrend
 * és a többi tétel változatlan marad, hogy a fájl diffje csak a törlés legyen.
 */
export function kihagyottakSzuro(
  lista: KihagyottTetel[],
  felvettDocIdk: ReadonlySet<string>,
  felvettSlugok: ReadonlySet<string>,
): KihagyottTetel[] {
  return lista.filter((k) => !felvettDocIdk.has(k.documentId) && !felvettSlugok.has(k.slug));
}
