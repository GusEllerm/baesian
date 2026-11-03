import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../src/storage.js";
import { DRAW_NAMESPACE, parseSignature, signMessage } from "../src/sshsig.js";
import { Store, signedFile } from "../src/store.js";
import { drawMessage, drawOfProof } from "../src/trust.js";
import { BODY, REVIEWER, draft, memory } from "./helpers.js";
import { ORIGIN, TestService } from "./service.js";

// What the store does for the relay (M9b), over memory: the relay's gate record as the stand-in writes it (D158), and
// the project on everything an answer writes (B-tf9fc). The relay itself is tested in workerd (service/test/).

const AGENT = { agent: "claude-code" };
const CONFIG = { service: ORIGIN, project: "proj-test" };
const service = new TestService();

/** The draw the service takes for a revision (D158), as the relay takes it. */
function drawFor(store: Store, id: string, revision: number) {
  const draw_proof = signMessage(service.privateKey, drawMessage(id, revision, store.bytes(`cards/${id}/r${revision}.md`)), DRAW_NAMESPACE, { bare: true });
  return { draw_proof, draw: createHash("sha256").update(parseSignature(draw_proof).signature).digest().readUIntBE(0, 6) / 2 ** 48 };
}

/** A copy of a store's layer, without what `skip` names. */
function copyOf(store: Store, skip: (p: string) => boolean): Store {
  const from = store.storage as MemoryStorage;
  const to = new MemoryStorage();
  for (const p of from.paths()) if (!skip(p)) to.create(p, from.read(p)!);
  return Store.over(to, { branch: "main", config: CONFIG });
}

describe("the relay's gate record, through the store (D158)", () => {
  it("is the stand-in's, byte for byte but for its time: held, with its draw_proof, and shown", () => {
    const { store } = memory({ config: CONFIG });
    store.writePreferences({ mode: "enforce", row_dependency: "sample", rate_sample: 0.5 }, { by: "gus", client: "test" });
    const held = store.fileCard(draft({ touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    const shown = store.fileCard(draft({ title: "Another", topic: "schema/x", touches: ["schema"] }), BODY, { ...AGENT, force: true }).card.meta.id;
    for (const [id, outcome] of [[held, "held"], [shown, "shown"]] as const) {
      const rel = `cards/${id}/gate-r1-relay.json`;
      const theirs = copyOf(store, (p) => p.startsWith(rel));
      const ours = store.relayGate(id, 1, drawFor(store, id, 1), "proj-test");
      expect(ours.outcome).toBe(outcome);
      const { record } = service.gate(theirs, id, { heldBefore: 0 });
      const at = (b: Buffer) => JSON.stringify({ ...JSON.parse(b.toString()), at: "-" });
      expect(at(store.bytes(rel))).toBe(at(theirs.bytes(rel)));
      if (outcome === "held") expect(drawOfProof(service.pinned(), ours.draw_proof!, id, 1, store.bytes(`cards/${id}/r1.md`), ours.at)).toEqual({ draw: ours.draw });
      expect(() => store.relayGate(id, 1, drawFor(store, id, 1), "proj-test")).toThrow(/already written/);
    }
  });

  it("works out from the files what each revision is to the gate, as filing it did", () => {
    const { store } = memory({ config: CONFIG });
    const source = (id: string, n: number) => store.relayGate(id, n, drawFor(store, id, n), "proj-test").source;
    const a = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    expect(source(a, 1)).toBe("agent");
    // A revision after the reviewer's own answer is shown, as the CLI's gate shows it.
    store.addVerdict({ card: a, revision: 1, response: "reject", comment: "No.", ...REVIEWER });
    store.reviseCard(a, draft({ proposal: "DuckDB" }), BODY, AGENT);
    const second = source(a, 2);
    expect(second).toBe(store.gateRecordBy(a, 2, "cli")!.source);
    expect(second).toBe("answer");
    // The agent's one reply, and a rule draft, are as the CLI gated them.
    const b = store.fileCard(draft({ title: "Third", topic: "c/x" }), BODY, { ...AGENT, force: true }).card.meta.id;
    store.addVerdict({ card: b, revision: 1, response: "alternative", choice: "Postgres", make_rule: true, ...REVIEWER });
    store.replyToCard(b, "Postgres isn't on the cluster.", AGENT);
    expect(source(b, 2)).toBe("answer");
    const c = store.fileCard(draft({ title: "Fourth", topic: "d/x" }), BODY, { ...AGENT, force: true }).card.meta.id;
    store.addVerdict({ card: c, revision: 1, response: "accept", make_rule: true, ...REVIEWER });
    const rule = store.draftRule(c, "Use SQLite for metadata.", [], AGENT).meta.id;
    expect(source(rule, 1)).toBe("baesian");
  });
});

describe("an answer names its project in everything it writes (B-tf9fc)", () => {
  it("in the rule an accepted draft saves, a topic merge and a preference change", () => {
    const { store } = memory({ config: CONFIG });
    const who = { account: "acct-gus", project: "proj-test" };
    const a = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: a, revision: 1, response: "accept", make_rule: true, ...REVIEWER, ...who });
    const d = store.draftRule(a, "Use SQLite for metadata.", ["dep:sqlite*"], AGENT).meta.id;
    store.addVerdict({ card: d, revision: 1, response: "accept", ...REVIEWER, ...who });
    expect(store.rules()[0]!.meta).toMatchObject(who);
    store.fileCard(draft({ title: "Other", topic: "other/x" }), BODY, { ...AGENT, force: true });
    expect(store.mergeTopics("other/x", "storage/run-metadata", "gus", who)).toMatchObject(who);
    expect(store.writePreferences({ row_schema: "stop-and-ask" }, { by: "gus", client: "hosted-desktop", ...who }).file).toMatchObject(who);
    // Without one, as on your machine, nothing is added.
    store.fileCard(draft({ title: "Third", topic: "third/x" }), BODY, { ...AGENT, force: true });
    expect(store.mergeTopics("third/x", "storage/run-metadata", "gus")).not.toHaveProperty("project");
  });

  it("knows which files the service signs", () => {
    for (const p of ["verdicts/20261103T000000.000Z-B-aaaaa-r1-abcde.json", "rules/R-abcde.md", "rules/R-abcde-retired.json", "topics/alias-abcde.json", "preferences/20261103T000000.000Z-abcde.json", "cards/B-aaaaa/gate-r1-relay.json", "trust/passkey-abcde.json"]) {
      expect(signedFile(p), p).toBe(true);
    }
    for (const p of ["verdicts/20261103T000000.000Z-B-aaaaa-r1-abcde.passkey.json", "cards/B-aaaaa/r1.md", "cards/B-aaaaa/gate-r1-cli.json", "decks/x.md", "trust/service-x.json", "presence.json", "waiting/B-aaaaa-x.json", "rules/R-abcde.md.sig"]) {
      expect(signedFile(p), p).toBe(false);
    }
  });
});
