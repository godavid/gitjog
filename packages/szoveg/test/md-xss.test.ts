// XSS-őr az apps/web/lib/md.ts mdRender()-éhez (csomaghatáron átnyúló import,
// az AGENTS.md importszabályaiban felsorolt kivétel, mint a szakaszok.test.ts-ben).
// Az invariáns: minden szövegcsomópont esc()-en megy át, az egyetlen generált
// attribútum-érték (horgony-id) [a-z0-9-]-re szűrt, és csak a rögzített
// tag-készlet kerül a kimenetbe.
import { describe, expect, it } from "vitest";
import { mdRender } from "../../../apps/web/lib/md.js";

/** A md.ts által kibocsátott tag-nevek; új tag csak tudatos bővítéssel kerülhet ide. */
const KIBOCSATOTT_TAGEK = new Set([
  "h2",
  "h3",
  "h4",
  "a",
  "p",
  "ul",
  "li",
  "div",
  "table",
  "tbody",
  "tr",
  "th",
  "td",
]);

/** A md.ts által kibocsátott attribútum-nevek. */
const KIBOCSATOTT_ATTRIBUTUMOK = new Set(["id", "class", "href", "aria-label", "tabindex"]);

const ELLENSEGES_MD = [
  "# <script>alert(1)</script> megjelölés",
  "",
  "Bekezdés <script>alert(1)</script> szöveggel és javascript:alert(1) hivatkozással.",
  "",
  '#### <img src=x onerror=1> " onmouseover="x',
  "",
  '- " onmouseover="x',
  '  - <b onmouseover="x">alpont</b>',
  "",
  '| " onmouseover="x | <script>alert(2)</script> |',
  "| --- | --- |",
  "| javascript:alert(1) | <td onerror=1> |",
].join("\n");

/**
 * A kimenet tag-jei (nyitó és záró) és a tag-ek közti szövegdarabok összefűzve.
 * Nem tisztító: a tesztállítások vizsgálják mindkét részt, a tag-eket külön.
 */
function szetszed(html: string): { tagek: string[]; szoveg: string } {
  const tagek = html.match(/<[^>]*>/g) ?? [];
  const szovegdarabok = html.split(/<[^>]*>/);
  return { tagek, szoveg: szovegdarabok.join("") };
}

describe("mdRender XSS-invariáns", () => {
  const { html } = mdRender(ELLENSEGES_MD);
  const { tagek, szoveg } = szetszed(html);

  it("a bemenet minden < jele &lt;-ként jelenik meg, a szövegmaradékban nincs nyers < vagy \"", () => {
    const bemenetiKisebb = (ELLENSEGES_MD.match(/</g) ?? []).length;
    const kimenetiEntitas = (html.match(/&lt;/g) ?? []).length;
    expect(bemenetiKisebb).toBeGreaterThan(0);
    // a heading címe kétszer szerepel (szöveg + aria-label), ezért >=
    expect(kimenetiEntitas).toBeGreaterThanOrEqual(bemenetiKisebb);
    expect(szoveg).not.toMatch(/[<"]/);
  });

  it("nem kerül be <script, és minden tag csak a md.ts saját attribútumait hordozza", () => {
    expect(html).not.toContain("<script");
    for (const tag of tagek) {
      // a tag belsejéből levesszük a tag-nevet és a szabályos name="value" párokat;
      // ha bármi marad (pl. injektált onerror=1), az invariáns sérült
      const belso = tag.slice(1, -1).replace(/^\/?[a-z][a-z0-9]*/, "");
      const attribok = [...belso.matchAll(/ ([a-z-]+)="([^"]*)"/g)];
      const maradek = belso.replace(/ [a-z-]+="[^"]*"/g, "").trim();
      expect(maradek, `idegen tartalom a tagben: ${tag}`).toBe("");
      for (const [, nev, ertek] of attribok) {
        expect(KIBOCSATOTT_ATTRIBUTUMOK.has(nev!), `ismeretlen attribútum: ${nev} (${tag})`).toBe(true);
        if (nev === "href") expect(ertek).toMatch(/^#[a-z0-9-]+$/);
      }
    }
  });

  it("minden id és horgony-href csak [a-z0-9-] karaktert tartalmaz", () => {
    const idk = [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const hrefek = [...html.matchAll(/ href="#([^"]*)"/g)].map((m) => m[1]!);
    expect(idk.length).toBeGreaterThan(0);
    for (const id of [...idk, ...hrefek]) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("a kimenet tag-nevei a md.ts rögzített tag-készletének részhalmaza", () => {
    const nevek = new Set(tagek.map((t) => t.match(/^<\/?([a-z][a-z0-9]*)/)![1]!));
    expect(nevek.size).toBeGreaterThan(0);
    for (const nev of nevek) {
      expect(KIBOCSATOTT_TAGEK.has(nev), `ismeretlen tag: <${nev}>`).toBe(true);
    }
  });
});
