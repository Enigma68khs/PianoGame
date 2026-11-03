import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // the game controller owns audio/rAF resources; avoid double-mount churn in dev
};

export default nextConfig;
