// Agent-őr: riasztás GitHub Issue-val. A napi delta hibáinál hívjuk —
// rossz adat SOHA nem kerül a repóba, helyette hangos riasztás megy
// (az issue-ról a GitHub emailt küld a gazdának). Dedup CÍM szerint: amíg
// ugyanezzel a címmel van nyitott `parser-riasztas` issue, nem nyitunk újat —
// egy másfajta hiba viszont akkor is saját issue-t kap, ha egy régi még nyitva.

const CIMKE = "parser-riasztas";

export async function riaszt(cim: string, torzs: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // pl. "godavid/magyar-jog"
  if (!token || !repo) {
    console.error(`[riasztás — nincs GITHUB_TOKEN/GITHUB_REPOSITORY] ${cim}\n${torzs}`);
    return;
  }
  const fejlecek = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "gitjog-agent-or",
    "Content-Type": "application/json",
  };
  try {
    const teljesCim = `🚨 ${cim}`;
    const nyitottak = await fetch(
      `https://api.github.com/repos/${repo}/issues?state=open&labels=${CIMKE}&per_page=50`,
      { headers: fejlecek },
    );
    if (nyitottak.ok) {
      const lista = (await nyitottak.json()) as { title?: string; html_url?: string }[];
      const azonos = lista.find((i) => i.title === teljesCim);
      if (azonos) {
        console.error(`[riasztás — már nyitva: ${azonos.html_url ?? ""}] ${cim}`);
        return;
      }
    }
    const valasz = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: fejlecek,
      body: JSON.stringify({ title: teljesCim, body: torzs, labels: [CIMKE] }),
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
 * Módosító törvény-e a cím alapján („…egyes törvények módosításáról”).
 *
 * Ezek szakaszai a hatálybalépés után sorra hatályukat vesztik — a módosítás
 * beépül a módosított törvénybe —, így a konszolidált szövegük menet közben
 * kiürül. Az állomány 46%-a (közel 2000 törvény) ilyen, tehát a zsugorodásuk
 * nem anomália, hanem a normális életciklusuk.
 */
export function modositoTorveny(cim: string): boolean {
  return /módosításáról\s*$/iu.test(cim.trim());
}

/** A terjedelem-őr hibája — a hívó ezt jogszabályonként kezeli, nem futás-szinten. */
export class TerjedelemAnomalia extends Error {}

/**
 * Terjedelem-őr: az új szöveg gyanús mértékű zsugorodása/duzzadása njt-törésre
 * utal (pl. üres vagy csonka oldal) — ilyenkor inkább hibázunk, mint commitolunk.
 *
 * A `zsugorodhat` jelzés (módosító törvény) MINDKÉT küszöböt elengedi, a teljes
 * eltűnés (5% alá) kivételével — a cím és a preambulum ugyanis a kiürült
 * módosító törvényekben is megmarad. A duzzadás azért nem gyanús: egy több
 * lépcsőben hatályba lépő módosító törvény szakaszai a hatálybalépésük napján
 * megjelennek a konszolidált szövegben, majd másnap, beépülve a módosított
 * törvénybe, kiürülnek. Valós eset (2026. évi XVIII.): 16 590 → 111 538 →
 * 17 225 karakter három egymást követő időállapotban — ez a normális
 * életciklus, 2026-08-26-tól mégis kilenc napra leállította a napi deltát.
 */
export function terjedelemEllenorzes(
  regiHossz: number,
  ujHossz: number,
  mi: string,
  opciok: { zsugorodhat?: boolean } = {},
): void {
  if (regiHossz < 10_000) return; // kis fájlnál a nagy relatív ugrás normális
  const arany = ujHossz / regiHossz;
  const also = opciok.zsugorodhat ? 0.05 : 0.5;
  const felso = opciok.zsugorodhat ? Infinity : 2.0;
  if (arany < also || arany > felso) {
    throw new TerjedelemAnomalia(
      `Terjedelem-anomália (${mi}): ${regiHossz} → ${ujHossz} kar (${(arany * 100).toFixed(0)}%) — nem commitolom`,
    );
  }
}
