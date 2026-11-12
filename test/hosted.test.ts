import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { evaluate } from "../src/gate.js";
import { openRepo } from "../src/git.js";
import { proofProblem } from "../src/passkey.js";
import { Config, NewerFormat, type PasskeyProof } from "../src/schema.js";
import { NAMESPACE, parseSignature, signMessage } from "../src/sshsig.js";
import { Store, proofPath } from "../src/store.js";
import { BadTrust, TRUST_ENV, TRUST_FILE_ENV, checkSigned, parseTrust, pinnedTrust, projectLine } from "../src/trust.js";
import { describeVerify as describeVerifyLines, verify } from "../src/verify.js";
import { waitForVerdict } from "../src/wait.js";
import { BODY, REVIEWER, cited, cleanup, draft, fakeClock, repo, sh } from "./helpers.js";
import { ORIGIN, RP_ID, TestPasskey, TestService, put } from "./service.js";
import { plain } from "../src/style.js";

/** What the agent reads, in plain text. */
const describeVerify = (...a: Parameters<typeof describeVerifyLines>) => plain(describeVerifyLines(...a));

// M9a: answers that count, checked offline (D138, D139, D142, D158–D160, D163). The service is a stand-in that signs
// with test keys (test/service.ts); ssh-keygen checks its signatures where it's on PATH.

afterEach(() => {
  delete process.env[TRUST_ENV];
  delete process.env[TRUST_FILE_ENV];
  cleanup();
});

const AGENT = { agent: "claude-code" };
const NOW = "2026-07-01T00:00:00.000Z";
const BYTES = Buffer.from('{"type":"verdict"}\n');
const problem = (r: object) => ("problem" in r ? (r as { problem: string }).problem : undefined);
const hasSshKeygen = spawnSync("ssh-keygen", ["-Y"], { stdio: "ignore" }).error === undefined;

/** A hard card: one that touches security, with what would show the pick wrong (D77). */
const hard = (over: Record<string, unknown> = {}) => draft({ touches: ["security"], wrong_if: "tokens leak", check: "the audit log", ...over });

/** A repo linked to the service: its key in the live layer, as the CLI writes it at sign-in. */
function hosted() {
  const r = repo();
  const service = new TestService();
  service.link(r.store);
  return { ...r, service };
}

/**
 * Answers the service wrote, confirmed together by one tap (B-a6xpc): each one's proof in the batch form, beside it,
 * as the relay writes them. `change` alters the proofs first, to make them wrong.
 */
function proveTogether(store: Store, passkey: TestPasskey, rels: string[], change = (p: PasskeyProof[]) => p): void {
  const proofs = change(passkey.proveBatch(rels.map((rel) => ({ name: rel.split("/").at(-1)!, bytes: store.bytes(rel) }))));
  rels.forEach((rel, i) => put(store, proofPath(rel), `${JSON.stringify(proofs[i], null, 2)}\n`));
}

function commit(dir: string, store: Store, message: string): string {
  store.syncRecord();
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "--allow-empty", "-m", message);
  return sh(dir, "rev-parse", "HEAD");
}

/** Baesian's record committed on main, linked or not, and a feature branch checked out. */
function branched(link = true) {
  const { dir, store } = repo();
  const service = new TestService();
  if (link) service.link(store);
  commit(dir, store, "Set up Baesian");
  sh(dir, "checkout", "-q", "-b", "feat");
  return { dir, store: Store.open(dir), repo: openRepo(dir), service };
}

function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd, notify: () => {} };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

