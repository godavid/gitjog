"use client";

// Két időállapot sorszintű diffje, kliens oldalon számolva.
// A szövegek a raw.githubusercontent.com-ról jönnek commit-SHA-val
// (immutábilis, CDN-ről cache-elt, CORS-engedélyezett).

import { diffLines } from "diff";
import { useEffect, useState } from "react";

interface Props {
  regiUrl: string;
  ujUrl: string;
}

type Allapot =
  | { fazis: "tolt" }
  | { fazis: "hiba"; uzenet: string }
  | { fazis: "kesz"; blokkok: { tipus: "uj" | "torolt" | "kontextus"; sorok: string[] }[] };

const KONTEXTUS = 3;

export default function DiffNezet({ regiUrl, ujUrl }: Props) {
  const [allapot, setAllapot] = useState<Allapot>({ fazis: "tolt" });

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const [regiV, ujV] = await Promise.all([fetch(regiUrl), fetch(ujUrl)]);
        if (!regiV.ok || !ujV.ok) {
          throw new Error(`Nem sikerült letölteni a szövegeket (HTTP ${regiV.status}/${ujV.status})`);
        }
        const [regi, uj] = await Promise.all([regiV.text(), ujV.text()]);
        const reszek = diffLines(regi, uj);
        const blokkok = reszek.map((r) => ({
          tipus: r.added ? ("uj" as const) : r.removed ? ("torolt" as const) : ("kontextus" as const),
          sorok: r.value.replace(/\n$/, "").split("\n"),
        }));
        if (aktiv) setAllapot({ fazis: "kesz", blokkok });
      } catch (e) {
        if (aktiv) setAllapot({ fazis: "hiba", uzenet: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [regiUrl, ujUrl]);

  if (allapot.fazis === "tolt") {
    return <p role="status">Diff számítása…</p>;
  }
  if (allapot.fazis === "hiba") {
    return <p role="alert">Hiba: {allapot.uzenet}</p>;
  }

  const valtozott = allapot.blokkok.some((b) => b.tipus !== "kontextus");
  if (!valtozott) {
    return <p>A két időállapot szövege azonos.</p>;
  }

  return (
    <div className="diff">
      {allapot.blokkok.map((b, i) => {
        if (b.tipus === "kontextus") {
          const elso = i === 0;
          const utolso = i === allapot.blokkok.length - 1;
          const eleje = elso ? [] : b.sorok.slice(0, KONTEXTUS);
          const vege = utolso ? [] : b.sorok.slice(-KONTEXTUS);
          const kihagyva = b.sorok.length - eleje.length - vege.length;
          return (
            <div key={i}>
              {!elso &&
                eleje.map((s, j) => (
                  <div key={`e${j}`} className="sor">
                    {s || " "}
                  </div>
                ))}
              {kihagyva > 0 && <div className="kihagyas">⋯ {kihagyva} változatlan sor ⋯</div>}
              {!utolso &&
                vege.map((s, j) => (
                  <div key={`v${j}`} className="sor">
                    {s || " "}
                  </div>
                ))}
            </div>
          );
        }
        return (
          <div key={i}>
            {b.sorok.map((s, j) => (
              <div key={j} className={`sor ${b.tipus}`}>
                {s || " "}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
