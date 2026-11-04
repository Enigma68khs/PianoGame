// Copies local-only charts (songs-private/*.json, git-ignored) into public/private-songs/index.json so that
// `npm run dev` can load them. It runs from the `predev` hook ONLY: production builds and the GitHub Pages
// export never see these files. Files whose names start with "_" are ignored (templates).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const SRC = "songs-private";
const OUT = join("public", "private-songs");

// `--clean` (prebuild hook): remove the synced copy so no private chart can end up in a build / static export.
if (process.argv.includes("--clean")) {
  rmSync(OUT, { recursive: true, force: true });
  console.log("private songs: cleaned (production builds never contain them)");
  process.exit(0);
}

const charts = [];
if (existsSync(SRC)) {
  for (const file of readdirSync(SRC).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    try {
      charts.push({ file, chart: JSON.parse(readFileSync(join(SRC, file), "utf8")) });
    } catch (e) {
      charts.push({ file, error: String(e.message ?? e) });
    }
  }
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.json"), JSON.stringify({ charts }, null, 2));
console.log(`private songs: ${charts.length} file(s) → ${join(OUT, "index.json")}`);
