import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { batchChallenge } from "../../src/passkey.js";
import { loosenAfter } from "../../src/routing.js";
import { type PasskeyProof, type RelayEntry, readRelayEntry } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import { type Store, proofPath } from "../../src/store.js";
import { parseTrust } from "../../src/trust.js";
import { MAX_BATCH, PENDING_MS, keyFileName } from "../src/relay.js";
import { type Person, machineLogin, signUp } from "./browser.js";
import { call, fileCard, machineStore, pulled } from "./client.js";
import { WebPasskey, randomChallenge } from "./passkeys.js";

// Answers that take the reviewer's passkey (D139, D163, M9c): composed by the relay, nothing written, and waiting; asked
// for together, alone or with others waiting (B-a6xpc); signed by the passkey over one file's digest, or over the list
// of every waiting file's digest; checked on the service with SimpleWebAuthn (B-jp22m); then each written with the
// service's signature and the passkey's proof beside it, and the passkey's key file in the project's trust/. A machine
// that pulls them and pins the passkey's line in CI, as D159 has it, counts them with M9a's own checks (`Store.judge`).

let n = 0;
const project = () => `proj-p${Date.now().toString(36)}${n++}`;

afterEach(() => vi.useRealTimers());

/** A person, their project, and a machine signed in to it with a real grant. */
async function setUp(): Promise<{ p: Person; proj: string; machine: { headers: Record<string, string> }; laptop: Store }> {
  const p = await signUp();
  const proj = project();
  const t = await machineLogin(p, proj);
  return { p, proj, machine: { headers: { authorization: `Bearer ${t.access}` } }, laptop: machineStore(new MemoryStorage(), proj) };
}

/** The machine uploads what its store holds that the relay doesn't: decks, then cards. */
async function push(laptop: Store, proj: string, machine: { headers: Record<string, string> }): Promise<void> {
  const mem = laptop.storage as MemoryStorage;
  const paths = mem.paths().filter((x) => /^(decks|cards)\//.test(x) && !x.endsWith(".sig") && !x.endsWith("-relay.json"));
  const order = (x: string) => (x.startsWith("decks/") ? 0 : /\/r\d+\.md$/.test(x) ? 1 : 2);
  for (const x of paths.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const r = await call("PUT", `files/${x}`, { as: machine, project: proj, body: mem.read(x)! });
    expect([200, 201], x).toContain(r.status);
  }
}

async function pull(proj: string, machine: { headers: Record<string, string> }): Promise<RelayEntry[]> {
  const r = await call("GET", "log?after=0", { as: machine, project: proj });
  return ((await r.json()) as { entries: unknown[] }).entries.map(readRelayEntry);
}

/** The machine's view after a pull, as the CLI reads it in CI: the service's key pinned, and the passkeys given. */
function view(entries: RelayEntry[], proj: string, ...pins: string[]): Store {
  const key = entries.find((e) => e.path.startsWith("trust/service-"))!;
  const lines = [Buffer.from(key.body!, "base64").toString("utf8").replace(/\n/g, " "), ...pins].join("\n");
  return machineStore(pulled(entries), proj, parseTrust(lines, "CI's pin"));
}

/** The person's browser on the relay. */
const as = (p: Person) => ({ headers: { cookie: `__Host-baesian-session=${p.browser.session}`, origin: env.SERVICE_ORIGIN } });
const post = async (p: Person, proj: string, path: string, json: unknown) => {
  const r = await call("POST", path, { as: as(p), project: proj, json });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> };
};

/** An answer, composed and waiting for the passkey: its pending ID. */
async function waiting(p: Person, proj: string, answer: Record<string, unknown>): Promise<string> {
  const r = await post(p, proj, "verdicts", { revision: 1, ...answer });
  expect(r.status, JSON.stringify(r.body)).toBe(202);
  return r.body.passkey.pending as string;
}

