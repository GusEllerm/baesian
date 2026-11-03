import { configDefaults, defineConfig } from "vitest/config";

// Unit and integration tests. The browser tests in e2e/ are Playwright's (D100), run with `npm run e2e`.
export default defineConfig({
  test: {
    // .claude/ holds agents' worktrees: their copies of the tests aren't this tree's.
    exclude: [...configDefaults.exclude, "e2e/**", ".claude/**"],
    // Tests run wherever: never inside the session of the harness that runs them.
    env: { CLAUDE_CODE_SESSION_ID: "", CODEX_THREAD_ID: "" },
  },
});
