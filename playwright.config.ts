import { defineConfig } from "@playwright/test";

// The client's browser tests (D100): Playwright with its own Chromium, run locally with `npm run e2e`, which
// builds the client first. Each test starts a real server over a fixture repo. Round 5's self-test becomes
// this suite as the client is ported (docs/vault/Design/Client Build.md).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  reporter: "list",
  projects: [{ name: "chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } }],
});
