// Két időállapot sorszintű diffjének megjelenítése. Szerver-komponens: a
// blokkokat készen kapja (lib/valtozas.ts), így a diff-szöveg benne van a
// kiszolgált HTML-ben — enélkül a kereső és az AI-crawlerek nem látják.

import type { Blokk } from "@/lib/valtozas";

interface Props {
  blokkok: Blokk[];
}

const KONTEXTUS = 3;

export default function DiffNezet({ blokkok }: Props) {
  const valtozott = blokkok.some((b) => b.tipus !== "kontextus");
  if (!valtozott) {
    return <p>A két időállapot szövege azonos.</p>;
  }

  return (
    <div className="diff">
      {blokkok.map((b, i) => {
        if (b.tipus === "kontextus") {
          const elso = i === 0;
          const utolso = i === blokkok.length - 1;
          // rövid blokknál nincs mit kihagyni — átfedő szeletek duplikálnának
          const rovid = b.sorok.length <= 2 * KONTEXTUS;
          const eleje = elso ? [] : rovid ? b.sorok : b.sorok.slice(0, KONTEXTUS);
          const vege = utolso || (rovid && !elso) ? [] : rovid ? b.sorok : b.sorok.slice(-KONTEXTUS);
          const kihagyva = rovid && !(elso && utolso) ? 0 : b.sorok.length - eleje.length - vege.length;
          return (
            <div key={i}>
              {!elso &&
                eleje.map((s, j) => (
                  <div key={`e${j}`} className="sor">
                    {s || " "}
                  </div>
                ))}
              {kihagyva > 0 && <div className="kihagyas">⋯ {kihagyva} változatlan sor ⋯</div>}
              {!utolso &&
                vege.map((s, j) => (
                  <div key={`v${j}`} className="sor">
                    {s || " "}
                  </div>
                ))}
            </div>
          );
        }
        return (
          <div key={i}>
            {b.sorok.map((s, j) => (
              <div key={j} className={`sor ${b.tipus}`}>
                {s || " "}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
