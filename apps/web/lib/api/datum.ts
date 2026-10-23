// Dátum-ellenőrzés: az alak (YYYY-MM-DD) mellett a naptárban is létező nap
// kell — a „2026-02-30" alakilag jó, de nem valódi dátum. Nincs import, hogy
// tiszta függvényként tesztelhető legyen.

const DATUM_MINTA = /^\d{4}-\d{2}-\d{2}$/;

/** igaz, ha `d` YYYY-MM-DD alakú és valódi naptári dátum */
export function ervenyesDatum(d: string): boolean {
  if (!DATUM_MINTA.test(d)) return false;
  // UTC oda-vissza alakítás: a túlcsorduló napot (febr. 30) a Date átrollozza,
  // a képtelen hónapot Invalid Date-ként adja — mindkettő elbukik az összehasonlításon.
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}
