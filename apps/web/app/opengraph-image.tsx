// Alapértelmezett megosztókártya: minden olyan oldalra ez öröklődik, amelynek
// nincs saját opengraph-image-e (főoldal, /valtozasok, /adatok, évoldalak).

import { ImageResponse } from "next/og";
import { evOf, getJogszabalyok } from "@/lib/adat";

export const alt = "Nyílt Jogtár — a magyar törvények szövege és változástörténete";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

const PAPIR = "#f7f5f1";
const TINTA = "#211f1a";
const TINTA_HALVANY = "#58554e";
const PECSET = "#0e6549";
const VONAL = "#dad7d2";

export default async function Kep() {
  const jogszabalyok = await getJogszabalyok();
  const elsoEv = Math.min(...jogszabalyok.map(evOf));

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

        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, flexGrow: 1 }}>
          <div style={{ fontSize: 58, lineHeight: 1.2 }}>
            A magyar törvények szövege és változástörténete
          </div>
          <div style={{ fontSize: 32, color: TINTA_HALVANY, marginTop: 24, lineHeight: 1.35 }}>
            Minden módosításnál látszik, mi került bele a szövegbe és mi került ki belőle.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: `2px solid ${VONAL}`,
            paddingTop: 24,
            fontSize: 26,
            color: TINTA_HALVANY,
          }}
        >
          <span>{`${jogszabalyok.length} törvény, ${elsoEv} óta`}</span>
          <span>jogtar.remenyfarm.hu</span>
        </div>
      </div>
    ),
    size,
  );
}
