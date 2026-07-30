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
        ki.push(`<h1>${esc(cim)}</h1>`);
      } else {
        const id = horgonyId(cim);
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
      if (/^\|( ---+ \|)+$/.test(sor.replace(/\|(\s*---+\s*\|)+/, (m) => m))) {
        // elválasztó sor: az előző sor volt a fejléc — itt egyszerűen átugorjuk
        continue;
      }
      if (/^\|\s*-/.test(sor)) continue;
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
