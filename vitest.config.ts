import { configDefaults, defineConfig } from "vitest/config";

// Unit and integration tests. The browser tests in e2e/ are Playwright's (D100), run with `npm run e2e`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
