// A pipeline által generált szigorú Markdown-részhalmaz determinisztikus
// HTML-renderelése: headingek (##–####), bekezdések, két szintű listák,
// pipe-táblák. A #### headingek horgony-id-t kapnak (§-mélylinkek).
//
// XSS-invariáns: MINDEN szövegcsomópont esc()-en megy át (entitás-escape),
// és az egyetlen generált attribútum-érték (horgony-id) [a-z0-9-]-re szűrt —
// ellenséges markdown-bemenet sem tud tag-et vagy attribútumot injektálni.
// Ezt az invariánst minden módosításnál tartsd fenn.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

export interface Szakaszjegyzek {
  id: string;
  cim: string;
  szint: 2 | 3 | 4;
}

export function mdRender(md: string): { html: string; jegyzek: Szakaszjegyzek[] } {
  const sorok = md.split("\n");
  const ki: string[] = [];
  const jegyzek: Szakaszjegyzek[] = [];
  const hasznaltIdk = new Map<string, number>(); // horgony-ütközések feloldásához
  let listaSzint = 0; // 0: nincs lista, 1: <ul>, 2: <ul><ul>
  let tablaban = false;
  let tablaSor = 0;

  const listaZar = (celSzint: number) => {
    while (listaSzint > celSzint) {
      ki.push("</ul>");
      listaSzint--;
    }
  };
  const tablaZar = () => {
    if (tablaban) {
      ki.push("</tbody></table></div>");
      tablaban = false;
      tablaSor = 0;
    }
  };

  for (const sor of sorok) {
    if (sor.trim() === "") {
      tablaZar();
      continue;
    }

    const heading = sor.match(/^(#{1,4}) (.+)$/);
    if (heading) {
      listaZar(0);
      tablaZar();
      const szint = heading[1]!.length;
      const cim = heading[2]!;
      if (szint === 1) {
        // A szöveg saját nyitó sora (a megjelölés) NEM h1: az oldal h1-je a
        // lap tetején áll, és tartalmazza a rövidítést is. Horgonyt itt sem
        // adunk — a jegyzék tartalma így változatlan (lásd horgony-invariáns).
        ki.push(`<h2 class="szoveg-fejcim">${esc(cim)}</h2>`);
      } else {
        // ismétlődő cím (pl. több "Értelmező rendelkezések" alcím) sorszámot kap
        const alap = horgonyId(cim);
        const eddig = hasznaltIdk.get(alap) ?? 0;
        hasznaltIdk.set(alap, eddig + 1);
        const id = eddig === 0 ? alap : `${alap}-${eddig + 1}`;
        jegyzek.push({ id, cim, szint: Math.min(szint, 4) as 2 | 3 | 4 });
        ki.push(
          `<h${szint} id="${id}">${esc(cim)}<a class="horgony" href="#${id}" aria-label="Hivatkozás: ${esc(cim)}">¶</a></h${szint}>`,
        );
      }
      continue;
    }

    if (sor.startsWith("| ")) {
      listaZar(0);
      if (!tablaban) {
        ki.push(`<div class="tabla-gorgeto"><table><tbody>`);
        tablaban = true;
        tablaSor = 0;
      }
      // elválasztó sor (minden cellája csak kötőjel): átugorjuk — de a
      // kötőjellel KEZDŐDŐ valós adatcella (pl. "| -5% |") nem elválasztó!
      if (/^\|(?: *:?-{3,}:? *\|)+ *$/.test(sor)) continue;
      const cellak = sor
        .slice(1, sor.endsWith("|") ? -1 : undefined)
        .split(" | ")
        .map((c) => c.replace(/\\\|/g, "|").trim());
      const tag = tablaSor === 0 ? "th" : "td";
      ki.push(`<tr>${cellak.map((c) => `<${tag}>${esc(c)}</${tag}>`).join("")}</tr>`);
      tablaSor++;
      continue;
    }

    const alpont = sor.match(/^ {2}- (.+)$/);
    if (alpont) {
      tablaZar();
      if (listaSzint === 0) {
        ki.push("<ul>");
        listaSzint = 1;
      }
      if (listaSzint === 1) {
        ki.push("<ul>");
        listaSzint = 2;
      }
      ki.push(`<li>${esc(alpont[1]!)}</li>`);
      continue;
    }
    const pont = sor.match(/^- (.+)$/);
    if (pont) {
      tablaZar();
      listaZar(1);
      if (listaSzint === 0) {
        ki.push("<ul>");
        listaSzint = 1;
      }
      ki.push(`<li>${esc(pont[1]!)}</li>`);
      continue;
    }

    listaZar(0);
    tablaZar();
    ki.push(`<p>${esc(sor)}</p>`);
  }
  listaZar(0);
  tablaZar();
  return { html: ki.join("\n"), jegyzek };
}
