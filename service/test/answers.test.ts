import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ApiState } from "../../src/api.js";
import { snapshot } from "../../src/state.js";
import { MemoryStorage } from "../../src/storage.js";
import { Store } from "../../src/store.js";
import { RELAY_BRANCH } from "../src/relay.js";
import { ORIGIN, answer, call, fileCard, machineStore, pinFrom, pullLog, pulled, push, relayFiles, state } from "./client.js";

// Answers given on the website (P15 section 4): written through the store, signed with the service's key, naming the
// account, the project and the card's digest, so that the CLI's own checks pass on a machine that pulls them (M9a's
// `Store.judge`, with the service's key pinned as CI pins it). And the state, as `baesian serve` gives it.

type Body = Record<string, unknown> & { error?: string };
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Body });

/** A machine pulls everything, and reads it as the CLI does in a hosted repo: with the service's key pinned. */
async function machineView(project = "proj-a"): Promise<Store> {
  const entries = await pullLog(project);
  return machineStore(pulled(entries), project, pinFrom(entries));
}

describe("answers, signed so the CLI's own checks pass (D138, D160)", () => {
  it("signs a verdict that names its account, project and card digest, and a machine that pulls it counts it", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    await push(laptop);
    const r = await json(await answer({ card: id, revision: 1, response: "accept", first_choice: "proposal" }));
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("resolved");
    const cardBytes = laptop.storage.read(`cards/${id}/r1.md`)!;
    expect(r.body.verdict).toMatchObject({ card: id, revision: 1, reviewer: "gus", account: "acct-gus", project: "proj-a", client: "hosted-desktop", card_digest: createHash("sha256").update(cardBytes).digest("hex") });

    const mine = await machineView();
    expect(mine.hosted()).toMatchObject({ pinned: true, project: "proj-a" });
    const file = mine.storage.list("verdicts").find((f) => f.includes(id) && f.endsWith(".json"))!;
    expect(mine.storage.read(`verdicts/${file}.sig`)).toBeDefined();
    expect(mine.judge(`verdicts/${file}`)).toEqual({ ok: true });
    expect(mine.verdicts(id)).toHaveLength(1);
    expect(mine.status(id)).toBe("resolved");
    expect(mine.uncounted()).toEqual([]);
    // The relay's gate record counts there too, and its draw checks.
    const gate = mine.gateRecord(id)!;
    expect(gate).toMatchObject({ by: "relay", project: "proj-a", outcome: "shown" });

    // A byte changed, and it no longer counts: the signature covers the bytes.
    const tampered = new MemoryStorage();
    for (const p of (mine.storage as MemoryStorage).paths()) {
      const b = mine.storage.read(p)!;
      tampered.create(p, p === `verdicts/${file}` ? Buffer.from(Buffer.from(b).toString().replace('"accept"', '"reject"')) : b);
    }
    const theirs = machineStore(tampered, "proj-a", mine.hosted()!.root);
    expect(theirs.judge(`verdicts/${file}`)).toMatchObject({ ok: false, why: expect.stringMatching(/doesn't match its bytes/) });
    expect(theirs.status(id)).toBe("open");
  });

  it("counts nothing in another project: the files name theirs (B-tf9fc)", async () => {
    const mine = await machineView();
    const elsewhere = machineStore(pulled(await pullLog()), "proj-b", mine.hosted()!.root);
    const v = elsewhere.storage.list("verdicts").find((f) => f.endsWith(".json"))!;
    expect(elsewhere.judge(`verdicts/${v}`)).toMatchObject({ ok: false, why: expect.stringMatching(/project proj-a, not this repo's \(proj-b\)/) });
  });

  it("refuses an answer on a stale revision, or on no card", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    await push(laptop);
    expect((await json(await answer({ card: id, revision: 2, response: "accept" }))).status).toBe(409);
    expect((await json(await answer({ card: "B-zzzzz", revision: 1, response: "accept" }))).status).toBe(404);
    expect((await json(await answer({ card: id, revision: 1, response: "alternative" }))).body.error).toMatch(/needs a choice/);
    expect((await json(await answer({ card: id, revision: 1, response: "accept", reviewer: "someone else" }))).body.error).toMatch(/unexpected fields: reviewer/);
    expect((await json(await answer({ card: id, revision: 1, response: "accept", client: "cli" }))).status).toBe(400);
  });

  it("composes an answer on a hard card and waits for the passkey (D139): nothing is written until it signs (proofs.test.ts)", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop, { touches: ["security"], wrong_if: "a token leaks", check: "the audit log" });
    expect(laptop.card(id)!.meta.level).toBe("hard");
    await push(laptop);
    const head = (await pullLog()).at(-1)!.seq;
    for (const response of ["accept", "defer"]) {
      const r = await json(await answer({ card: id, revision: 1, response, ...(response === "defer" ? { comment: "later" } : {}) }));
      expect(r.status).toBe(202);
      expect(r.body.passkey).toMatchObject({ proving: "verdict", step: 1, of: 1, challenge: expect.any(String) });
    }
    expect((await pullLog()).at(-1)!.seq).toBe(head);
  });

  it("merges topics, signed, and the merge counts on a machine", async () => {
    const laptop = machineStore();
    const a = fileCard(laptop, { topic: "storage/runs" });
    fileCard(laptop, { topic: "storage/run-metadata" });
    await push(laptop);
    const r = await json(await call("POST", "aliases", { as: "person", json: { from: "storage/runs", to: "storage/run-metadata" } }));
    expect(r.status).toBe(201);
    expect(r.body.alias).toMatchObject({ from: "storage/runs", to: "storage/run-metadata", by: "gus", account: "acct-gus", project: "proj-a" });
    const mine = await machineView();
    expect(mine.aliases()).toHaveLength(1);
    expect(mine.canonicalTopic(mine.card(a)!.meta.topic!)).toBe("storage/run-metadata");
    expect((await json(await call("POST", "aliases", { as: "person", json: { from: "storage/runs", to: "storage/run-metadata" } }))).status).toBe(400);
  });

  it("takes a preference change that tightens, signed, and composes one that loosens, which waits for the passkey (D163)", async () => {
    const s0 = await state();
    const replaces = s0.routing.preferences?.name;
    const tighter = await json(await call("POST", "preferences", { as: "person", json: { ...(replaces ? { replaces } : {}), row_dependency: "stop-and-ask" } }));
    expect(tighter.status).toBe(201);
    expect((tighter.body.file as Record<string, unknown>).project).toBe("proj-a");
    const mine = await machineView();
    expect(mine.inForce().name).toBe(tighter.body.name);
    expect(mine.inForce().settings.rows.dependency).toBe("stop-and-ask");
    for (const change of [{ mode: "enforce" }, { row_dependency: "sample" }, { burn_in: 0 }]) {
      const looser = await json(await call("POST", "preferences", { as: "person", json: { replaces: tighter.body.name, ...change } }));
      expect(looser.status, JSON.stringify(change)).toBe(202);
      expect(looser.body.passkey).toMatchObject({ proving: "preferences" });
    }
    expect((await json(await call("POST", "preferences", { as: "person", json: { row_dependency: "never-without-me" } }))).status).toBe(409);
    expect((await state()).routing.preferences?.name).toBe(tighter.body.name);
  });

  it("saves the rule an accepted draft asks for, signed, naming the project (D110)", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    await push(laptop);
    expect((await answer({ card: id, revision: 1, response: "accept", make_rule: true })).status).toBe(201);
    // The agent hears the answer, and drafts the rule on its machine; the draft goes up as any card does.
    const mine = await machineView();
    expect(mine.ruleAsked(id)).toBe(true);
    const draftCard = mine.draftRule(id, "Small dev dependencies need no card.", ["dep:vitest-*"], { agent: "claude-code" });
    await push(mine);
    const r = await json(await answer({ card: draftCard.meta.id, revision: 1, response: "accept" }));
    expect(r.status).toBe(201);
    const after = await machineView();
    const rule = after.rules().find((x) => x.meta.from_card === id)!;
    expect(rule.meta).toMatchObject({ covers: ["dep:vitest-*"], accepted_by: "gus", account: "acct-gus", project: "proj-a" });
    expect(after.judge(`rules/${rule.meta.id}.md`)).toEqual({ ok: true });
  });

  it("keeps the reviewer's presence as state, never signed or logged", async () => {
    const head = (await pullLog()).at(-1)!.seq;
    expect((await call("POST", "presence", { as: "person", json: { client: "hosted-phone" } })).status).toBe(204);
    const s = await state();
    expect(s.presence).toMatchObject({ client: "hosted-phone" });
    expect((await pullLog()).at(-1)!.seq).toBe(head);
  });
});

describe("the state, as baesian serve gives it (B-17wn9)", () => {
  it("is the snapshot a store over the same files builds", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    fileCard(laptop, { depends_on: [id] });
    await push(laptop);
    await answer({ card: id, revision: 1, response: "alternative", choice: "Postgres after all" });
    await call("POST", "presence", { as: "person", json: {} });
    const relay = await state();
    expect(relay.server).not.toHaveProperty("pid");
    expect(relay.server.watch).toBe("events");
    expect(relay.project).toEqual({ name: "proj-a", branch: RELAY_BRANCH });
    expect(relay.problems).toEqual([]);

    // The same files, in memory, under a store as the relay's: the same state, field for field.
    const files = await relayFiles();
    const mine = Store.over(files, { branch: RELAY_BRANCH, config: { service: ORIGIN, project: "proj-a" }, trust: { pinned: pinFrom(await pullLog()) } });
    const local = snapshot(mine, { version: relay.version, server: { started: relay.server.started, watch: "events" }, project: relay.project, now: Date.parse(relay.server.now) });
    expect(JSON.parse(JSON.stringify(local))).toEqual(relay);

    // And a machine that pulled the log sees each card as the website does: status, verdicts, briefs and gate.
    const pulledView = await machineView();
    const pulledState = snapshot(pulledView, { version: 1, server: { started: relay.server.started, watch: "poll" }, project: { name: "x", branch: "main" }, now: Date.parse(relay.server.now) });
    const strip = (s: ApiState) => s.cards.map((c) => ({ id: c.meta.id, status: c.status, verdicts: c.verdicts, briefs: c.briefs, gate: c.gate, dependents: c.dependents })).sort((a, b) => a.id.localeCompare(b.id));
    expect(JSON.parse(JSON.stringify(strip(pulledState)))).toEqual(strip(relay));
    const dependent = relay.cards.find((c) => c.meta.depends_on.includes(id))!;
    expect(dependent.status).toBe("returned");
  });

  it("gives the presets, as /api/presets does", async () => {
    const r = await call("GET", "presets", { as: "machine" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { presets: { id: string }[] };
    expect(body.presets.map((p) => p.id)).toEqual(["today", "fewer-interruptions", "hands-off"]);
  });
});

describe("the relay's gate record on what it accepts (D158)", () => {
  it("gates each card revision it accepts, signed, with the draw from its own signature over the card", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop, { touches: ["dependency"] });
    await push(laptop);
    const mine = await machineView();
    const relay = mine.gateRecordBy(id, 1, "relay")!;
    expect(relay).toMatchObject({ type: "gate", card: id, revision: 1, by: "relay", source: "agent", project: "proj-a", outcome: "shown", row: "dependency" });
    expect(mine.judge(`cards/${id}/gate-r1-relay.json`)).toEqual({ ok: true });
    expect(mine.gateRecord(id)).toEqual(relay);
    // Shown, so no draw_proof is kept (as the stand-in writes it); the draw it would have had is still the service's.
    expect(relay.draw_proof).toBeUndefined();
  });

  it("gates the cards Baesian files after an answer, as the local server files them (D161)", async () => {
    const laptop = machineStore();
    const a = fileCard(laptop, { topic: "testing/runner", proposal: "Vitest", alternative: "Jest" });
    const b = fileCard(laptop, { topic: "testing/runner-ci", proposal: "Vitest", alternative: "Jest" });
    await push(laptop);
    await answer({ card: a, revision: 1, response: "accept" });
    const r = await json(await answer({ card: b, revision: 1, response: "accept", comment: "Always use Vitest for tests." }));
    const filed = (r.body.filed as string[] | undefined) ?? [];
    expect(filed.length).toBeGreaterThan(0);
    const mine = await machineView();
    for (const f of filed) {
      expect(mine.card(f)!.meta.source_branch).toBe(RELAY_BRANCH);
      expect(mine.gateRecordBy(f, 1, "relay")).toMatchObject({ source: "baesian", outcome: "shown" });
    }
  });
});
