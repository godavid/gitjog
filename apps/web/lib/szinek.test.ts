// Őr: a globals.css világos OKLCH-tokenjei és a megosztókártyák (opengraph-image.tsx)
// meg a favicon (icon.svg) sRGB hex-másolatai egyeznek (DESIGN.md „Szín”).
// A fájlokat szövegként olvassuk; az OKLCH → sRGB átváltás a CSS Color 4
// mátrixaival készül, függőség nélkül. Tűrés: legfeljebb 2 csatornánként (kerekítés).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const WEB_GYOKER = join(import.meta.dirname, "..");
const TURES = 2;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCH (L 0–1, C, H fok) → sRGB 0–255 csatornák, CSS Color 4 mátrixokkal. */
function oklchRgb(L: number, C: number, H: number): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [r, g, bb] = lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  }) as [number, number, number];
  return { r, g, b: bb };
}

function hexRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function elteres(x: Rgb, y: Rgb): number {
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
}

/** A globals.css ELSŐ :root blokkja a világos séma; onnan olvassuk a tokent. */
function vilagosToken(css: string, nev: string): Rgb {
  const blokk = css.match(/:root\s*\{([^}]*)\}/)?.[1];
  assert.ok(blokk, "nincs :root blokk a globals.css-ben");
  const m = blokk.match(new RegExp(`--${nev}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
  assert.ok(m, `nincs --${nev} oklch token a világos :root-ban`);
  return oklchRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

function hexKonstans(forras: string, nev: string, fajl: string): string {
  const m = forras.match(new RegExp(`const ${nev} = "(#[0-9a-fA-F]{6})"`));
  assert.ok(m, `nincs ${nev} hex konstans: ${fajl}`);
  return m[1]!;
}

const css = readFileSync(join(WEB_GYOKER, "app/globals.css"), "utf8");
const TOKENEK: Record<string, string> = {
  PAPIR: "papir",
  TINTA: "tinta",
  TINTA_HALVANY: "tinta-halvany",
  PECSET: "pecset",
  VONAL: "vonal",
};
const OG_FAJLOK = [
  "app/opengraph-image.tsx",
  "app/jogszabaly/[slug]/opengraph-image.tsx",
  "app/jogszabaly/[slug]/diff/[tol]/[ig]/opengraph-image.tsx",
];

for (const fajl of OG_FAJLOK) {
  test(`${fajl}: a hex konstansok a világos tokenek másolatai`, () => {
    const forras = readFileSync(join(WEB_GYOKER, fajl), "utf8");
    for (const [konstans, token] of Object.entries(TOKENEK)) {
      const hex = hexKonstans(forras, konstans, fajl);
      const vart = vilagosToken(css, token);
      const d = elteres(hexRgb(hex), vart);
      assert.ok(
        d <= TURES,
        `${fajl} ${konstans}=${hex}, de --${token} ≈ rgb(${vart.r},${vart.g},${vart.b}); eltérés ${d} > ${TURES}`,
      );
    }
  });
}

test("icon.svg: a pecsétzöld fill a --pecset token másolata", () => {
  const svg = readFileSync(join(WEB_GYOKER, "app/icon.svg"), "utf8");
  const m = svg.match(/fill="(#0e6549)"/);
  assert.ok(m, 'nincs fill="#0e6549" az icon.svg-ben');
  const vart = vilagosToken(css, "pecset");
  const d = elteres(hexRgb(m[1]!), vart);
  assert.ok(d <= TURES, `icon.svg fill=${m[1]}, de --pecset ≈ rgb(${vart.r},${vart.g},${vart.b}); eltérés ${d} > ${TURES}`);
});
