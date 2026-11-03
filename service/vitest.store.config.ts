import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// B-0ag7h's check: the store's own tests over the relay's SQLite, in workerd. Only the suites that run over each kind of
// storage (`LAYERS`, named "… over …") are kept; the rest of test/store.test.ts needs a repo, git and a disk.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" }, miniflare: { bindings: { BAESIAN_ENV: "test" } } })],
  test: {
    include: ["test/store-suite.test.ts"],
    testNamePattern: / over (memory, with no repo, in workerd|the relay's SQLite)/,
  },
});
