// Write .dev.vars for a local run of the service (`npm run dev`): a fresh Ed25519 signing key and VAPID key; the stand-in for sign-in
// with one machine and one person, both for the project `proj-dev`; and Turnstile's published test secret, which always
// passes and is answered locally, with no network. Real sign-ups go through the local accounts database: run
// `npm run migrate:local` once first. It prints how to call the relay as each of the stand-in's.
// .dev.vars is ignored by git: these are throwaway values for this machine, never a deployed service's.
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".dev.vars");
if (existsSync(path) && !process.argv.includes("--force")) {
  console.error(`${path} is there already: run with --force to make new values`);
  process.exit(1);
}
const secret = () => randomBytes(24).toString("base64url");
const machine = secret();
const session = secret();
const pem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" });
// Web push's VAPID key (B-nk97q): a P-256 private key as a JWK, for this machine's local run only.
const vapid = JSON.stringify(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" }));
const grants = {
  machines: [{ token: machine, machine: "this-machine", account: "acct-dev", project: "proj-dev" }],
  sessions: [{ cookie: session, account: "acct-dev", handle: "dev", project: "proj-dev" }],
};
// Cloudflare's published Turnstile test secret that always passes (developers.cloudflare.com/turnstile).
const turnstileTest = ["1x", "0".repeat(31), "AA"].join("");
// .dev.vars is read as dotenv: a double-quoted value turns \n into a new line, and a single-quoted one is taken as it is.
const pemValue = `"${pem.trim().replace(/\n/g, "\\n")}"`;
writeFileSync(
  path,
  [`BAESIAN_ENV=development`, `SERVICE_SIGNING_KEY=${pemValue}`, `BAESIAN_DEV_ACCESS='${JSON.stringify(grants)}'`, `TURNSTILE_SECRET=${turnstileTest}`, `VAPID_KEY='${vapid}'`, ""].join("\n"),
  { mode: 0o600 },
);
console.log(`Wrote ${path}. With \`npm run dev\` running (http://localhost:8787):`);
console.log(`  as the machine: curl -H 'authorization: Bearer ${machine}' http://localhost:8787/v1/projects/proj-dev/state`);
console.log(`  as the person:  curl -H 'cookie: __Host-baesian-session=${session}' http://localhost:8787/v1/projects/proj-dev/state`);
console.log("  sign-in's settings: curl http://localhost:8787/v1/config");
