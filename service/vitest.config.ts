import { generateKeyPairSync, randomBytes } from "node:crypto";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The service's tests run in workerd, Cloudflare's runtime, through its Vitest plugin (B-hx2fn). The service's key, the
// stand-in's grants and the Globus app's secret are made fresh for each run: no key or token is ever in the repo. The
// accounts database gets its migrations before each test file (test/apply-migrations.ts). Turnstile's secret is
// Cloudflare's published test key that always passes.

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

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BAESIAN_ENV: "test",
          BAESIAN_DEV_ACCESS: JSON.stringify(TEST_GRANTS),
          SERVICE_SIGNING_KEY: generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }) as string,
          TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
          GLOBUS_ISSUER: "https://globus.test",
          GLOBUS_CLIENT_ID: "baesian-test-client",
          GLOBUS_CLIENT_SECRET: secret(),
          // Web push's VAPID key (B-nk97q): a P-256 private key as a JWK, made for this run.
          VAPID_KEY: JSON.stringify(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" })),
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/store-suite.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
  },
}));
