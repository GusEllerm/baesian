import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import type { MemoryStorage } from "../../src/storage.js";
import { Store } from "../../src/store.js";
import { checkSigned, parseTrust, pinProblems } from "../../src/trust.js";
import { FIRST_STABLE, RELEASE_HEADER, TOO_OLD, VERSION } from "../../src/version.js";
import { REVIEWER } from "../../test/helpers.js";
import { ORIGIN, RP_ID, TestService } from "../../test/service.js";
import { type Env, handleRequest } from "../src/index.js";
import { tooOld } from "../src/release.js";
import { Relay } from "../src/relay.js";
import { RetentionLedger } from "../src/retention.js";
import { ServiceSigner } from "../src/signer.js";
import { SqlFileStorage } from "../src/sql-storage.js";
import { BASE, call, fileCard, headersFor, machineStore, pulled } from "./client.js";

// Release v1 steps 4 and 6. B-4p43b: a machine names its Baesian's release on every request, and the relay refuses one
// too old to read what it holds, before anything is pulled, naming the release to install. B-x47ek: the service publishes
// a spare key beside its own, never signing with it, and once it switches to it, what it signed before still counts.

const status = async (r: Response): Promise<{ status: number; error?: string } & Record<string, unknown>> => ({ status: r.status, ...((await r.json()) as Record<string, unknown>) });

describe("the CLI's release, on every request a machine makes (B-4p43b)", () => {
  it("is served when it's this release, and refused before any pull when it's older, or not named", async () => {
    expect((await call("GET", "log?after=0", { as: "machine" })).status).toBe(200);
    for (const sent of [undefined, "0.0.1", "not-a-release"]) {
      const headers = { ...headersFor("machine") } as Record<string, string>;
      delete headers[RELEASE_HEADER];
      if (sent !== undefined) headers[RELEASE_HEADER] = sent;
      const r = await exports.default.fetch(new Request(`${BASE}/v1/projects/proj-a/log?after=0`, { headers }));
      const s = await status(r);
      expect(s.status, String(sent)).toBe(TOO_OLD);
      expect(s).toMatchObject({ minimum: VERSION, release: VERSION });
      expect(s.error).toContain(`install baesian ${VERSION} (npm install -g baesian@${VERSION}), then run the command again. Nothing was sent or received.`);
    }
    // An upload, and the live socket, the same.
    const put = await call("PUT", "files/decks/x.md", { as: "machine", headers: { [RELEASE_HEADER]: "0.0.1" }, body: "x" });
    expect(put.status).toBe(TOO_OLD);
    const live = await exports.default.fetch(new Request(`${BASE}/v1/projects/proj-a/live`, { headers: { ...headersFor("machine"), [RELEASE_HEADER]: "0.0.1", upgrade: "websocket" } }));
    expect(live.status).toBe(TOO_OLD);
    await live.body?.cancel();
  });

  it("isn't asked of a person's browser: the website is the service's own release", async () => {
    const r = await call("GET", "state", { as: "person", headers: { [RELEASE_HEADER]: "0.0.1" } });
    expect(r.status).toBe(200);
    await r.body?.cancel();
  });

  it("is refused below the oldest release that reads what this one writes, and never below 1.0.0 once released", async () => {
    expect(tooOld(VERSION)).toBeUndefined();
    // 1.0.0 serves 1.0.0 and later; nothing before it, and nothing that names no release.
    expect(tooOld("1.0.0", "1.0.0")).toBeUndefined();
    expect(tooOld("1.3.0", "1.0.0")).toBeUndefined();
    for (const sent of [null, "0.1.10", "1.0.0-rc.1"]) {
      const r = tooOld(sent, "1.0.0")!;
      expect(r.status, String(sent)).toBe(TOO_OLD);
      expect(await r.json()).toMatchObject({ minimum: FIRST_STABLE, release: "1.0.0" });
    }
    const none = (await tooOld(null, "1.2.0")!.json()) as { error: string };
    expect(none.error).toBe(
      "this Baesian sends no version, so it's from before 1.0.0, and is too old for this service, which runs Baesian 1.2.0 and serves 1.0.0 or later: install baesian 1.2.0 (npm install -g baesian@1.2.0), then run the command again. Nothing was sent or received.",
    );
  });
});

// ---------------------------------------------------------------- the spare key (B-x47ek)

const current = new TestService("relay-1", {}, "proj-a");
const spare = new TestService("relay-2", { after: "2026-01-02T00:00:00.000Z" }, "proj-a");
const pem = (s: TestService) => s.privateKey.export({ format: "pem", type: "pkcs8" }) as string;
const KEY_ENV = { SERVICE_ORIGIN: ORIGIN, SERVICE_RP_ID: RP_ID };
/** The service's variables while the spare waits: it signs with relay-1, and publishes relay-2. */
const waiting = {
  ...KEY_ENV,
  SERVICE_SIGNING_KEY: pem(current),
  SERVICE_KEY_ID: "relay-1",
  SERVICE_KEY_VALID_AFTER: "2026-01-01T00:00:00.000Z",
  SERVICE_SPARE_KEY_ID: "relay-2",
  SERVICE_SPARE_PUBLIC_KEY: spare.publicKey,
  SERVICE_SPARE_KEY_VALID_AFTER: "2026-01-02T00:00:00.000Z",
};
/** And once it has switched: it signs with relay-2, as the script's last paragraph says to set it. */
const switched = { ...KEY_ENV, SERVICE_SIGNING_KEY: pem(spare), SERVICE_KEY_ID: "relay-2", SERVICE_KEY_VALID_AFTER: "2026-01-02T00:00:00.000Z" };

