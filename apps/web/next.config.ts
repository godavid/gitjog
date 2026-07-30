import type { NextConfig } from "next";

const config: NextConfig = {
  // A tartalom a magyar-jogtar adat-repóból jön (raw.githubusercontent.com),
  // build-time + ISR fetch-ekkel; képeket nem szolgálunk ki külső forrásból.
  reactStrictMode: true,
};

export default config;
