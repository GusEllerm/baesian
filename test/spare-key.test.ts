import { spawnSync } from "node:child_process";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spareKey } from "../service/src/signer.js";
import { NAMESPACE, opensshPublicKey, signMessage } from "../src/sshsig.js";
import { checkSigned, parseTrust } from "../src/trust.js";
import { cleanup, repo } from "./helpers.js";

// B-x47ek: the script the person runs to make the service's spare key, which they keep offline. It writes the private
// half where they say, outside any repo, and prints the public half and the Worker variables the service publishes it
// from; a file signed with the spare checks against the key file the service makes of those variables.

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "service", "scripts", "spare-key.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  cleanup();
});

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "baesian-spare-"));
  dirs.push(d);
  return d;
}

const make = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

/** The three Worker variables the script prints, as wrangler.jsonc's `vars` would give them to the service. */
function varsOf(out: string): Record<string, string> {
  return Object.fromEntries([...out.matchAll(/^ {4}"(SERVICE_SPARE_[A-Z_]+)": "([^"]+)",$/gm)].map((m) => [m[1]!, m[2]!]));
}

describe("making the spare service key (service/scripts/spare-key.mjs)", () => {
  it("writes the private half where it's told, readable only by you, and prints the public half and the variables", () => {
    const path = join(scratch(), "spare.pem");
    const r = make(path);
    expect(r.status, r.stderr).toBe(0);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const key = createPrivateKey(readFileSync(path, "utf8"));
    expect(key.asymmetricKeyType).toBe("ed25519");
    const vars = varsOf(r.stdout);
    // The key after the one the service signs with (relay-1, wrangler.jsonc).
    expect(vars).toEqual({ SERVICE_SPARE_KEY_ID: "relay-2", SERVICE_SPARE_PUBLIC_KEY: opensshPublicKey(key), SERVICE_SPARE_KEY_VALID_AFTER: expect.stringMatching(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/) });
    expect(r.stdout).toContain(`  ${opensshPublicKey(key)}\n`);
    expect(r.stdout).toContain(`KEEP THE PRIVATE KEY OFFLINE. ${path} is the spare's private key`);
    expect(r.stdout).toContain("Never commit it, paste it, upload it or set it as a secret until the day it's used.");
    // Nothing of the private key is printed.
    expect(r.stdout).not.toContain("PRIVATE KEY-----");
  });

  it("makes a key the service publishes, and a file signed with it checks against CI's pin of it", () => {
    const path = join(scratch(), "spare.pem");
    const r = make(path, "--id", "relay-9");
    expect(r.status, r.stderr).toBe(0);
    const vars = varsOf(r.stdout);
    expect(vars.SERVICE_SPARE_KEY_ID).toBe("relay-9");
    const env = { SERVICE_KEY_ID: "relay-1", SERVICE_ORIGIN: "https://baesian.dev", SERVICE_RP_ID: "baesian.dev", SERVICE_KEY_VALID_AFTER: "2026-11-01T00:00:00.000Z", ...vars };
    const spare = spareKey(env);
    if (!spare || "problem" in spare) throw new Error(spare?.problem ?? "no spare");
    expect(spare.key).toMatchObject({ type: "service-key", key: "relay-9", origin: "https://baesian.dev", rp_id: "baesian.dev", valid_after: vars.SERVICE_SPARE_KEY_VALID_AFTER });
    // CI's pin holds its line; the day the service signs with the private half, what it signs checks.
    const pin = parseTrust(JSON.stringify(spare.key), "the pin");
    const bytes = Buffer.from('{"type":"verdict"}\n');
    const sig = signMessage(createPrivateKey(readFileSync(path, "utf8")), bytes, NAMESPACE);
    expect(checkSigned(pin, bytes, sig, new Date(Date.now() + 1000).toISOString(), "verdicts/x.json")).toEqual({ key: spare.key });
    // And not before the moment it was made.
    expect(checkSigned(pin, bytes, sig, "2026-01-01T00:00:00.000Z", "verdicts/x.json")).toEqual({ problem: "it was signed before key relay-9 was valid" });
  });

  it("refuses a path in a git repository, one that's there already, and no path at all", () => {
    const { dir } = repo();
    const inside = make(join(dir, "spare.pem"));
    expect(inside.status).toBe(1);
    expect(inside.stderr).toContain("is inside a git repository, where it could be committed");
    expect(existsSync(join(dir, "spare.pem"))).toBe(false);
    const there = join(scratch(), "spare.pem");
    writeFileSync(there, "something else\n");
    const again = make(there);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("is there already: this never overwrites a key");
    expect(readFileSync(there, "utf8")).toBe("something else\n");
    expect(make().stderr).toContain("give one path to write the private key to, outside this repo");
  });
});

describe("the spare key the service's variables name (B-x47ek)", () => {
  const base = { SERVICE_KEY_ID: "relay-1", SERVICE_ORIGIN: "https://baesian.dev", SERVICE_RP_ID: "baesian.dev", SERVICE_KEY_VALID_AFTER: "2026-11-01T00:00:00.000Z" };
  it("is none when none is named, and why not when it's named wrong", () => {
    expect(spareKey(base)).toBeUndefined();
    expect(spareKey({ ...base, SERVICE_SPARE_KEY_ID: "relay-2" })).toEqual({ problem: expect.stringContaining("takes all three") });
    const pub = opensshPublicKey(generateKeyPairSync("ed25519").privateKey);
    const all = { ...base, SERVICE_SPARE_KEY_ID: "relay-2", SERVICE_SPARE_PUBLIC_KEY: pub, SERVICE_SPARE_KEY_VALID_AFTER: "2026-11-10T00:00:00.000Z" };
    expect(spareKey(all)).toEqual({ key: expect.objectContaining({ key: "relay-2", public_key: pub }) });
    expect(spareKey({ ...all, SERVICE_SPARE_KEY_ID: "relay-1" })).toEqual({ problem: expect.stringContaining("is the key in use's") });
    expect(spareKey({ ...all, SERVICE_SPARE_PUBLIC_KEY: "ssh-rsa AAAAB3Nza" })).toEqual({ problem: expect.stringContaining("isn't a service key") });
    expect(spareKey({ ...all, SERVICE_SPARE_KEY_VALID_AFTER: "soon" })).toEqual({ problem: expect.stringContaining("isn't a service key") });
  });
});
