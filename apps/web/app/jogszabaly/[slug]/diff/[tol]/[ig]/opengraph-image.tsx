// A diff-oldal megosztókártyája: ez az a link, amit érdemes megosztani, ezért
// önmagában is érthetőnek kell lennie — melyik törvény, melyik két időpont közt.

import { ImageResponse } from "next/og";
import { getJogszabalyok } from "@/lib/adat";

export const alt = "Nyílt Jogtár — mi változott?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

const PAPIR = "#f7f5f1";
const TINTA = "#211f1a";
const TINTA_HALVANY = "#58554e";
const PECSET = "#0e6549";
const VONAL = "#dad7d2";

function csonkol(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export default async function Kep({
  params,
}: {
  params: Promise<{ slug: string; tol: string; ig: string }>;
}) {
  const { slug, tol, ig } = await params;
  const tetel = (await getJogszabalyok()).find((j) => j.slug === slug);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: PAPIR,
          color: TINTA,
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: PECSET, fontSize: 26 }}>
          <span style={{ fontSize: 34 }}>§</span>
          <span style={{ letterSpacing: 2 }}>NYÍLT JOGTÁR</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, flexGrow: 1 }}>
          {/* egyetlen szöveges gyerek: a Satori a többgyerekes div-től explicit
              display-t követelne */}
          <div style={{ fontSize: 62, lineHeight: 1.15 }}>
            {`${tetel?.rovidites ?? tetel?.megjeloles ?? slug}: mi változott?`}
          </div>
          <div style={{ fontSize: 34, color: TINTA_HALVANY, marginTop: 20, lineHeight: 1.3 }}>
            {csonkol(tetel?.cim ?? "", 120)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            borderTop: `2px solid ${VONAL}`,
            paddingTop: 24,
            fontSize: 30,
            color: TINTA_HALVANY,
          }}
        >
          <span>{tol}</span>
          <span style={{ color: PECSET }}>→</span>
          <span>{ig}</span>
        </div>
      </div>
    ),
    size,
  );
}