describe("the service's signatures are OpenSSH's (D160)", () => {
  it.skipIf(!hasSshKeygen)("which ssh-keygen -Y verify checks, with the key as an allowed-signers line", () => {
    const { dir } = repo();
    const service = new TestService();
    writeFileSync(join(dir, "verdict.json"), BYTES);
    writeFileSync(join(dir, "verdict.json.sig"), service.signature(BYTES));
    writeFileSync(join(dir, "allowed_signers"), `baesian namespaces="baesian" ${service.serviceKey().public_key}\n`);
    const check = (namespace: string) =>
      spawnSync("ssh-keygen", ["-Y", "verify", "-f", "allowed_signers", "-I", "baesian", "-n", namespace, "-s", "verdict.json.sig"], { cwd: dir, input: BYTES, encoding: "utf8" });
    const good = check("baesian");
    expect(good.status, good.stderr).toBe(0);
    expect(good.stdout + good.stderr).toContain('Good "baesian" signature');
    expect(check("git").status).not.toBe(0);
  });

  it.skipIf(!hasSshKeygen)("and reads ssh-keygen's own: a file signed with ssh-keygen -Y sign counts", () => {
    const { dir } = repo();
    spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "service", "-f", "key"], { cwd: dir });
    writeFileSync(join(dir, "verdict.json"), BYTES);
    expect(spawnSync("ssh-keygen", ["-Y", "sign", "-f", "key", "-n", "baesian", "verdict.json"], { cwd: dir, stdio: "ignore" }).status).toBe(0);
    const pub = readFileSync(join(dir, "key.pub"), "utf8").split(" ").slice(0, 2).join(" ");
    const root = { service: [{ ...new TestService().serviceKey(), public_key: pub }], revoked: [] };
    expect(checkSigned(root, BYTES, readFileSync(join(dir, "verdict.json.sig"), "utf8"), NOW, "verdict.json")).toHaveProperty("key");
  });

  it("count only by a trusted key, in Baesian's namespace, over the same bytes", () => {
    const service = new TestService();
    const root = service.pinned();
    const sig = service.signature(BYTES);
    expect(checkSigned(root, BYTES, sig, NOW, "f")).toHaveProperty("key.key", "test-1");
    expect(problem(checkSigned(root, Buffer.from('{"type":"verdict!"}\n'), sig, NOW, "f"))).toBe("its signature doesn't match its bytes");
    expect(problem(checkSigned(root, BYTES, new TestService().signature(BYTES), NOW, "f"))).toBe("it's signed by a key that isn't trusted");
    expect(problem(checkSigned(root, BYTES, signMessage(service.privateKey, BYTES, "git"), NOW, "f"))).toBe(`it's signed for "git", not "${NAMESPACE}"`);
    expect(problem(checkSigned(root, BYTES, "not a signature", NOW, "f"))).toContain("its signature can't be read");
  });

  it("count only while the key is valid, and before it was revoked", () => {
    const service = new TestService("k", { after: "2026-06-01T00:00:00.000Z", before: "2026-12-01T00:00:00.000Z" });
    const root = service.pinned();
    const sig = service.signature(BYTES);
    expect(problem(checkSigned(root, BYTES, sig, "2026-05-31T23:59:59.999Z", "f"))).toBe("it was signed before key k was valid");
    expect(problem(checkSigned(root, BYTES, sig, "2026-12-01T00:00:00.000Z", "f"))).toBe("it was signed after key k expired");
    expect(checkSigned(root, BYTES, sig, NOW, "f")).toHaveProperty("key");
    const revoked = { ...root, revoked: [{ type: "service-key-revocation" as const, format: 1 as const, key: "k", reason: "leaked", at: "2026-08-01T00:00:00.000Z" }] };
    expect(checkSigned(revoked, BYTES, sig, "2026-07-31T23:59:59.999Z", "f")).toHaveProperty("key");
    expect(problem(checkSigned(revoked, BYTES, sig, "2026-08-01T00:00:00.000Z", "f"))).toBe("it was signed after key k was revoked");
  });

  it("in a newer version than this Baesian reads are refused by name (D157)", () => {
    const sig = new TestService().signature(BYTES);
    const blob = Buffer.from(sig.split("\n").slice(1, -2).join(""), "base64");
    blob.writeUInt32BE(2, 6);
    const newer = `-----BEGIN SSH SIGNATURE-----\n${blob.toString("base64")}\n-----END SSH SIGNATURE-----\n`;
    expect(() => parseSignature(newer, "verdicts/v.json.sig")).toThrow(NewerFormat);
    expect(() => parseSignature(newer, "verdicts/v.json.sig")).toThrow("verdicts/v.json.sig has signature format 2; this Baesian reads up to 1: upgrade Baesian");
  });
});

describe("passkey proofs (D139)", () => {
  const service = { origin: ORIGIN, rp_id: RP_ID };

  it.each([-7, -8, -257] as const)("check an assertion whose challenge is the file's digest (COSE alg %i)", (alg) => {
    const p = new TestPasskey("acct-gus", "gus", alg);
    expect(proofProblem(p.prove("v.json", BYTES), BYTES, p.keyFile(), service)).toBeUndefined();
  });

  it("refuse one for another file, site or relying party, without user verification, or by another key", () => {
    const p = new TestPasskey();
    const key = p.keyFile();
    const why = (proof: ReturnType<TestPasskey["prove"]>, k = key) => proofProblem(proof, BYTES, k, service);
    expect(why(p.prove("v.json", Buffer.from("another file")))).toBe("its challenge isn't the file's digest");
    expect(why(p.prove("v.json", BYTES, { origin: "https://evil.test" }))).toBe(`it was made on https://evil.test, not ${ORIGIN}`);
    expect(why(p.prove("v.json", BYTES, { rpId: "evil.test" }))).toBe(`it's for another relying party than ${RP_ID}`);
    expect(why(p.prove("v.json", BYTES, { flags: 0x01 }))).toBe("the passkey didn't verify the reviewer (no face, fingerprint or PIN)");
    expect(why(p.prove("v.json", BYTES, { crossOrigin: true }))).toBe("it was made in a frame of another site");
    expect(why(p.prove("v.json", BYTES, { type: "webauthn.create" }))).toBe("it's a webauthn.create, not an assertion (webauthn.get)");
    expect(why(p.prove("v.json", BYTES), new TestPasskey().keyFile())).toBe("it was made with another passkey");
    expect(why(p.prove("v.json", BYTES), { ...key, public_key: new TestPasskey().keyFile().public_key })).toBe("its signature doesn't match the passkey's key");
  });

  it("check one tap over several files (B-a6xpc): the challenge is its list's digest, and the list holds the file's", () => {
    const p = new TestPasskey();
    const key = p.keyFile();
    const OTHER = Buffer.from('{"type":"verdict","card":"B-other"}\n');
    const [mine, theirs] = p.proveBatch([
      { name: "v.json", bytes: BYTES },
      { name: "w.json", bytes: OTHER },
    ]);
    expect(mine!.batch).toEqual([createHash("sha256").update(BYTES).digest("hex"), createHash("sha256").update(OTHER).digest("hex")]);
    // One assertion, shared: the same list and signature beside each file.
    expect({ ...mine, file: "-" }).toEqual({ ...theirs, file: "-" });
    expect(proofProblem(mine!, BYTES, key, service)).toBeUndefined();
    expect(proofProblem(theirs!, OTHER, key, service)).toBeUndefined();
    // Its challenge isn't a file's digest: the batch's proof proves nothing in the single form, and the reverse.
    expect(proofProblem({ ...mine!, batch: undefined }, BYTES, key, service)).toBe("its challenge isn't the file's digest");
    expect(proofProblem({ ...p.prove("v.json", BYTES), batch: mine!.batch }, BYTES, key, service)).toBe("its challenge isn't the digest of its batch");
    // A list changed after the tap, or one that never held this file, or another passkey's key.
    expect(proofProblem({ ...mine!, batch: [mine!.batch![0]!] }, BYTES, key, service)).toBe("its challenge isn't the digest of its batch");
    expect(proofProblem(mine!, Buffer.from("a third file"), key, service)).toBe("its batch doesn't list the file's digest, so the passkey didn't confirm this file");
    const [left] = p.proveBatch([{ name: "v.json", bytes: BYTES }], { list: [mine!.batch![1]!] });
    expect(proofProblem(left!, BYTES, key, service)).toBe("its batch doesn't list the file's digest, so the passkey didn't confirm this file");
    expect(proofProblem(mine!, BYTES, { ...key, public_key: new TestPasskey().keyFile().public_key }, service)).toBe("its signature doesn't match the passkey's key");
  });
});

