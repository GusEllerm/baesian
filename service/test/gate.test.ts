import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../src/storage.js";
import { Store } from "../../src/store.js";
import { drawOfProof } from "../../src/trust.js";
import { BODY, REVIEWER, draft } from "../../test/helpers.js";
import { ORIGIN, RP_ID, TestService } from "../../test/service.js";
import { ServiceSigner } from "../src/signer.js";
import { SqlFileStorage } from "../src/sql-storage.js";

// What the relay writes is what test/service.ts's stand-in writes, the one the CLI's checks were built against (M9a):
// with the stand-in's own key, the relay's gate records (D158) and signatures (D160) are the same bytes.

const service = new TestService("relay-1", {}, "proj-a");
const signer = ServiceSigner.fromEnv({
  SERVICE_SIGNING_KEY: service.privateKey.export({ format: "pem", type: "pkcs8" }) as string,
  SERVICE_KEY_ID: "relay-1",
  SERVICE_ORIGIN: ORIGIN,
  SERVICE_RP_ID: RP_ID,
  SERVICE_KEY_VALID_AFTER: "2026-01-01T00:00:00.000Z",
});
const text = (b: Uint8Array) => Buffer.from(b).toString("utf8");
const withAt = (json: string, at: string) => JSON.stringify({ ...JSON.parse(json), at }, null, 2);

/** A copy of a layer, in memory, leaving out what `skip` names. */
function copy(from: SqlFileStorage, skip: (path: string) => boolean = () => false): MemoryStorage {
  const mem = new MemoryStorage();
  for (const f of from.files()) if (!skip(f.path)) mem.create(f.path, f.bytes);
  return mem;
}

describe("the relay writes what the stand-in writes", () => {
  it("has the stand-in's service key file", () => {
    expect(signer.serviceKey()).toEqual(service.serviceKey());
    expect(signer.publicKey).toBe(service.publicKey);
  });

  it("gates a revision as the stand-in does, byte for byte: shown, and held with its draw_proof (D158)", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      const files = new SqlFileStorage(state.storage, { sign: signer.sign });
      // Not hosted, so an enforcing preference file counts without a passkey, and a card can be held.
      const store = Store.over(files, { branch: "main", config: { service: ORIGIN, project: "proj-a" } });
      store.writePreferences({ mode: "enforce", row_dependency: "sample", rate_sample: 0.5 }, { by: "gus", client: "test" });
      const held = store.fileCard(draft({ touches: ["dependency"] }), BODY, { agent: "claude-code" }).card.meta.id;
      const shown = store.fileCard(draft({ title: "Another one", topic: "schema/x", touches: ["schema"] }), BODY, { agent: "claude-code", force: true }).card.meta.id;
      for (const [id, outcome] of [[held, "held"], [shown, "shown"]] as const) {
        const relay = store.relayGate(id, 1, signer.draw(id, 1, files.read(`cards/${id}/r1.md`)!), "proj-a");
        expect(relay.outcome).toBe(outcome);
        const path = `cards/${id}/gate-r1-relay.json`;
        const theirs = Store.over(copy(files, (p) => p.startsWith(path)), { branch: "main", config: { service: ORIGIN, project: "proj-a" } });
        const { rel, record } = service.gate(theirs, id, { heldBefore: 0 });
        expect(rel).toBe(path);
        const ours = text(files.read(path)!);
        expect(withAt(ours, record.at)).toBe(withAt(text(theirs.storage.read(rel)!), record.at));
        // The signature is the stand-in's for the same bytes: Ed25519 is deterministic.
        expect(text(files.read(`${path}.sig`)!)).toBe(service.signature(Buffer.from(ours)));
        if (outcome === "held") {
          expect(relay.draw_proof).toBe(record.draw_proof);
          // And the CLI's check of the draw gives the relay's draw (D158).
          expect(drawOfProof(service.pinned(), relay.draw_proof!, id, 1, Buffer.from(files.read(`cards/${id}/r1.md`)!), relay.at)).toEqual({ draw: relay.draw });
        }
      }
    }));

  it("signs what a person writes with the stand-in's signature over the same bytes, and nothing an agent writes", () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => {
      const files = new SqlFileStorage(state.storage, { sign: signer.sign });
      const store = Store.over(files, { branch: "main", config: { service: ORIGIN, project: "proj-a" } });
      const id = store.fileCard(draft(), BODY, { agent: "claude-code" }).card.meta.id;
      store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER, account: "acct-gus", project: "proj-a" });
      const verdict = files.list("verdicts").find((f) => f.endsWith(".json"))!;
      const bytes = files.read(`verdicts/${verdict}`)!;
      expect(text(files.read(`verdicts/${verdict}.sig`)!)).toBe(service.signature(Buffer.from(bytes)));
      expect(files.list(`cards/${id}`).filter((f) => f.endsWith(".sig"))).toEqual([]);
      expect(files.list("decks").filter((f) => f.endsWith(".sig"))).toEqual([]);
    }));
});
