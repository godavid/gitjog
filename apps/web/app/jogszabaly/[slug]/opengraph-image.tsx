// Megosztásnál látszó kártya. A metadata-route-ok paraméterenként statikusan
// cache-eltek, ezért a költség a ténylegesen megosztott oldalak száma.
// A beépített betűkészlet leellenőrizve rendereli az ő/ű/§ karaktereket.

import { ImageResponse } from "next/og";
import { getAllapotokSlug, getJogszabalyok } from "@/lib/adat";

export const alt = "Nyílt Jogtár — jogszabály";
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

export default async function Kep({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [jogszabalyok, sajat] = await Promise.all([getJogszabalyok(), getAllapotokSlug(slug)]);
  const tetel = jogszabalyok.find((j) => j.slug === slug);
  const utolso = sajat.at(-1);

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
          <div style={{ fontSize: 62, lineHeight: 1.15 }}>
            {tetel?.rovidites ?? tetel?.megjeloles ?? "Jogszabály"}
          </div>
          <div style={{ fontSize: 34, color: TINTA_HALVANY, marginTop: 20, lineHeight: 1.3 }}>
            {csonkol(tetel ? `${tetel.megjeloles} ${tetel.cim}` : slug, 150)}
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
          <span>{utolso ? `Hatályos állapot: ${utolso.datum}` : "Hatályos szöveg"}</span>
          <span>{sajat.length > 0 ? `${sajat.length} időállapot` : ""}</span>
        </div>
      </div>
    ),
    size,
  );
}
