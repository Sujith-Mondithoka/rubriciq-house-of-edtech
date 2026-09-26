import { defineConfig, devices } from "@playwright/test";

import baseConfig from "./playwright.config";

/**
 * Screenshots for design review (not tests): `SHOT_LABEL=before pnpm screens`.
 * Same server and seeded demo data as the E2E suite; images go to screenshots/<label>/.
 */
export default defineConfig({
  ...baseConfig,
  testDir: "tests/screens",
  retries: 0,
  reporter: "list",
  timeout: 180_000,
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "desktop-dark",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        colorScheme: "dark",
      },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } },
    },
  ],
});