describe("in a hosted repo, only answers the service signs count (D138)", () => {
  it("changes nothing in a repo that isn't hosted: an answer written on the machine counts", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect(store.hosted()).toBeUndefined();
    expect(store.status(id)).toBe("resolved");
    expect(store.uncounted()).toEqual([]);
  });

  it("ignores an answer written on the machine once the repo is linked, and counts the service's", () => {
    const { store, service } = hosted();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect(store.hosted()?.pinned).toBe(false);
    expect(store.status(id)).toBe("open");
    expect(cited(store.uncounted())).toEqual([{ file: expect.stringMatching(/^verdicts\//), why: "it has no signature, so the service didn't write it (D138)" }]);
    service.answer(store, { card: id, response: "alternative", choice: "Postgres" });
    expect(store.status(id)).toBe("resolved");
    expect(store.decision(id)).toBe("Postgres");
    expect(store.verdicts(id).map((v) => [v.reviewer, v.account, v.client])).toEqual([["gus", "acct-gus", "hosted-desktop"]]);
  });

  it("ignores one signed by a key it doesn't trust, or after the key was revoked", () => {
    const { store, service } = hosted();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept" }, { signer: new TestService("other") });
    expect(store.status(id)).toBe("open");
    service.revoke(store, "2026-02-01T00:00:00.000Z", "leaked");
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("open");
    expect(store.uncounted().map((u) => u.why).sort()).toEqual(["it was signed after key test-1 was revoked", "it's signed by a key that isn't trusted"]);
  });

  it("takes the reviewer's passkey for an answer on a hard card (D139)", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const id = store.fileCard(hard(), BODY, AGENT).card.meta.id;
    expect(store.levelOf(id)).toBe("hard");
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("open");
    expect(cited(store.uncounted())[0]?.why).toBe(`it answers ${id}, a hard card, so it takes the reviewer's passkey (D139), and has no passkey proof`);
    service.answer(store, { card: id, response: "accept" }, { passkey });
    expect(store.status(id)).toBe("resolved");
  });

  it("trusts only passkeys the service enrolled, for the answer's own account (D159)", () => {
    const { store, service } = hosted();
    const gus = new TestPasskey();
    const eve = new TestPasskey("acct-eve", "eve");
    const unsigned = new TestPasskey();
    service.enrol(store, gus);
    service.enrol(store, eve);
    const loose = service.enrol(store, unsigned, { unsigned: true });
    const id = store.fileCard(hard(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept" }, { passkey: eve });
    service.answer(store, { card: id, response: "accept" }, { passkey: unsigned });
    service.answer(store, { card: id, response: "accept" }, { passkey: gus, proof: { flags: 0x01 } });
    expect(store.status(id)).toBe("open");
    const why = cited(store.uncounted()).map((u) => `${u.file.split("/")[0]}: ${u.why}`);
    expect(why).toContain(`verdicts: it answers ${id}, a hard card, so it takes the reviewer's passkey (D139), and its proof was made with a passkey that isn't trusted for account acct-gus (D159)`);
    expect(why).toContain("verdicts: its passkey proof doesn't check: the passkey didn't verify the reviewer (no face, fingerprint or PIN)");
    expect(cited(store.uncounted())).toContainEqual({ file: loose, why: "it has no signature, so the service didn't write it (D138)" });
    service.answer(store, { card: id, response: "accept" }, { passkey: gus });
    expect(store.status(id)).toBe("resolved");
  });

  it("counts hard answers one tap confirmed together (B-a6xpc), each by its proof in the batch form, and a single answer's still", () => {
    const { store, service } = hosted();
    const gus = new TestPasskey();
    const eve = new TestPasskey("acct-eve", "eve");
    service.enrol(store, gus);
    service.enrol(store, eve);
    const [a, b, c, d] = ["One", "Two", "Three", "Four"].map((title) => store.fileCard(hard({ title }), BODY, { ...AGENT, force: true }).card.meta.id);
    const ra = service.answer(store, { card: a!, response: "accept" });
    const rb = service.answer(store, { card: b!, response: "defer", comment: "later" });
    expect([store.status(a!), store.status(b!)]).toEqual(["open", "open"]);
    proveTogether(store, gus, [ra, rb]);
    expect([store.status(a!), store.status(b!)]).toEqual(["resolved", "deferred"]);
    expect(store.uncounted()).toEqual([]);

    // A proof copied beside an answer its list doesn't hold; one by another account's passkey; one beside an answer of
    // another account's, in a list that holds it; one made with a list changed after the tap.
    const rc = service.answer(store, { card: c!, response: "accept" });
    put(store, proofPath(rc), readFileSync(join(store.live, proofPath(ra)), "utf8").replace(/"file": "[^"]+"/, `"file": "${rc.split("/")[1]}"`));
    expect(store.status(c!)).toBe("open");
    expect(store.uncounted()).toContainEqual({ file: rc, why: "its passkey proof doesn't check: its batch doesn't list the file's digest, so the passkey didn't confirm this file" });
    const rd = service.answer(store, { card: d!, response: "accept", account: "acct-eve", reviewer: "eve" });
    const rd2 = service.answer(store, { card: d!, response: "accept" });
    proveTogether(store, gus, [rd, rd2]);
    expect(cited(store.uncounted())).toContainEqual({ file: rd, why: `it answers ${d}, a hard card, so it takes the reviewer's passkey (D139), and its proof was made with a passkey that isn't trusted for account acct-eve (D159)` });
    expect(store.status(d!)).toBe("resolved");
    expect(store.verdicts(d!).map((v) => v.account)).toEqual(["acct-gus"]);

    const { store: s2, service: sv2 } = hosted();
    sv2.enrol(s2, gus);
    const e = s2.fileCard(hard({ title: "Five" }), BODY, { ...AGENT, force: true }).card.meta.id;
    const f = s2.fileCard(hard({ title: "Six" }), BODY, { ...AGENT, force: true }).card.meta.id;
    const re = sv2.answer(s2, { card: e, response: "accept" });
    const rf = sv2.answer(s2, { card: f, response: "accept" });
    proveTogether(s2, gus, [re, rf], (proofs) => proofs.map((p) => ({ ...p, batch: [p.batch![1]!, p.batch![0]!] })));
    expect(s2.uncounted().map((u) => u.why)).toEqual(["its passkey proof doesn't check: its challenge isn't the digest of its batch", "its passkey proof doesn't check: its challenge isn't the digest of its batch"]);
    // An answer proved alone, in the single form, still counts beside them.
    const g = s2.fileCard(hard({ title: "Seven" }), BODY, { ...AGENT, force: true }).card.meta.id;
    sv2.answer(s2, { card: g, response: "accept" }, { passkey: gus });
    expect(s2.status(g)).toBe("resolved");
  });

  it("counts rules and topic merges only when signed", () => {
    const { store, service } = hosted();
    const fact = { id: "dep:left-pad", kind: "dep" as const, path: "package.json", detail: "adds left-pad" };
    const covered = () => evaluate(store, { facts: [fact], warnings: [] }, { cards: [], acks: new Map(), malformed: [] }).ok;
    service.rule(store, { covers: ["dep:left-*"] }, { unsigned: true });
    expect(store.rules()).toEqual([]);
    expect(covered()).toBe(false);
    service.rule(store, { covers: ["dep:left-*"] });
    expect(store.rules()).toHaveLength(1);
    expect(covered()).toBe(true);
    store.fileCard(draft({ title: "One", topic: "storage/runs" }), BODY, AGENT);
    store.fileCard(draft({ title: "Two", topic: "storage/run-metadata" }), BODY, { ...AGENT, force: true });
    service.alias(store, "storage/runs", "storage/run-metadata", { unsigned: true });
    expect(store.canonicalTopic("storage/runs")).toBe("storage/runs");
    service.alias(store, "storage/runs", "storage/run-metadata");
    expect(store.canonicalTopic("storage/runs")).toBe("storage/run-metadata");
  });

  it("counts a signed preference change that tightens; one that lets more past you takes the passkey (D163)", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const tighter = service.preferences(store, { row_public_api: "stop-and-ask" });
    expect(store.inForce().name).toBe(tighter.name);
    const looser = service.preferences(store, { row_dependency: "agent-decides" });
    expect(store.inForce().name).toBe(tighter.name);
    expect(cited(store.uncounted())).toContainEqual({ file: looser.rel, why: "it lets more cards past you (it moves dependency from tell-me to agent-decides), so it takes your passkey (D163), and has no passkey proof" });
    const proved = service.preferences(store, { row_dependency: "agent-decides" }, { passkey });
    expect(store.inForce().name).toBe(proved.name);
    // Turning enforcing on lets held cards past too; a change written on the machine never counts.
    service.preferences(store, { mode: "enforce" });
    expect(store.inForce().settings.mode).toBe("shadow");
    store.writePreferences({ replaces: proved.name, row_infra: "never-without-me" }, { by: "gus", client: "test" });
    expect(store.inForce().name).toBe(proved.name);
    const enforcing = service.preferences(store, { mode: "enforce" }, { passkey });
    expect(store.inForce()).toMatchObject({ name: enforcing.name, settings: { mode: "enforce" } });
  });

  it("holds a card back only on the relay's signed gate record (D158)", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    service.preferences(store, { mode: "enforce", row_dependency: "agent-decides", rate_agent_decides: 0, burn_in: 0 }, { passkey });
    const id = store.fileCard(draft({ touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    expect(store.gateRecordBy(id, 1, "cli")?.outcome).toBe("held");
    expect(store.status(id)).toBe("open");
    const unsigned = service.gate(store, id, { unsigned: true });
    expect(store.status(id)).toBe("open");
    rmSync(join(store.live, unsigned.rel));
    expect(service.gate(store, id).record).toMatchObject({ by: "relay", outcome: "held", draw_proof: expect.any(String) });
    expect(store.status(id)).toBe("held");
  });

  it("raises the level in force to the relay's, when it shows the card higher", () => {
    const { store, service } = hosted();
    const id = store.fileCard(draft({ touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    expect(store.levelOf(id)).toBe("provisional");
    service.preferences(store, { row_dependency: "never-without-me" });
    service.gate(store, id);
    expect(store.levelOf(id)).toBe("hard");
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("open");
  });

  it("counts a signed file only where its bytes say it belongs: a copy under another name counts nowhere", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const copy = (from: string, to: string) => {
      for (const [a, b] of [[from, to], [`${from}.sig`, `${to}.sig`], [from.replace(/\.json$/, ".passkey.json"), to.replace(/\.json$/, ".passkey.json")]] as const) {
        try {
          put(store, b, store.bytes(a));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
    };
    // An answer accepting one card, copied under another card's name.
    const answered = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const other = store.fileCard(draft({ title: "The cache", topic: "storage/cache" }), BODY, AGENT).card.meta.id;
    const rel = service.answer(store, { card: answered, response: "accept" });
    copy(rel, rel.replace(answered, other));
    expect(store.status(answered)).toBe("resolved");
    expect(store.status(other)).toBe("open");
    expect(store.uncounted()).toEqual([{ file: rel.replace(answered, other), why: expect.stringContaining("doesn't match what it says") }]);
    // A relay's record holding one card back, copied into another card's folder.
    service.preferences(store, { mode: "enforce", row_dependency: "agent-decides", rate_agent_decides: 0, burn_in: 0 }, { passkey });
    const held = store.fileCard(draft({ title: "The queue", topic: "storage/queue", touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    const unheld = store.fileCard(draft({ title: "The log", topic: "storage/log", touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    const gate = service.gate(store, held).rel;
    copy(gate, gate.replace(held, unheld));
    expect([store.status(held), store.status(unheld)]).toEqual(["held", "open"]);
    // An old change that let more past you, copied under a newer name after you tightened it again.
    const loose = service.preferences(store, { row_infra: "agent-decides" }, { passkey });
    const tight = service.preferences(store, { row_infra: "tell-me" });
    const later = `${new Date(Date.now() + 60_000).toISOString().replace(/[-:]/g, "")}-zzzzz.json`;
    copy(loose.rel, `preferences/${later}`);
    expect(store.inForce().name).toBe(tight.name);
    expect(store.uncounted()).toContainEqual({ file: `preferences/${later}`, why: expect.stringContaining("its name doesn't match its time") });
  });

  it("takes the passkey for a change that brings fewer held cards back to you: a lower audit rate or burn-in (B-shndb)", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const more = service.preferences(store, { rate_sample: 0.5, burn_in: 20 });
    expect(store.inForce().name).toBe(more.name);
    const fewer = service.preferences(store, { rate_sample: 0.1 });
    const shorter = service.preferences(store, { burn_in: 0 });
    expect(store.inForce().name).toBe(more.name);
    expect(cited(store.uncounted())).toEqual([
      { file: fewer.rel, why: "it lets more cards past you (it lowers rate_sample from 50% to 10%), so it takes your passkey (D163), and has no passkey proof" },
      { file: shorter.rel, why: "it lets more cards past you (it lowers burn_in from 20 to 0), so it takes your passkey (D163), and has no passkey proof" },
    ]);
    const proved = service.preferences(store, { rate_agent_decides: 0 }, { passkey });
    expect(store.inForce()).toMatchObject({ name: proved.name, settings: { rate_agent_decides: 0, rate_sample: 0.5, burn_in: 20 } });
  });

  it("counts an answer only on the card text it names: a card rewritten after its answer is unanswered (B-f571v)", () => {
    const { store, service } = hosted();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept", card_digest: undefined });
    service.answer(store, { card: id, response: "reject", comment: "No.", card_digest: "0".repeat(64) });
    expect(store.status(id)).toBe("open");
    expect(cited(store.uncounted()).map((u) => u.why)).toEqual([
      "it doesn't name the digest of the card it answers, so what was answered can't be checked (B-f571v)",
      `${id} r1 has changed since it was answered: it isn't the text the answer names (B-f571v)`,
    ]);
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("resolved");
    appendFileSync(join(store.live, "cards", id, "r1.md"), "\nAnd one thing more.\n");
    expect(store.status(id)).toBe("open");
  });

  it("counts a signed file only in its own project: one copied from another of your repos counts nowhere else (B-tf9fc)", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const other = { project: "proj-other" };
    service.answer(store, { card: id, response: "accept" }, other);
    service.rule(store, { covers: ["dep:left-*"] }, other);
    service.alias(store, "storage/runs", "storage/run-metadata", other);
    service.preferences(store, { row_dependency: "agent-decides" }, { ...other, passkey });
    service.answer(store, { card: id, response: "reject", comment: "No.", project: undefined });
    expect(store.status(id)).toBe("open");
    expect(store.rules()).toEqual([]);
    expect(store.canonicalTopic("storage/runs")).toBe("storage/runs");
    expect(store.inForce().name).toBeUndefined();
    const copied = "it's for project proj-other, not this repo's (proj-test), so it was copied from another repo";
    expect(cited(store.uncounted()).map((u) => u.why).sort()).toEqual([copied, copied, copied, copied, "it names no project, so it could be another repo's (B-tf9fc)"].sort());
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("resolved");
  });

  it("counts nothing signed until the config names the repo's project, set with the service", () => {
    const { store } = repo();
    const service = new TestService();
    put(store, `trust/service-${service.keyId}.json`, `${JSON.stringify(service.serviceKey())}\n`);
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept" });
    expect(store.status(id)).toBe("open");
    expect(store.uncounted()[0]?.why).toBe("it's for project proj-test, and .baesian/config.json names no project");
    expect(Config.safeParse({ service: ORIGIN }).success).toBe(false);
    expect(Config.safeParse({ project: "proj-test" }).success).toBe(false);
    expect(Config.safeParse({ service: ORIGIN, project: "proj-test" }).success).toBe(true);
  });

  it("keeps an agent waiting on a card the relay raised to hard: it never proceeds without an answer", async () => {
    const { store, service } = hosted();
    const id = store.fileCard(draft({ touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    service.preferences(store, { row_dependency: "never-without-me" });
    service.gate(store, id);
    const clock = fakeClock();
    const outcome = await waitForVerdict(store, id, { agent: "claude-code", timeoutMs: 60_000, usePresence: false, now: clock.now, sleep: clock.sleep });
    expect(outcome).toMatchObject({ kind: "no-verdict", level: "hard", proceed: false });
  });

  it("names the account on a rule saved from an answer", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", make_rule: true, account: "acct-gus", ...REVIEWER });
    const ruleCard = store.draftRule(id, "Use SQLite for local state.", ["dep:better-sqlite3"], AGENT);
    store.addVerdict({ card: ruleCard.meta.id, revision: 1, response: "accept", account: "acct-gus", ...REVIEWER });
    expect(store.rules().map((r) => [r.meta.accepted_by, r.meta.account])).toEqual([["gus", "acct-gus"]]);
  });

  it("refuses a key file in a newer format by name (D157)", () => {
    const { store } = repo();
    put(store, "trust/service-k2.json", JSON.stringify({ ...new TestService("k2").serviceKey(), format: 2 }));
    expect(() => store.hosted()).toThrow("trust/service-k2.json has service key format 2; this Baesian reads up to 1: upgrade Baesian");
  });
});

describe("baesian verify, with the keys pinned in CI (D142)", () => {
  it("checks every commit as hosted, whatever its record says", () => {
    const { dir, store, repo, service } = branched(false);
    const id = store.fileCard(hard(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, store, `Harden the sessions\n\nBaesian-Card: ${id}`);
    const r = verify(repo, "main", { merge: true, pinned: service.pinned() });
    expect(r.ok).toBe(false);
    expect(r.hosted).toMatchObject({ keys: "pinned", skipped: [{ file: expect.stringMatching(/^verdicts\//), why: expect.stringContaining("no signature") }] });
    expect(r.commits[0]?.report.problems[0]?.problem).toBe("hard-unresolved");
    expect(r.merge?.problems[0]).toMatchObject({ card: id, problem: "unanswered" });
    const text = describeVerify(r).join("\n");
    expect(text).toContain("hosted:  only answers the service signed count, checked with the keys CI pins");
    expect(text).toMatch(/note: verdicts\/\S+ doesn't count: it has no signature, so the service didn't write it$/m);
    // The same repo, with nothing pinned and no keys in the record, isn't hosted: as before, the answer counts.
    expect(verify(repo, "main", { merge: true, pinned: null })).toMatchObject({ ok: true });
  });

  it("passes an answer the service signed, and on a hard card the reviewer's passkey proved", () => {
    const { dir, store, repo, service } = branched();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const id = store.fileCard(hard(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept" }, { passkey });
    commit(dir, store, `Harden the sessions\n\nBaesian-Card: ${id}`);
    const r = verify(repo, "main", { merge: true, pinned: service.pinned(passkey) });
    expect(r.commits.map((c) => [c.ok, c.trust])).toEqual([[true, []]]);
    expect(r).toMatchObject({ ok: true, hosted: { keys: "pinned", skipped: [] } });
  });

  it("passes hard answers one tap confirmed together (B-a6xpc), and not with a list changed after the tap", () => {
    const { dir, store, repo, service } = branched();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const a = store.fileCard(hard({ title: "Sessions" }), BODY, { ...AGENT, force: true }).card.meta.id;
    const b = store.fileCard(hard({ title: "Tokens" }), BODY, { ...AGENT, force: true }).card.meta.id;
    proveTogether(store, passkey, [service.answer(store, { card: a, response: "accept" }), service.answer(store, { card: b, response: "accept" })]);
    commit(dir, store, `Harden the sessions and tokens\n\nBaesian-Card: ${a}\nBaesian-Card: ${b}`);
    const r = verify(repo, "main", { merge: true, pinned: service.pinned(passkey) });
    expect(r.commits.map((c) => [c.ok, c.trust])).toEqual([[true, []]]);
    expect(r).toMatchObject({ ok: true, hosted: { keys: "pinned", skipped: [] } });

    const tampered = branched();
    tampered.service.enrol(tampered.store, passkey);
    const c = tampered.store.fileCard(hard({ title: "Keys" }), BODY, { ...AGENT, force: true }).card.meta.id;
    const d = tampered.store.fileCard(hard({ title: "Logs" }), BODY, { ...AGENT, force: true }).card.meta.id;
    const rels = [tampered.service.answer(tampered.store, { card: c, response: "accept" }), tampered.service.answer(tampered.store, { card: d, response: "accept" })];
    proveTogether(tampered.store, passkey, rels, (proofs) => proofs.map((p) => ({ ...p, batch: p.batch!.slice(0, 1) })));
    // Answers that don't count never reach the record (P15): the cards are unanswered there, and the merge gate fails.
    expect(tampered.store.uncounted()).toEqual([
      { file: rels[0], why: "its passkey proof doesn't check: its challenge isn't the digest of its batch" },
      { file: rels[1], why: "its passkey proof doesn't check: its batch doesn't list the file's digest, so the passkey didn't confirm this file" },
    ]);
    commit(tampered.dir, tampered.store, `Rotate the keys\n\nBaesian-Card: ${c}\nBaesian-Card: ${d}`);
    const t = verify(tampered.repo, "main", { merge: true, pinned: tampered.service.pinned(passkey) });
    expect(t.ok).toBe(false);
    expect(t.merge?.problems.map((p) => p.card).sort()).toEqual([c, d].sort());
  });

  it("fails a commit whose record holds a key CI doesn't pin, and doesn't count what that key signed", () => {
    const { dir, store, repo, service } = branched();
    const forger = new TestService("forged");
    forger.link(store);
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    forger.answer(store, { card: id, response: "accept" });
    // On this machine the record's copy is all there is, so the forged key passes: the gap CI's pin closes (D142).
    expect(store.status(id)).toBe("resolved");
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    const local = verify(repo, "main", { merge: true, pinned: null });
    expect(local.ok).toBe(true);
    expect(cited(local.warnings)?.join()).toContain("the service's keys come from the record, which a commit can change: in CI, pin them in its protected settings (BAESIAN_TRUST, D142)");
    const ci = verify(repo, "main", { merge: true, pinned: service.pinned() });
    expect(ci.ok).toBe(false);
    expect(cited(ci.commits[0]?.trust)).toEqual([expect.stringContaining("trust/service-forged.json isn't pinned in CI, or differs from the pinned copy (D142)")]);
    expect(ci.merge?.problems[0]).toMatchObject({ card: id, problem: "unanswered" });
  });

  it("fails a passkey key in the record that CI doesn't pin, until it's added by hand (D159)", () => {
    const { dir, store, repo, service } = branched();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    commit(dir, store, "Enrol a passkey");
    expect(cited(verify(repo, "main", { merge: false, pinned: service.pinned() }).commits[0]?.trust)).toEqual([
      expect.stringContaining(
        "gus's passkey, isn't pinned in CI, or differs from the pinned copy (D159). If it's yours, or that of someone you added to the project (B-9e7cn), add its line to BAESIAN_TRUST (`baesian ci` prints them all); if it's nobody's you know, someone else added it: remove it and find out how.",
      ),
    ]);
    expect(verify(repo, "main", { merge: false, pinned: service.pinned(passkey) }).ok).toBe(true);
  });

  it("checks with the record's copy when nothing is pinned, and says to pin it", () => {
    const { dir, store, repo } = branched();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    const r = verify(repo, "main", { merge: true, pinned: null });
    expect(r.hosted?.keys).toBe("record");
    expect(r.merge?.problems[0]).toMatchObject({ card: id, problem: "unanswered" });
  });

  it("rechecks the relay's gate record: a held card is settled only with the service's own draw (D158)", () => {
    const { dir, store, repo, service } = branched();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    service.preferences(store, { mode: "enforce", row_dependency: "agent-decides", rate_agent_decides: 0, burn_in: 0 }, { passkey });
    const held = store.fileCard(draft({ touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    service.gate(store, held);
    const forged = store.fileCard(draft({ title: "The cache", topic: "storage/cache", touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    const other = new TestService("other");
    service.gate(store, forged, { tamper: { draw_proof: signMessage(other.privateKey, Buffer.from("anything"), "baesian-draw", { bare: true }) } });
    const ungated = store.fileCard(draft({ title: "The queue", topic: "storage/queue", touches: ["dependency"] }), BODY, AGENT).card.meta.id;
    commit(dir, store, `Add the stores\n\nBaesian-Card: ${held}\nBaesian-Card: ${forged}\nBaesian-Card: ${ungated}`);
    const r = verify(repo, "main", { merge: true, pinned: service.pinned(passkey) });
    expect(cited(r.merge?.notes)?.join()).toContain(`${held} is held: the gate let its agent go ahead (D150)`);
    expect(r.merge?.problems).toEqual([
      expect.objectContaining({ card: forged, problem: "gate", message: expect.stringContaining("its draw proof is signed by a key that isn't trusted") }),
      expect.objectContaining({ card: ungated, problem: "unanswered" }),
    ]);
  });

  it("reads the pin from BAESIAN_TRUST, or the file BAESIAN_TRUST_FILE names, and stops on one it can't read", async () => {
    const { dir, store, service } = branched();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept" });
    commit(dir, store, `Use SQLite\n\nBaesian-Card: ${id}`);
    const verifyIt = () => run(dir, ["verify", "--base", "main", "--merge"]);
    process.env[TRUST_ENV] = service.pin();
    let r = await verifyIt();
    expect(r.code).toBe(0);
    expect(r.out).toContain("hosted:  only answers the service signed count, checked with the keys CI pins");
    delete process.env[TRUST_ENV];
    writeFileSync(join(dir, "..", "pin.jsonl"), `# the service's key\n${service.pin()}\n`);
    process.env[TRUST_FILE_ENV] = join(dir, "..", "pin.jsonl");
    expect((await verifyIt()).code).toBe(0);
    process.env[TRUST_ENV] = new TestService().pin();
    delete process.env[TRUST_FILE_ENV];
    r = await verifyIt();
    expect(r.code).toBe(1);
    expect(r.out).toContain("trust/service-test-1.json isn't pinned in CI");
    for (const [name, value, says] of [
      [TRUST_ENV, " ", "BAESIAN_TRUST is set but empty, as GitHub Actions gives a variable that isn't set: run `baesian ci` in the linked repo, and set it to the lines it prints"],
      [TRUST_ENV, "{not json", "BAESIAN_TRUST, line 1, isn't JSON"],
      [TRUST_ENV, JSON.stringify({ type: "passkey-key" }), "BAESIAN_TRUST, line 1 is not valid"],
      [TRUST_FILE_ENV, join(dir, "missing.jsonl"), "can't be read"],
    ] as const) {
      delete process.env[TRUST_ENV];
      delete process.env[TRUST_FILE_ENV];
      process.env[name] = value;
      r = await verifyIt();
      expect(r.code, value).toBe(1);
      expect(r.err, value).toContain(says);
    }
  });

  it("reads pinned keys as trust files' JSON, from either setting or both, and needs the service's key among them", () => {
    const { dir } = repo();
    const service = new TestService();
    const passkey = new TestPasskey();
    expect(pinnedTrust({ [TRUST_ENV]: service.pin() })?.service.map((k) => k.key)).toEqual(["test-1"]);
    expect(pinnedTrust({})).toBeUndefined();
    expect(parseTrust(JSON.stringify(passkey.keyFile()), "the pin").passkeys).toHaveLength(1);
    expect(() => pinnedTrust({ [TRUST_ENV]: JSON.stringify(passkey.keyFile()) })).toThrow(BadTrust);
    expect(() => pinnedTrust({ [TRUST_ENV]: JSON.stringify(passkey.keyFile()) })).toThrow("BAESIAN_TRUST pins no service key");
    writeFileSync(join(dir, "service.jsonl"), service.pin());
    const both = pinnedTrust({ [TRUST_ENV]: JSON.stringify(passkey.keyFile()), [TRUST_FILE_ENV]: join(dir, "service.jsonl") });
    expect([both?.service.length, both?.passkeys.length, both?.project]).toEqual([1, 1, "proj-test"]);
  });

  it("needs the repo's project pinned beside the keys, one project, as a line of its own (B-mar8x)", () => {
    const service = new TestService();
    const keys = JSON.stringify(service.serviceKey());
    expect(projectLine("p-c81yx9gdvfr9yjsfdsrp")).toBe('{"type":"project","format":1,"project":"p-c81yx9gdvfr9yjsfdsrp"}');
    expect(pinnedTrust({ [TRUST_ENV]: `${projectLine("proj-test")}\n${keys}` })?.project).toBe("proj-test");
    // Keys with no project: the check fails, saying how to fix it.
    expect(() => pinnedTrust({ [TRUST_ENV]: keys })).toThrow(BadTrust);
    expect(() => pinnedTrust({ [TRUST_ENV]: keys })).toThrow("BAESIAN_TRUST pins no project: CI must pin the repo's project beside its keys, so a commit can't link the repo to another; run `baesian ci` in the linked repo");
    // Two projects, in one setting or across both: which is the repo's can't be told.
    expect(() => pinnedTrust({ [TRUST_ENV]: `${projectLine("proj-a")}\n${projectLine("proj-b")}\n${keys}` })).toThrow("names project proj-b, but the pin already names proj-a");
    const { dir } = repo();
    writeFileSync(join(dir, "pin.jsonl"), `${projectLine("proj-b")}\n`);
    expect(() => pinnedTrust({ [TRUST_ENV]: `${projectLine("proj-a")}\n${keys}`, [TRUST_FILE_ENV]: join(dir, "pin.jsonl") })).toThrow("a pin names one project");
    // A project's line in a newer format is refused by name (D157), as a key's is.
    expect(() => parseTrust(JSON.stringify({ type: "project", format: 2, project: "proj-a" }), "the pin")).toThrow("pinned project format 2");
  });

  it("fails a commit whose config names another project than CI pins, and HEAD's too (B-mar8x)", () => {
    const { dir, store, repo, service } = branched();
    store.setLink({ service: ORIGIN, project: "p-0000000000000000000a", first_commit: sh(dir, "rev-list", "--max-parents=0", "HEAD") });
    commit(dir, store, "Point the repo elsewhere\n\nBaesian-Ack: infra:.baesian/config.json moving it");
    const r = verify(repo, "main", { merge: false, pinned: service.pinned() });
    expect(r.ok).toBe(false);
    expect(cited(r.commits[0]?.trust)).toEqual([expect.stringContaining(".baesian/config.json names project p-0000000000000000000a, but CI pins project proj-test (B-mar8x)")]);
    expect(describeVerify(r).join("\n")).toContain("run `baesian ci` and update BAESIAN_TRUST");
    // A pin given without a project stops the run too.
    expect(() => verify(repo, "main", { merge: false, pinned: { ...service.pinned(), project: undefined } as never })).toThrow("pins no project");
  });
});

describe("the commit gate on your machine, in a hosted repo", () => {
  it("copies into the record only answers that count, with their signatures and proofs, and the keys", () => {
    const { store, service } = hosted();
    const passkey = new TestPasskey();
    const enrolled = service.enrol(store, passkey);
    const id = store.fileCard(hard(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const signed = service.answer(store, { card: id, response: "accept" }, { passkey });
    const added = store.syncRecord();
    expect(added.filter((f) => f.startsWith("verdicts/")).sort()).toEqual([signed, `${signed}.sig`, signed.replace(/\.json$/, ".passkey.json")].sort());
    expect(added).toEqual(expect.arrayContaining(["trust/service-test-1.json", enrolled, `${enrolled}.sig`]));
    expect(Store.overRecord(openRepo(store.repo.toplevel), store.record, { pinned: service.pinned(passkey) }).status(id)).toBe("resolved");
  });

  it("blocks a commit on a hard card answered only on the machine", async () => {
    const { dir, store, service } = hosted();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    const id = store.fileCard(hard(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    writeFileSync(join(dir, "msg"), `Harden the sessions\n\nBaesian-Card: ${id}\n`);
    const blocked = await run(dir, ["check", "--message", "msg"]);
    expect(blocked.code).toBe(1);
    expect(blocked.out).toContain(`${id} is hard and isn't resolved yet`);
    service.answer(store, { card: id, response: "accept" }, { passkey });
    expect((await run(dir, ["check", "--message", "msg"])).code).toBe(0);
  });
});
