import { generateKeyPairSync, randomBytes } from "node:crypto";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The relay's tests run in workerd, Cloudflare's runtime, through its Vitest plugin (B-hx2fn). The service's key and
// the stand-in's grants are made fresh for each run: no key or token is ever in the repo.

const secret = () => randomBytes(24).toString("base64url");

export const TEST_GRANTS = {
  machines: [
    { token: secret(), machine: "laptop", account: "acct-gus", project: "proj-a" },
    { token: secret(), machine: "spark-1", account: "acct-gus", project: "proj-b" },
  ],
  sessions: [
    { cookie: secret(), account: "acct-gus", handle: "gus", project: "proj-a" },
    { cookie: secret(), account: "acct-gus", handle: "gus", project: "proj-b" },
  ],
};

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BAESIAN_ENV: "test",
          BAESIAN_DEV_ACCESS: JSON.stringify(TEST_GRANTS),
          SERVICE_SIGNING_KEY: generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }) as string,
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/store-suite.test.ts"],
  },
});
