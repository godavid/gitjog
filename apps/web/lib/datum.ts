// Magyar dátumformázás. Az adat-repóban minden dátum ISO-alakú (YYYY-MM-DD),
// a látogató viszont „2025. november 1." alakban olvas és keres — a címekben és
// a fejlécekben ezért ez a forma szerepel, az adatszerkezetekben az ISO marad.
//
// Toldalékot SZÁNDÉKOSAN csak hónapnévre teszünk. A jogszabály-rövidítések
// ragozása (a Btk.-ban / az Mt.-ben) rövidítésenként más hangrendű és más
// névelőt kíván, azt tehát nem generáljuk: a címek gondolatjellel és
// kettősponttal szerkesztettek, nem ragozással.

const HONAPOK = [
  "január",
  "február",
  "március",
  "április",
  "május",
  "június",
  "július",
  "augusztus",
  "szeptember",
  "október",
  "november",
  "december",
] as const;

/** helyhatározós alak: „2026 januárjában" — a magyar toldalék nem szabályos, ezért tábla */
const HONAPOK_BAN = [
  "januárjában",
  "februárjában",
  "márciusában",
  "áprilisában",
  "májusában",
  "júniusában",
  "júliusában",
  "augusztusában",
  "szeptemberében",
  "októberében",
  "novemberében",
  "decemberében",
] as const;

/** „2025-11-01" → [2025, 11, 1]; `null`, ha nem értelmezhető */
function bont(iso: string): [number, number, number] | null {
  const m = iso.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return null;
  const ho = Number(m[2]);
  if (ho < 1 || ho > 12) return null;
  return [Number(m[1]), ho, m[3] ? Number(m[3]) : 1];
}

/** „2025-11-01" → „2025. november 1." (ismeretlen alaknál az eredetit adja vissza) */
export function datumSzoveg(iso: string): string {
  const r = bont(iso);
  if (!r) return iso;
  const [ev, ho, nap] = r;
  return `${ev}. ${HONAPOK[ho - 1]} ${nap}.`;
}

/** „2026-01" → „2026. január" */
export function honapSzoveg(iso: string): string {
  const r = bont(iso);
  if (!r) return iso;
  return `${r[0]}. ${HONAPOK[r[1] - 1]}`;
}

/** „2026-01" → „2026 januárjában" */
export function honapBan(iso: string): string {
  const r = bont(iso);
  if (!r) return iso;
  return `${r[0]} ${HONAPOK_BAN[r[1] - 1]}`;
}

/** „2025-11-01" → „2025-11" */
export function honapKulcs(iso: string): string {
  return iso.slice(0, 7);
}

/** érvényes-e egy „YYYY-MM" alakú hónapkulcs */
export function honapErvenyes(kulcs: string): boolean {
  return /^\d{4}-\d{2}$/.test(kulcs) && bont(kulcs) !== null;
}

/** az előző, illetve a következő hónap kulcsa („2026-01" → „2025-12" / „2026-02") */
export function honapLep(kulcs: string, irany: 1 | -1): string {
  const r = bont(kulcs);
  if (!r) return kulcs;
  const [ev, ho] = r;
  const n = (ev * 12 + (ho - 1)) + irany;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}
