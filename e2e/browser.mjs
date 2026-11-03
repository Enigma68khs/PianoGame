// Shared browser launch for the E2E scripts.
//  - CHROME_PATH set            → that executable
//  - macOS Google Chrome found  → it (local development)
//  - otherwise                  → Playwright's own Chromium (CI: `npx playwright-core install --with-deps chromium`)
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function launchBrowser() {
  const executablePath = process.env.CHROME_PATH ?? (existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
  });
}
