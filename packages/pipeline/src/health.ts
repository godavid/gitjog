// Agent-őr: riasztás GitHub Issue-val. A napi delta hibáinál hívjuk —
// rossz adat SOHA nem kerül a repóba, helyette hangos riasztás megy
// (az issue-ról a GitHub emailt küld a gazdának). Dedup: amíg van nyitott
// `parser-riasztas` címkéjű issue, nem nyitunk újat.

const CIMKE = "parser-riasztas";

export async function riaszt(cim: string, torzs: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // pl. "godavid/magyar-jogtar"
  if (!token || !repo) {
    console.error(`[riasztás — nincs GITHUB_TOKEN/GITHUB_REPOSITORY] ${cim}\n${torzs}`);
    return;
  }
  const fejlecek = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "nyilt-jogtar-agent-or",
    "Content-Type": "application/json",
  };
  try {
    const nyitottak = await fetch(
      `https://api.github.com/repos/${repo}/issues?state=open&labels=${CIMKE}&per_page=1`,
      { headers: fejlecek },
    );
    if (nyitottak.ok && ((await nyitottak.json()) as unknown[]).length > 0) {
      console.error(`[riasztás — már van nyitott ${CIMKE} issue] ${cim}`);
      return;
    }
    const valasz = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: fejlecek,
      body: JSON.stringify({ title: `🚨 ${cim}`, body: torzs, labels: [CIMKE] }),
    });
    if (!valasz.ok) {
      console.error(`[riasztás — issue-nyitás sikertelen: HTTP ${valasz.status}] ${cim}`);
    } else {
      const issue = (await valasz.json()) as { html_url?: string };
      console.error(`[riasztás — issue nyitva] ${issue.html_url ?? ""}`);
    }
  } catch (e) {
    console.error(`[riasztás — hálózati hiba] ${cim} — ${String(e)}`);
  }
}

/**
 * Terjedelem-őr: az új szöveg gyanús mértékű zsugorodása/duzzadása njt-törésre
 * utal (pl. üres vagy csonka oldal) — ilyenkor inkább hibázunk, mint commitolunk.
 */
export function terjedelemEllenorzes(regiHossz: number, ujHossz: number, mi: string): void {
  if (regiHossz < 10_000) return; // kis fájlnál a nagy relatív ugrás normális
  const arany = ujHossz / regiHossz;
  if (arany < 0.5 || arany > 2.0) {
    throw new Error(
      `Terjedelem-anomália (${mi}): ${regiHossz} → ${ujHossz} kar (${(arany * 100).toFixed(0)}%) — nem commitolom`,
    );
  }
}
