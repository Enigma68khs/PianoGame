import type { NextConfig } from "next";

// GitHub Pages build: `GITHUB_PAGES=true next build` → static export in ./out, served under /<repo>.
// Local dev / `next start` are unaffected.
const pages = process.env.GITHUB_PAGES === "true";
const repo = process.env.PAGES_BASE_PATH ?? "/PianoGame";

const nextConfig: NextConfig = {
  reactStrictMode: false, // the game controller owns audio/rAF resources; avoid double-mount churn in dev
  ...(pages ? { output: "export", basePath: repo, trailingSlash: true, images: { unoptimized: true } } : {}),
};

export default nextConfig;