describe("the service's spare key (B-x47ek)", () => {
  it("is published beside its key at GET /v1/keys, for anyone, as the key file it writes the day it switches", async () => {
    const keys = async (vars: Record<string, string>) => status(await handleRequest(new Request(`${BASE}/v1/keys`), { ...env, ...vars } as unknown as Env));
    expect(await keys(waiting)).toEqual({ status: 200, service: [current.serviceKey()], spare: [spare.serviceKey()] });
    expect(await keys(switched)).toEqual({ status: 200, service: [spare.serviceKey()], spare: [] });
    // One that can't be read is left out, and says why; the key in use is still published.
    const bad = await keys({ ...waiting, SERVICE_SPARE_PUBLIC_KEY: "ssh-rsa AAAA" });
    expect(bad).toMatchObject({ status: 200, service: [current.serviceKey()], spare: [], problem: expect.stringContaining("the spare key isn't a service key") });
    // The test environment has no spare.
    expect(await status(await exports.default.fetch(new Request(`${BASE}/v1/keys`)))).toMatchObject({ status: 200, spare: [] });
    expect((await exports.default.fetch(new Request(`${BASE}/v1/keys`, { method: "POST" }))).status).toBe(405);
  });

  it("is never signed with until the switch; after it, answers signed with either key count, on the relay and in CI pinned with both", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      const relayWith = (vars: typeof waiting | typeof switched) => {
        const signer = ServiceSigner.fromEnv(vars);
        return new Relay(new SqlFileStorage(state.storage, { sign: signer.sign }), signer, undefined, "proj-a", ORIGIN, new Date().toISOString(), new RetentionLedger(state.storage.sql));
      };
      const who = { account: "acct-gus", handle: REVIEWER.reviewer };
      const files = new SqlFileStorage(state.storage);
      // A machine files cards and uploads them, as the CLI does.
      const machine = machineStore();
      const sent = new Set<string>();
      const upload = (relay: Relay) => {
        const mem = machine.storage as MemoryStorage;
        const order = (p: string) => (p.startsWith("decks/") ? 0 : /\/r\d+\.md$/.test(p) ? 1 : 2);
        for (const p of mem.paths().filter((p) => /^(decks|cards)\//.test(p) && !sent.has(p)).sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
          expect(relay.upload(p, mem.read(p)!, "laptop").status, p).toBe(201);
          sent.add(p);
        }
      };
      // Before: the relay signs with relay-1 only.
      const before = relayWith(waiting);
      const first = fileCard(machine);
      upload(before);
      expect(before.verdict({ card: first, revision: 1, response: "accept" }, who).status).toBe(201);
      expect(files.list("trust")).toEqual(["service-relay-1.json"]);
      // After: relay-2 signs, and its key file joins the project's; what relay-1 signed still counts on the relay.
      const after = relayWith(switched);
      const second = fileCard(machine);
      upload(after);
      expect(after.verdict({ card: second, revision: 1, response: "accept" }, who).status).toBe(201);
      expect(files.list("trust").sort()).toEqual(["service-relay-1.json", "service-relay-2.json"]);
      const relayStore = after.store();
      expect([relayStore.status(first), relayStore.status(second)]).toEqual(["resolved", "resolved"]);
      // A machine's copy, checked as CI checks it: pinned with both keys, both answers count and no key is unpinned.
      const copy = Store.over(pulled(files.after(0, 1000)), { branch: "main", config: { service: ORIGIN, project: "proj-a" } });
      const pin = parseTrust([JSON.stringify(current.serviceKey()), JSON.stringify(spare.serviceKey())].join("\n"), "the pin");
      const keyFiles = copy.trustFiles().service;
      expect(pinProblems(pin, keyFiles)).toEqual([]);
      for (const v of copy.storage.list("verdicts").filter((f) => f.endsWith(".json"))) {
        const rel = `verdicts/${v}`;
        const at = (JSON.parse(Buffer.from(copy.storage.read(rel)!).toString("utf8")) as { at: string }).at;
        expect(checkSigned(pin, Buffer.from(copy.storage.read(rel)!), Buffer.from(copy.storage.read(`${rel}.sig`)!).toString("utf8"), at, rel)).toHaveProperty("key");
      }
      // Pinned with relay-1 alone, as before the spare, the switch fails CI: relay-2's key file isn't pinned (D142).
      expect(pinProblems(parseTrust(JSON.stringify(current.serviceKey()), "the old pin"), keyFiles)).toEqual([expect.stringContaining("trust/service-relay-2.json isn't pinned in CI")]);
    }));

});
