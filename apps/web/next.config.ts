import type { NextConfig } from "next";

const config: NextConfig = {
  // A tartalom a magyar-jog adat-repóból jön (raw.githubusercontent.com),
  // build-time + ISR fetch-ekkel; képeket nem szolgálunk ki külső forrásból.
  reactStrictMode: true,
  // 2026-09-16: az oldal Nyílt Jogtárról GitJogra nevezve (védjegyfelszólítás).
  // A régi aldomain a bejövő linkek miatt még átirányít az újra.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "jogtar.remenyfarm.hu" }],
        destination: "https://gitjog.remenyfarm.hu/:path*",
        permanent: true,
      },
    ];
  },
};

export default config;