/** The desk asks for waiting answers together, and one tap of the passkey signs the batch's challenge. */
async function tap(p: Person, proj: string, pending: string[]) {
  const asked = await post(p, proj, "batches", { pending });
  expect(asked.status, JSON.stringify(asked.body)).toBe(202);
  const done = await post(p, proj, "proofs", { batch: asked.body.passkey.batch, response: p.passkey.sign(asked.body.passkey.challenge) });
  return { asked: asked.body.passkey, done };
}

const body = (e: RelayEntry) => Buffer.from(e.body!, "base64").toString();
const answersIn = (entries: RelayEntry[]) => entries.filter((e) => e.path.startsWith("verdicts/") && e.path.endsWith(".json") && !e.path.endsWith(".passkey.json"));

const hard = { touches: ["security"], wrong_if: "a token leaks", check: "the audit log" };

describe("an answer on a hard card, proved by the reviewer's passkey (D139)", () => {
  it("is composed and waits; asked for alone, signed by the passkey over its digest, then written so a pinned machine counts it", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const id = fileCard(laptop, hard);
    expect(laptop.card(id)!.meta.level).toBe("hard");
    await push(laptop, proj, machine);
    const head = (await pull(proj, machine)).length;

    // 1. The answer is composed: nothing is written, and it waits for the passkey, until when the relay says.
    const answered = await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept", first_choice: "proposal" });
    expect(answered.status).toBe(202);
    const { pending, expires } = answered.body.passkey;
    expect(Date.parse(expires) - Date.now()).toBeGreaterThan(PENDING_MS - 60_000);
    expect(await pull(proj, machine)).toHaveLength(head);

    // 2. Asked for alone, its challenge is the verdict's own digest, and the browser gets the passkey's options.
    const asked = await post(p, proj, "batches", { pending: [pending] });
    expect(asked.status).toBe(202);
    const { batch, challenge, options } = asked.body.passkey;
    expect(asked.body.passkey).toMatchObject({ answers: [pending], expired: [], files: 1 });
    expect(options).toMatchObject({ challenge, rpId: env.SERVICE_RP_ID, userVerification: "required", allowCredentials: [{ id: p.passkey.id }] });

    // 3. The passkey signs; 4. the relay checks it and writes the verdict, its .sig and its .passkey.json.
    const done = await post(p, proj, "proofs", { batch, response: p.passkey.sign(challenge) });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.answers).toEqual([{ pending, kind: "verdict", status: 201, body: expect.objectContaining({ status: "resolved", verdict: expect.objectContaining({ card: id, response: "accept", reviewer: p.handle, account: p.account, project: proj }) }) }]);
    expect((await post(p, proj, "proofs", { batch, response: p.passkey.sign(challenge) })).status).toBe(404);
    expect((await post(p, proj, "batches", { pending: [pending] })).body).toMatchObject({ expired: [pending] });

    const entries = await pull(proj, machine);
    const [verdict] = answersIn(entries);
    // The challenge the passkey signed is the verdict file's own digest (P16 section 7): the proof's single form.
    expect(Buffer.from(challenge, "base64url").toString("hex")).toBe(verdict!.digest);
    expect(verdict!.sig).toBeDefined();
    const proof = JSON.parse(body(entries.find((e) => e.path === proofPath(verdict!.path))!)) as PasskeyProof;
    expect(proof).toMatchObject({ type: "passkey-proof", format: 1, file: verdict!.path.split("/")[1], credential: p.passkey.id });
    expect(proof.batch).toBeUndefined();
    // The key file is in the log, signed, with the very line the account page shows for CI to pin (B-yj5d5).
    const key = entries.find((e) => e.path === keyFileName(p.passkey.id))!;
    expect(key.sig).toBeDefined();
    expect(JSON.parse(body(key))).toEqual(JSON.parse(p.pin));

    // 5. Store.judge on a machine, in CI: with the passkey pinned, the answer counts; with only the service's key, not.
    const pinned = view(entries, proj, p.pin);
    expect(pinned.judge(verdict!.path)).toEqual({ ok: true });
    expect(pinned.status(id)).toBe("resolved");
    expect(pinned.uncounted()).toEqual([]);
    const unpinned = view(entries, proj);
    expect(unpinned.judge(verdict!.path)).toMatchObject({ ok: false, why: expect.stringMatching(/passkey that isn't trusted/) });
    expect(unpinned.status(id)).toBe("open");
    // On the relay, which trusts the keys it put in the project, the card is answered.
    const state = (await (await call("GET", "state", { as: as(p), project: proj })).json()) as { cards: { meta: { id: string }; status: string }[] };
    expect(state.cards.find((c) => c.meta.id === id)!.status).toBe("resolved");
  });

  it("takes only the account's own passkey, over the challenge it was given, with user verification", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const q = await signUp();
    const id = fileCard(laptop, hard);
    await push(laptop, proj, machine);
    const pending = await waiting(p, proj, { card: id, response: "accept" });
    // Another account can't ask for it, or confirm it.
    expect((await post(q, proj, "batches", { pending: [pending] })).status).toBe(403);
    const { batch, challenge } = (await post(p, proj, "batches", { pending: [pending] })).body.passkey;
    expect((await post(p, proj, "proofs", { batch, response: q.passkey.sign(challenge) })).body.error).toMatch(/isn't one of your account's/);
    expect((await post(p, proj, "proofs", { batch, response: new WebPasskey().sign(challenge) })).status).toBe(400);
    expect((await post(p, proj, "proofs", { batch, response: p.passkey.sign(randomChallenge()) })).body.error).toMatch(/signature doesn't check/);
    expect((await post(p, proj, "proofs", { batch, response: p.passkey.sign(challenge, { flags: 0x01 }) })).body.error).toMatch(/signature doesn't check/);
    expect((await post(p, proj, "proofs", { batch, response: p.passkey.sign(challenge, { origin: "https://evil.test" }) })).status).toBe(400);
    expect((await post(p, proj, "proofs", { batch: "nothing-waiting", response: p.passkey.sign(challenge) })).status).toBe(404);
    // A waiting answer's own ID isn't a batch's.
    expect((await post(p, proj, "proofs", { batch: pending, response: p.passkey.sign(challenge) })).status).toBe(404);
    expect((await post(p, proj, "batches", { pending: [] })).status).toBe(400);
    expect((await post(p, proj, "batches", { pending: [pending, pending] })).status).toBe(400);
    expect((await post(p, proj, "batches", { pending: Array.from({ length: MAX_BATCH + 1 }, (_, i) => `x${i}`) })).status).toBe(400);
    // Still waiting, untouched, for the right signature.
    expect((await post(p, proj, "proofs", { batch, response: p.passkey.sign(challenge) })).body.answers).toEqual([expect.objectContaining({ pending, status: 201 })]);
  });

  it("isn't written if the card was answered meanwhile: written again, its bytes aren't the ones signed", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const id = fileCard(laptop, hard);
    await push(laptop, proj, machine);
    const first = await waiting(p, proj, { card: id, response: "accept" });
    const second = await waiting(p, proj, { card: id, response: "defer", comment: "later" });
    expect((await tap(p, proj, [second])).done.body.answers).toEqual([expect.objectContaining({ pending: second, status: 201 })]);
    const late = (await tap(p, proj, [first])).done.body.answers;
    expect(late).toEqual([expect.objectContaining({ pending: first, status: 409, body: { error: expect.stringMatching(/changed while your passkey was asked/) } })]);
    const entries = await pull(proj, machine);
    expect(entries.filter((e) => e.path.endsWith(".passkey.json"))).toHaveLength(1);
  });

  it("checks the proof with M9a's offline code too, for every algorithm a passkey may use", async () => {
    for (const alg of [-8, -257] as const) {
      const p = await signUp({ alg });
      const proj = project();
      const t = await machineLogin(p, proj);
      const machine = { headers: { authorization: `Bearer ${t.access}` } };
      const laptop = machineStore(new MemoryStorage(), proj);
      const ids = [fileCard(laptop, hard), fileCard(laptop, hard)];
      await push(laptop, proj, machine);
      const pending = [await waiting(p, proj, { card: ids[0], response: "accept" }), await waiting(p, proj, { card: ids[1], response: "accept" })];
      expect((await tap(p, proj, pending)).done.body.answers.map((a: { status: number }) => a.status), `alg ${alg}`).toEqual([201, 201]);
      const mine = view(await pull(proj, machine), proj, p.pin);
      expect(ids.map((id) => mine.status(id)), `alg ${alg}`).toEqual(["resolved", "resolved"]);
    }
  });
});

describe("hard answers confirmed together by one tap (B-a6xpc)", () => {
  it("one assertion over the list of their digests writes every waiting answer, each with its proof naming the list", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const ids = [fileCard(laptop, hard), fileCard(laptop, hard), fileCard(laptop, hard)];
    await push(laptop, proj, machine);
    const head = (await pull(proj, machine)).length;
    const pending = [
      await waiting(p, proj, { card: ids[0], response: "accept" }),
      await waiting(p, proj, { card: ids[1], response: "alternative", choice: "the other" }),
      await waiting(p, proj, { card: ids[2], response: "defer", comment: "later" }),
    ];
    // Nothing is written while they wait.
    expect(await pull(proj, machine)).toHaveLength(head);

    const { asked, done } = await tap(p, proj, pending);
    expect(asked).toMatchObject({ answers: pending, expired: [], files: 3 });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.answers.map((a: { pending: string; status: number }) => [a.pending, a.status])).toEqual(pending.map((x) => [x, 201]));

    const entries = await pull(proj, machine);
    const verdicts = answersIn(entries);
    expect(verdicts.map((v) => JSON.parse(body(v)).card)).toEqual(ids);
    // The challenge is the digest of the list of the three verdicts' digests, in the order they were answered.
    const list = verdicts.map((v) => v.digest);
    expect(asked.challenge).toBe(batchChallenge(list));
    const proofs = verdicts.map((v) => JSON.parse(body(entries.find((e) => e.path === proofPath(v.path))!)) as PasskeyProof);
    for (const [i, proof] of proofs.entries()) {
      expect(proof).toMatchObject({ type: "passkey-proof", format: 1, file: verdicts[i]!.path.split("/")[1], batch: list, credential: p.passkey.id });
      // The signature they share: one assertion, beside each answer.
      expect({ ...proof, file: "" }).toEqual({ ...proofs[0], file: "" });
    }

    // A machine with the passkey pinned counts all three; on the relay, all three are answered.
    const mine = view(entries, proj, p.pin);
    expect(ids.map((id) => mine.status(id))).toEqual(["resolved", "resolved", "deferred"]);
    expect(mine.uncounted()).toEqual([]);
    expect(view(entries, proj).uncounted()).toHaveLength(3);
  });

  it("refuses an assertion over a list that doesn't hold every waiting answer's digest, and writes nothing", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const ids = [fileCard(laptop, hard), fileCard(laptop, hard)];
    await push(laptop, proj, machine);
    const head = (await pull(proj, machine)).length;
    const pending = [await waiting(p, proj, { card: ids[0], response: "accept" }), await waiting(p, proj, { card: ids[1], response: "accept" })];
    const asked = (await post(p, proj, "batches", { pending })).body.passkey;
    // The digests, from the one answer asked for alone: a list with only the first, or the two the other way round.
    const one = Buffer.from((await post(p, proj, "batches", { pending: [pending[0]] })).body.passkey.challenge, "base64url").toString("hex");
    const two = Buffer.from((await post(p, proj, "batches", { pending: [pending[1]] })).body.passkey.challenge, "base64url").toString("hex");
    expect(asked.challenge).toBe(batchChallenge([one, two]));
    for (const list of [[one], [two, one], [one, two, one]]) {
      const r = await post(p, proj, "proofs", { batch: asked.batch, response: p.passkey.sign(batchChallenge(list)) });
      expect(r.status, JSON.stringify(list)).toBe(400);
      expect(r.body.error).toMatch(/signature doesn't check/);
    }
    expect(await pull(proj, machine)).toHaveLength(head);
    expect((await post(p, proj, "proofs", { batch: asked.batch, response: p.passkey.sign(asked.challenge) })).body.answers.map((a: { status: number }) => a.status)).toEqual([201, 201]);
  });

  it("an answer waits 30 minutes: one that expired is named, not written, and the rest still are", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const ids = [fileCard(laptop, hard), fileCard(laptop, hard), fileCard(laptop, hard)];
    await push(laptop, proj, machine);
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const old = await waiting(p, proj, { card: ids[0], response: "accept" });
    vi.setSystemTime(start + 20 * 60_000);
    const newer = await waiting(p, proj, { card: ids[1], response: "accept" });
    // At 31 minutes, the first has expired: asking names it, and the batch holds the second alone.
    vi.setSystemTime(start + 31 * 60_000);
    const asked = (await post(p, proj, "batches", { pending: [old, newer] })).body.passkey;
    expect(asked).toMatchObject({ answers: [newer], expired: [old], files: 1 });
    const done = await post(p, proj, "proofs", { batch: asked.batch, response: p.passkey.sign(asked.challenge) });
    expect(done.body.answers).toEqual([expect.objectContaining({ pending: newer, status: 201 })]);
    expect((await post(p, proj, "batches", { pending: [old] })).status).toBe(404);

    // One that expires between the ask and the tap isn't written; the others are.
    const third = await waiting(p, proj, { card: ids[2], response: "accept" });
    const again = await waiting(p, proj, { card: ids[0], response: "accept" });
    vi.setSystemTime(start + 45 * 60_000);
    const later = await waiting(p, proj, { card: ids[0], response: "defer", comment: "later" });
    const both = (await post(p, proj, "batches", { pending: [third, again, later] })).body.passkey;
    expect(both).toMatchObject({ answers: [third, again, later], files: 3 });
    vi.setSystemTime(start + 62 * 60_000);
    const out = (await post(p, proj, "proofs", { batch: both.batch, response: p.passkey.sign(both.challenge) })).body.answers;
    expect(out.map((a: { pending: string; status: number }) => [a.pending, a.status])).toEqual([
      [third, 410],
      [again, 410],
      [later, 201],
    ]);
    expect(out[0].body.error).toMatch(/waited too long for your passkey/);
    vi.useRealTimers();
    const mine = view(await pull(proj, machine), proj, p.pin);
    expect(ids.map((id) => mine.status(id))).toEqual(["deferred", "resolved", "open"]);
    expect(mine.uncounted()).toEqual([]);
  });
});

