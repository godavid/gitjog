// Szakasz-válasz cache-ideje (mp). Csak a mai napnál korábbi datum végleges
// (napi delta már nem érinti) → egy napig cache-elhető; a mai vagy jövőbeli
// datumra a napi delta még módosíthat, ezért ugyanaz a rövid 15 perc,
// amit a valtozasok route is használ.

export function szakaszCacheMp(
  datum: string | undefined,
  ma: string = new Date().toISOString().slice(0, 10),
): number {
  if (!datum) return 3_600;
  return datum < ma ? 86_400 : 900;
}
