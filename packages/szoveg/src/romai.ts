const SZIMBOLUMOK: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** 1..3999 → nagybetűs római szám (pl. 4 → "IV", 1999 → "MCMXCIX") */
export function arabbolRomai(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new Error(`arabbolRomai: érvénytelen bemenet: ${n} (1..3999 egész kell)`);
  }
  let eredmeny = "";
  let maradek = n;
  for (const [ertek, jel] of SZIMBOLUMOK) {
    while (maradek >= ertek) {
      eredmeny += jel;
      maradek -= ertek;
    }
  }
  return eredmeny;
}

const ROMAI_MINTA = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/** római szám (kis/nagybetű vegyesen elfogadva) → arab; hibás bemenetre dobjon */
export function romaibolArab(s: string): number {
  const nagybetus = s.toUpperCase();
  if (nagybetus.length === 0 || !ROMAI_MINTA.test(nagybetus)) {
    throw new Error(`romaibolArab: érvénytelen római szám: "${s}"`);
  }
  let ertek = 0;
  let i = 0;
  for (const [szam, jel] of SZIMBOLUMOK) {
    while (nagybetus.startsWith(jel, i)) {
      ertek += szam;
      i += jel.length;
    }
  }
  return ertek;
}
