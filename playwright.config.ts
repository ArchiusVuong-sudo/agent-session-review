import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 4117);
const external = process.env.E2E_BASE_URL;

/**
 * The end-to-end run uses the production build in replay mode, with a fresh
 * data folder each time. Build first: npm run build && npm run test:e2e.
 * E2E_BASE_URL points it at a server that is already running instead.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    // "chrome" uses the installed Chrome; set PW_CHANNEL=chromium after `npx playwright install chromium`.
    channel: process.env.PW_CHANNEL ?? "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: `node -e "require('fs').rmSync('.data/e2e',{recursive:true,force:true})" && next start -H 127.0.0.1 -p ${port}`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: { DEMO_REPLAY: "1", REPLAY_DELAY_MS: "40", DATA_DIR: ".data/e2e" },
      },
});