describe("a preference change that lets more cards past you, proved by the passkey (D163)", () => {
  it("is composed, proved and written; then the relay holds a card back, as only its signed gate record can (B-sa8tg)", async () => {
    const { p, proj, machine, laptop } = await setUp();
    // Tightening needs no passkey.
    const tighter = await post(p, proj, "preferences", { row_dependency: "never-without-me" });
    expect(tighter.status).toBe(201);
    const looser = await post(p, proj, "preferences", { replaces: tighter.body.name, mode: "enforce", row_dependency: "agent-decides", burn_in: 0 });
    expect(looser.status).toBe(202);
    expect(looser.body.passkey).toMatchObject({ proving: ["preferences"] });
    const { asked, done } = await tap(p, proj, [looser.body.passkey.pending]);
    expect(asked.options).toMatchObject({ allowCredentials: [{ id: p.passkey.id }] });
    const [written] = done.body.answers;
    expect(written.status, JSON.stringify(written)).toBe(201);
    expect(written.body.file).toMatchObject({ mode: "enforce", row_dependency: "agent-decides", account: p.account, project: proj });

    // A card that row now lets past: the relay's gate record holds it.
    const id = fileCard(laptop, { touches: ["dependency"] });
    await push(laptop, proj, machine);
    const entries = await pull(proj, machine);
    const mine = view(entries, proj, p.pin);
    expect(mine.inForce().name).toBe(written.body.name);
    expect(mine.gateRecordBy(id, 1, "relay")).toMatchObject({ outcome: "held", mode: "enforce", row: "dependency" });
    expect(mine.status(id)).toBe("held");
    expect(mine.uncounted()).toEqual([]);
    // Without the passkey pinned, the change doesn't count, so neither does the hold it made.
    const unpinned = view(entries, proj);
    expect(unpinned.inForce().name).toBe(tighter.body.name);
    expect(unpinned.uncounted().map((u) => u.file)).toContain(`preferences/${written.body.name}`);
  });

  it("accepting a slider proposal that loosens writes two files, the verdict and the preference file, both confirmed by one tap", async () => {
    const { p, proj, machine, laptop } = await setUp();
    // Enough answers on a row without a miss, and Baesian, on the relay, proposes moving it one stop down: a hard card.
    const ids = Array.from({ length: loosenAfter(0) }, () => fileCard(laptop, { touches: ["user-facing"] }));
    await push(laptop, proj, machine);
    let filed: string[] = [];
    for (const id of ids) filed = (await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept" })).body.filed ?? filed;
    const entries = await pull(proj, machine);
    const proposal = view(entries, proj, p.pin).card(filed[0]!)!;
    expect(proposal.meta).toMatchObject({ pref_row: "user_facing", pref_from: "tell-me", pref_to: "sample", level: "hard" });

    const answered = await post(p, proj, "verdicts", { card: proposal.meta.id, revision: 1, response: "accept" });
    expect(answered.body.passkey).toMatchObject({ proving: ["verdict", "preferences"] });
    const { asked, done } = await tap(p, proj, [answered.body.passkey.pending]);
    expect(asked.files).toBe(2);
    expect(done.body.answers).toEqual([expect.objectContaining({ status: 201 })]);
    const after = await pull(proj, machine);
    const mine = view(after, proj, p.pin);
    expect(mine.status(proposal.meta.id)).toBe("resolved");
    expect(mine.inForce().settings.rows.user_facing).toBe("sample");
    expect(mine.uncounted()).toEqual([]);
    // Both proofs name the same list of two: the verdict's digest and the preference file's.
    const proofs = after.filter((e) => e.path.endsWith(".passkey.json")).map((e) => JSON.parse(body(e)) as PasskeyProof);
    expect(proofs).toHaveLength(2);
    expect(proofs[0]!.batch).toHaveLength(2);
    expect(proofs[1]!.batch).toEqual(proofs[0]!.batch);
  });
});

describe("the passkey's key file (P16 section 7, D159)", () => {
  it("goes into every project of the account when a passkey is enrolled, the same bytes at the same path", async () => {
    const p = await signUp();
    const a = project();
    const b = project();
    const ta = await machineLogin(p, a);
    const tb = await machineLogin(p, b, "other");
    const ea = await pull(a, { headers: { authorization: `Bearer ${ta.access}` } });
    const eb = await pull(b, { headers: { authorization: `Bearer ${tb.access}` } });
    const ka = ea.find((e) => e.path === keyFileName(p.passkey.id))!;
    const kb = eb.find((e) => e.path === keyFileName(p.passkey.id))!;
    expect(ka.body).toBe(kb.body);
    expect(ka.digest).toBe(createHash("sha256").update(Buffer.from(ka.body!, "base64")).digest("hex"));
  });
});
