import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests run against a production build (`pnpm build` first) and a seeded database.
 * They sign in with the demo accounts, so everything they create is owned by demo users and
 * removed by the demo reset that runs before each test run (global-setup.ts).
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // In CI: a line per test in the log, plus annotations on failures.
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // CLAUDE.md: the UI must work at 360 px.
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: {
    // Run Next directly (not through the pnpm wrapper) so the server exits when tests finish;
    // through pnpm it was left running and CI waited until the job timed out.
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Tests never call the real AI provider.
    env: { AI_PROVIDER: "mock" },
    timeout: 60_000,
  },
});
