// Markdown → §-szintű szakaszok a keresőindexhez.
//
// A horgony-generálásnak BIT SZERINT egyeznie kell az apps/web/lib/md.ts
// mdRender()-ével (ismétlődő címek -2, -3 utótagos ütközésfeloldásával
// együtt), különben a találat mélylinkje rossz §-ra visz. Ezt az invariánst
// a test/szakaszok.test.ts őrzi: mindkét implementációt ugyanarra a
// bemenetre futtatja és összeveti.

export interface Szakasz {
  /** sorrend a törvényen belül, 1-től */
  sorszam: number;
  /** a szakasz címe, pl. "6:272. § [Megbízási szerződés]" */
  cim: string;
  /** URL-fragment a mélylinkhez */
  horgony: string;
  /** a szakasz sima szövege, kereséshez normalizálva */
  szoveg: string;
}

export function horgonyId(cim: string): string {
  return cim
    .toLowerCase()
    .replace(/§/g, "sz")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** ennél hosszabb heading nélküli törzset bekezdéshatáron darabolunk */
export const MAX_TORZS_HOSSZ = 2500;

/** Bekezdéshatáron darabol: szó közepén sosem vág. */
function darabol(sorok: string[]): string[] {
  const darabok: string[] = [];
  let akt: string[] = [];
  let hossz = 0;
  for (const sor of sorok) {
    if (hossz > 0 && hossz + sor.length > MAX_TORZS_HOSSZ) {
      darabok.push(akt.join(" ").trim());
      akt = [];
      hossz = 0;
    }
    akt.push(sor);
    hossz += sor.length + 1;
  }
  if (akt.length > 0) darabok.push(akt.join(" ").trim());
  return darabok;
}

export function szakaszokraBont(md: string): Szakasz[] {
  const szakaszok: Szakasz[] = [];
  const hasznaltIdk = new Map<string, number>(); // ütközésfeloldás, mint az mdRenderben
  let cim = "";
  let horgony = "";
  let sorok: string[] = [];
  let sorszam = 0;

  const lezar = () => {
    if (sorok.length === 0) return;
    // A heading NÉLKÜLI törzs (bevezető rész, vagy egy tagolatlan törvény teljes
    // szövege) nem veszhet el: 1924 törvénynek — köztük 1025 hatályosnak — nincs
    // egyetlen ##-#### headingje sem, ezek különben kimaradnának a keresésből.
    // Ilyenkor darabolunk, mert egy több száz kilobájtos szakasz a relevanciát
    // (ts_rank_cd hossznormalizálás) és a kiemelést is elrontaná.
    // A headinges szakaszokat NEM daraboljuk: a mélylink egy §-ra mutasson.
    for (const szoveg of cim ? [sorok.join(" ").trim()] : darabol(sorok)) {
      if (szoveg) szakaszok.push({ sorszam: ++sorszam, cim, horgony, szoveg });
    }
    sorok = [];
  };

  for (const sor of md.split("\n")) {
    const h = sor.match(/^#{2,4} (.+)$/);
    if (h) {
      lezar();
      cim = h[1]!;
      // A számlálót MINDEN headingnél léptetni kell — akkor is, ha a szakasz
      // üres lesz és kimarad —, különben elcsúszunk az mdRender jegyzékétől.
      const alap = horgonyId(cim);
      const eddig = hasznaltIdk.get(alap) ?? 0;
      hasznaltIdk.set(alap, eddig + 1);
      horgony = eddig === 0 ? alap : `${alap}-${eddig + 1}`;
      continue;
    }
    if (!sor || sor.startsWith("# ")) continue;
    if (/^\|(?: *:?-{3,}:? *\|)+ *$/.test(sor)) continue; // táblázat-elválasztó
    sorok.push(
      sor.startsWith("| ")
        ? sor.replace(/^\| | \|$/g, "").split(" | ").join(" · ")
        : sor.replace(/^ *- /, ""),
    );
  }
  lezar();
  return szakaszok;
}
