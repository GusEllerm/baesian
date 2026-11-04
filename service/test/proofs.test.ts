import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LOOSEN_AFTER } from "../../src/proposals.js";
import { type RelayEntry, readRelayEntry } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import { type Store, proofPath } from "../../src/store.js";
import { parseTrust } from "../../src/trust.js";
import { keyFileName } from "../src/relay.js";
import { type Person, machineLogin, signUp } from "./browser.js";
import { call, fileCard, machineStore, pulled } from "./client.js";
import { WebPasskey, randomChallenge } from "./passkeys.js";

// Answers that take the reviewer's passkey (D139, D163, M9c): composed by the relay, nothing written; signed by the
// passkey over the bytes' digest; checked on the service with SimpleWebAuthn (B-jp22m); then written with the service's
// signature and the passkey's proof beside them, and the passkey's key file in the project's trust/. A machine that
// pulls them and pins the passkey's line in CI, as D159 has it, counts them with M9a's own checks (`Store.judge`).

let n = 0;
const project = () => `proj-p${Date.now().toString(36)}${n++}`;

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

const hard = { touches: ["security"], wrong_if: "a token leaks", check: "the audit log" };

describe("an answer on a hard card, proved by the reviewer's passkey (D139)", () => {
  it("is composed, signed by the passkey over its digest, then written so a pinned machine counts it", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const id = fileCard(laptop, hard);
    expect(laptop.card(id)!.meta.level).toBe("hard");
    await push(laptop, proj, machine);
    const head = (await pull(proj, machine)).length;

    // 1. The answer is composed: nothing is written, and the browser gets the passkey's options, the challenge set.
    const asked = await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept", first_choice: "proposal" });
    expect(asked.status).toBe(202);
    const { pending, challenge, options } = asked.body.passkey;
    expect(options).toMatchObject({ challenge, rpId: env.SERVICE_RP_ID, userVerification: "required", allowCredentials: [{ id: p.passkey.id }] });
    expect(await pull(proj, machine)).toHaveLength(head);

    // 2. The passkey signs; 3. the relay checks it and writes the verdict, its .sig and its .passkey.json.
    const done = await post(p, proj, "proofs", { pending, response: p.passkey.sign(challenge) });
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    expect(done.body).toMatchObject({ status: "resolved", verdict: { card: id, response: "accept", reviewer: p.handle, account: p.account, project: proj } });
    expect((await post(p, proj, "proofs", { pending, response: p.passkey.sign(challenge) })).status).toBe(404);

    const entries = await pull(proj, machine);
    const verdict = entries.find((e) => e.path.startsWith("verdicts/") && e.path.endsWith(".json") && !e.path.endsWith(".passkey.json"))!;
    // The challenge the passkey signed is the verdict file's own digest (P16 section 7).
    expect(Buffer.from(challenge, "base64url").toString("hex")).toBe(verdict.digest);
    expect(verdict.sig).toBeDefined();
    const proof = entries.find((e) => e.path === proofPath(verdict.path))!;
    expect(JSON.parse(Buffer.from(proof.body!, "base64").toString())).toMatchObject({ type: "passkey-proof", format: 1, file: verdict.path.split("/")[1], credential: p.passkey.id });
    // The key file is in the log, signed, with the very line the person was given to pin.
    const key = entries.find((e) => e.path === keyFileName(p.passkey.id))!;
    expect(key.sig).toBeDefined();
    expect(JSON.parse(Buffer.from(key.body!, "base64").toString())).toEqual(JSON.parse(p.pin));

    // 4. Store.judge on a machine, in CI: with the passkey pinned, the answer counts; with only the service's key, not.
    const pinned = view(entries, proj, p.pin);
    expect(pinned.judge(verdict.path)).toEqual({ ok: true });
    expect(pinned.status(id)).toBe("resolved");
    expect(pinned.uncounted()).toEqual([]);
    const unpinned = view(entries, proj);
    expect(unpinned.judge(verdict.path)).toMatchObject({ ok: false, why: expect.stringMatching(/passkey that isn't trusted/) });
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
    const { pending, challenge } = (await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept" })).body.passkey;
    expect((await post(p, proj, "proofs", { pending, response: q.passkey.sign(challenge) })).body.error).toMatch(/isn't one of your account's/);
    expect((await post(p, proj, "proofs", { pending, response: new WebPasskey().sign(challenge) })).status).toBe(400);
    expect((await post(p, proj, "proofs", { pending, response: p.passkey.sign(randomChallenge()) })).body.error).toMatch(/signature doesn't check/);
    expect((await post(p, proj, "proofs", { pending, response: p.passkey.sign(challenge, { flags: 0x01 }) })).body.error).toMatch(/signature doesn't check/);
    expect((await post(p, proj, "proofs", { pending, response: p.passkey.sign(challenge, { origin: "https://evil.test" }) })).status).toBe(400);
    expect((await post(p, proj, "proofs", { pending: "nothing-waiting", response: p.passkey.sign(challenge) })).status).toBe(404);
    // Still waiting, untouched, for the right signature.
    expect((await post(p, proj, "proofs", { pending, response: p.passkey.sign(challenge) })).status).toBe(201);
  });

  it("is refused if the card was answered meanwhile: written again, its bytes aren't the ones signed", async () => {
    const { p, proj, machine, laptop } = await setUp();
    const id = fileCard(laptop, hard);
    await push(laptop, proj, machine);
    const first = (await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept" })).body.passkey;
    const second = (await post(p, proj, "verdicts", { card: id, revision: 1, response: "defer", comment: "later" })).body.passkey;
    expect((await post(p, proj, "proofs", { pending: second.pending, response: p.passkey.sign(second.challenge) })).status).toBe(201);
    const late = await post(p, proj, "proofs", { pending: first.pending, response: p.passkey.sign(first.challenge) });
    expect(late.status).toBe(409);
    expect(late.body.error).toMatch(/changed while your passkey was asked/);
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
      const id = fileCard(laptop, hard);
      await push(laptop, proj, machine);
      const { pending, challenge } = (await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept" })).body.passkey;
      expect((await post(p, proj, "proofs", { pending, response: p.passkey.sign(challenge) })).status, `alg ${alg}`).toBe(201);
      const entries = await pull(proj, machine);
      expect(view(entries, proj, p.pin).status(id), `alg ${alg}`).toBe("resolved");
    }
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
    expect(looser.body.passkey).toMatchObject({ proving: "preferences", options: { allowCredentials: [{ id: p.passkey.id }] } });
    const done = await post(p, proj, "proofs", { pending: looser.body.passkey.pending, response: p.passkey.sign(looser.body.passkey.challenge) });
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    expect(done.body.file).toMatchObject({ mode: "enforce", row_dependency: "agent-decides", account: p.account, project: proj });

    // A card that row now lets past: the relay's gate record holds it.
    const id = fileCard(laptop, { touches: ["dependency"] });
    await push(laptop, proj, machine);
    const entries = await pull(proj, machine);
    const mine = view(entries, proj, p.pin);
    expect(mine.inForce().name).toBe(done.body.name);
    expect(mine.gateRecordBy(id, 1, "relay")).toMatchObject({ outcome: "held", mode: "enforce", row: "dependency" });
    expect(mine.status(id)).toBe("held");
    expect(mine.uncounted()).toEqual([]);
    // Without the passkey pinned, the change doesn't count, so neither does the hold it made.
    const unpinned = view(entries, proj);
    expect(unpinned.inForce().name).toBe(tighter.body.name);
    expect(unpinned.uncounted().map((u) => u.file)).toContain(`preferences/${done.body.name}`);
  });

  it("accepting a slider proposal that loosens takes two proofs: the verdict's and the preference file's", async () => {
    const { p, proj, machine, laptop } = await setUp();
    // Enough answers on a row without a miss, and Baesian, on the relay, proposes moving it one stop down: a hard card.
    const ids = Array.from({ length: LOOSEN_AFTER }, () => fileCard(laptop, { touches: ["user-facing"] }));
    await push(laptop, proj, machine);
    let filed: string[] = [];
    for (const id of ids) filed = (await post(p, proj, "verdicts", { card: id, revision: 1, response: "accept" })).body.filed ?? filed;
    const entries = await pull(proj, machine);
    const proposal = view(entries, proj, p.pin).card(filed[0]!)!;
    expect(proposal.meta).toMatchObject({ pref_row: "user_facing", pref_from: "tell-me", pref_to: "sample", level: "hard" });

    const asked = await post(p, proj, "verdicts", { card: proposal.meta.id, revision: 1, response: "accept" });
    expect(asked.body.passkey).toMatchObject({ proving: "verdict", step: 1, of: 2 });
    const next = await post(p, proj, "proofs", { pending: asked.body.passkey.pending, response: p.passkey.sign(asked.body.passkey.challenge) });
    expect(next.status).toBe(202);
    expect(next.body.passkey).toMatchObject({ proving: "preferences", step: 2, of: 2, options: { challenge: next.body.passkey.challenge } });
    const done = await post(p, proj, "proofs", { pending: asked.body.passkey.pending, response: p.passkey.sign(next.body.passkey.challenge) });
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    const mine = view(await pull(proj, machine), proj, p.pin);
    expect(mine.status(proposal.meta.id)).toBe("resolved");
    expect(mine.inForce().settings.rows.user_facing).toBe("sample");
    expect(mine.uncounted()).toEqual([]);
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
