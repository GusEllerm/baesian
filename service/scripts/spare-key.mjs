// Make the service's spare signing key (B-x47ek, "Pin a spare key now"): an Ed25519 key whose private half you keep
// offline, and whose public half the service publishes beside its own key (GET /v1/keys) without ever signing with it,
// so every hosted repo's CI pins it now (`baesian ci` prints its line), and keeps passing the day the service's key has
// to be replaced by it.
//
//   node service/scripts/spare-key.mjs <path for the private key, outside this repo> [--id relay-2]
//
// It writes the private key there (PKCS #8 in PEM, as SERVICE_SIGNING_KEY takes it), readable only by you, and prints
// the public half, and the three Worker variables to put in service/wrangler.jsonc's `vars`. It never sends anything
// anywhere, and runs no wrangler command.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const idAt = args.indexOf("--id");
const id = idAt >= 0 ? args.splice(idAt, 2)[1] : nextId();
const [target, ...rest] = args;

function fail(message) {
  console.error(`spare-key: ${message}`);
  process.exit(1);
}

/** The key ID after the one the service signs with (wrangler.jsonc's SERVICE_KEY_ID): relay-1, so relay-2. */
function nextId() {
  try {
    const m = /"SERVICE_KEY_ID":\s*"([a-z0-9-]*?)(\d+)"/.exec(readFileSync(join(here, "..", "wrangler.jsonc"), "utf8"));
    if (m) return `${m[1]}${Number(m[2]) + 1}`;
  } catch {
    // no wrangler.jsonc beside it: the default
  }
  return "relay-2";
}

/** Whether a path is inside a git working tree, where a file could be committed by mistake. */
function inRepo(path) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(path), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return top !== "" && !relative(top, path).startsWith("..");
  } catch {
    return false;
  }
}

if (!target || rest.length) fail("give one path to write the private key to, outside this repo: node service/scripts/spare-key.mjs ~/baesian-spare-key.pem");
if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`a key ID is a lowercase slug, such as relay-2, not ${JSON.stringify(id)}`);
const path = resolve(target);
if (!existsSync(dirname(path))) fail(`${dirname(path)} doesn't exist`);
if (existsSync(path)) fail(`${path} is there already: this never overwrites a key`);
if (inRepo(path)) fail(`${path} is inside a git repository, where it could be committed: write it somewhere else`);

const { privateKey } = generateKeyPairSync("ed25519");
// The public half in OpenSSH's form, as a service key file holds it: the key type, then the 32 bytes, each length-prefixed.
const raw = Buffer.from(privateKey.export({ format: "jwk" }).x, "base64url");
const field = (b) => Buffer.concat([Buffer.from([0, 0, 0, b.length]), b]);
const publicKey = `ssh-ed25519 ${Buffer.concat([field(Buffer.from("ssh-ed25519")), field(raw)]).toString("base64")}`;
const validAfter = new Date().toISOString();
writeFileSync(path, privateKey.export({ format: "pem", type: "pkcs8" }), { flag: "wx", mode: 0o600 });

console.log(`Made the spare service key ${id}.

Its public half:

  ${publicKey}

1. Put these in service/wrangler.jsonc's "vars", beside SERVICE_KEY_ID (Worker variables, not secrets: they're public):

    "SERVICE_SPARE_KEY_ID": "${id}",
    "SERVICE_SPARE_PUBLIC_KEY": "${publicKey}",
    "SERVICE_SPARE_KEY_VALID_AFTER": "${validAfter}",

   then commit (Baesian-Card: B-x47ek) and release. Once it's deployed, https://baesian.dev/v1/keys lists it as "spare".

2. In each linked repo, this one too, run \`baesian ci\` and set BAESIAN_TRUST to the lines it prints: the spare's line
   is printed beside the service's key. CI passes with or without it until the day the service switches.

3. KEEP THE PRIVATE KEY OFFLINE. ${path} is the spare's private key, written readable only by you.
   Move it now to storage that's offline and yours alone (an encrypted USB drive, or a printed copy kept somewhere safe),
   then delete it from this machine. Never commit it, paste it, upload it or set it as a secret until the day it's used.
   If it leaks while it waits, anyone holding it can sign answers every pinned CI accepts: take its line out of every
   repo's BAESIAN_TRUST, and make a new spare.

The day the service's key must be replaced: set the spare as the secret SERVICE_SIGNING_KEY, from that file; set
SERVICE_KEY_ID to ${id} and SERVICE_KEY_VALID_AFTER to ${validAfter} in wrangler.jsonc; take the three SERVICE_SPARE_
variables out; deploy; then make a new spare with this script.`);
