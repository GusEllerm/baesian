import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ciPin, workflowBody, workflowSteps } from "../src/ci.js";
import { VERSION, main } from "../src/cli.js";
import { openRepo } from "../src/git.js";
import { verify } from "../src/verify.js";
import { pinnedTrust } from "../src/trust.js";
import { BODY, cleanup, draft, repo, sh } from "./helpers.js";
import { ORIGIN, TestPasskey, TestService } from "./service.js";

// B-pt52b: `baesian ci`, what a linked repo's CI needs. The lines come from the live layer the relay wrote, never the
// committed record; the command itself, which syncs first, runs against the real relay in test/relay.test.ts.

afterEach(cleanup);

const AGENT = { agent: "claude-code" };

/** A repo linked to the stand-in service, its key in the live layer as a pull writes it. */
function linked() {
  const r = repo();
  const service = new TestService();
  r.store.setLink({ service: ORIGIN, project: service.project, first_commit: sh(r.dir, "rev-list", "--max-parents=0", "HEAD") });
  service.link(r.store);
  return { ...r, service };
}

function run(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => "", cwd, notify: () => {} };
  return main(["node", "baesian", ...args], io).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

describe("the pin `baesian ci` prints (B-pt52b)", () => {
  it("is the project's line, the service's key and the passkeys it signed, each one compact line from the live layer", () => {
    const { store, service } = linked();
    const gus = new TestPasskey();
    service.enrol(store, gus);
    // A passkey key the service didn't sign, and one with no signature at all: left out, with why.
    const forged = service.enrol(store, new TestPasskey("acct-eve", "eve"), { signer: new TestService("other") });
    const unsigned = service.enrol(store, new TestPasskey("acct-eve", "eve"), { unsigned: true });
    const pin = ciPin(store, ORIGIN, service.project);
    if ("problem" in pin) throw new Error(pin.problem);
    expect(pin.lines).toEqual([
      '{"type":"project","format":1,"project":"proj-test"}',
      JSON.stringify(service.serviceKey()),
      // As the website shows it when the passkey is added (service/src/webauthn.ts, `pinLine()`).
      JSON.stringify(gus.keyFile()),
    ]);
    expect(pin.passkeys).toEqual([expect.objectContaining({ handle: "gus", account: "acct-gus", enrolled: "2026-01-01T00:00:00.000Z" })]);
    expect(pin.skipped).toEqual([
      { file: forged, why: "it's signed by a key that isn't trusted, so the service didn't write it" },
      { file: unsigned, why: "it has no signature, so the service didn't write it" },
    ].sort((a, b) => a.file.localeCompare(b.file)));
    // The lines are a pin verify reads: the project, the key and the passkey.
    expect(pinnedTrust({ BAESIAN_TRUST: pin.lines.join("\n") })).toMatchObject({ project: "proj-test", service: [service.serviceKey()], passkeys: [gus.keyFile()] });
  });

  it("never reads the committed record's keys, which a commit can change", () => {
    const { store, service } = linked();
    // A key in the record only, as a commit could add one.
    const forger = new TestService("forged");
    mkdirSync(join(store.record, "trust"), { recursive: true });
    writeFileSync(join(store.record, "trust", "service-forged.json"), `${JSON.stringify(forger.serviceKey(), null, 2)}\n`);
    const pin = ciPin(store, ORIGIN, service.project);
    if ("problem" in pin) throw new Error(pin.problem);
    expect(pin.lines.join("\n")).not.toContain(forger.publicKey);
    expect(pin.lines).toHaveLength(2);
  });

  it("says when the relay hasn't sent the service's key yet", () => {
    const { store } = repo();
    expect(ciPin(store, ORIGIN, "proj-test")).toEqual({ problem: expect.stringContaining("this machine has no key from https://baesian.test for project proj-test yet: the relay sends it with the project's first file") });
  });

  it("is what verify takes: a repo linked and committed passes with the pin it prints", () => {
    const { dir, store, service } = linked();
    const passkey = new TestPasskey();
    service.enrol(store, passkey);
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link\n\nBaesian-Ack: infra:.baesian/config.json linked");
    const id = store.fileCard(draft({ touches: ["security"], wrong_if: "tokens leak", check: "the audit log" }), BODY, AGENT).card.meta.id;
    service.answer(store, { card: id, response: "accept" }, { passkey });
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `Harden the sessions\n\nBaesian-Card: ${id}`);
    const pin = ciPin(store, ORIGIN, service.project);
    if ("problem" in pin) throw new Error(pin.problem);
    const r = verify(openRepo(dir), "HEAD~1", { merge: true, pinned: pinnedTrust({ BAESIAN_TRUST: pin.lines.join("\n") }) ?? null });
    expect(r).toMatchObject({ ok: true, hosted: { keys: "pinned", project: "proj-test" } });
  });

  it("pins the service's spare key beside its key, once, after the keys the relay sent (B-x47ek)", () => {
    const { store, service } = linked();
    const gus = new TestPasskey();
    service.enrol(store, gus);
    const spare = new TestService("relay-2");
    const pin = ciPin(store, ORIGIN, service.project, [spare.serviceKey()]);
    if ("problem" in pin) throw new Error(pin.problem);
    expect(pin.lines).toEqual(['{"type":"project","format":1,"project":"proj-test"}', JSON.stringify(service.serviceKey()), JSON.stringify(spare.serviceKey()), JSON.stringify(gus.keyFile())]);
    expect(pin.spare).toEqual(["relay-2"]);
    // Once the relay has switched to it, its key file is in the layer, and it isn't pinned twice.
    spare.link(store);
    const after = ciPin(store, ORIGIN, service.project, [spare.serviceKey()]);
    if ("problem" in after) throw new Error(after.problem);
    expect(after.lines.filter((l) => l.includes(spare.publicKey))).toHaveLength(1);
    expect(after.spare).toEqual([]);
  });

  it("keeps CI passing when the service switches to the spare it pinned, and only then (B-x47ek)", () => {
    // A rehearsal: the service answers with its key; CI pins the key and the spare; the service's key is replaced by the
    // spare, which signs the next answer; verify passes with the pin as it was. Without the spare pinned, it fails.
    const { dir, store, service } = linked();
    const spare = new TestService("relay-2");
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "Link\n\nBaesian-Ack: infra:.baesian/config.json linked");
    const first = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    service.answer(store, { card: first, response: "accept" });
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `Before the switch\n\nBaesian-Card: ${first}`);
    const withSpare = ciPin(store, ORIGIN, service.project, [spare.serviceKey()]);
    const without = ciPin(store, ORIGIN, service.project);
    if ("problem" in withSpare || "problem" in without) throw new Error("no pin");
    // The switch: the relay writes the spare's key file, as it writes any key it signs with, and signs with it.
    spare.link(store);
    const second = store.fileCard(draft({ title: "After the switch", topic: "switch/after", question: "Does the second answer come from the spare key?" }), BODY, AGENT).card.meta.id;
    const verdict = spare.answer(store, { card: second, response: "accept" });
    expect(store.judge(verdict)).toEqual({ ok: true });
    store.syncRecord();
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", `After the switch\n\nBaesian-Card: ${second}`);
    const check = (lines: string[]) => verify(openRepo(dir), "HEAD~2", { merge: true, pinned: pinnedTrust({ BAESIAN_TRUST: lines.join("\n") }) ?? null });
    expect(check(withSpare.lines)).toMatchObject({ ok: true, hosted: { keys: "pinned", project: "proj-test" } });
    const failing = check(without.lines);
    expect(failing.ok).toBe(false);
    expect(JSON.stringify(failing)).toContain("trust/service-relay-2.json isn't pinned in CI");
  });

  it("comes with the workflow's steps: the full history, and verify with the pinned variable, from npm", () => {
    const steps = workflowSteps("1.4.2").join("\n");
    expect(steps).toContain("fetch-depth: 0");
    expect(steps).toContain('run: npx --yes baesian@1.4.2 verify --base "${{ github.event.before }}"');
    expect(steps).toContain("run: npx --yes baesian@1.4.2 verify --merge");
    expect(steps.match(/BAESIAN_TRUST: \$\{\{ vars\.BAESIAN_TRUST \}\}/g)).toHaveLength(2);
  });

  it("runs the release that printed them, pinned, so a new release reaches CI only in a commit (B-c0e0d)", () => {
    const steps = workflowSteps(VERSION).join("\n");
    expect(steps.match(/npx --yes baesian@[^ ]+ verify/g)).toEqual([`npx --yes baesian@${VERSION} verify`, `npx --yes baesian@${VERSION} verify`]);
    expect(steps).not.toMatch(/npx (--yes )?baesian(@latest)? /);
    expect(steps).toContain(`# Baesian ${VERSION} from npm, pinned: the release that printed these steps. To move CI to another, run \`baesian ci\` with it, and commit the steps it prints.`);
  });

  it("are the steps the setup guide shows, in its whole workflow, for the release it names", () => {
    const guide = readFileSync(join(import.meta.dirname, "..", "docs", "setup.md"), "utf8");
    const block = /```yaml\n([\s\S]*?)```/.exec(guide.slice(guide.indexOf("## 5. Check decisions in CI")))![1]!;
    const release = /npx --yes baesian@(\S+) verify/.exec(block)![1]!;
    const steps = block.split("\n").filter((l) => l.startsWith("      ")).map((l) => l.slice(6));
    expect(steps).toEqual(workflowBody(release));
  });
});

describe("`baesian ci` says what to run first (B-pt52b)", () => {
  it("in a repo that isn't linked, and on a machine that isn't signed in", async () => {
    const { dir } = repo();
    const unlinked = await run(dir, ["ci"]);
    expect(unlinked.code).toBe(1);
    expect(unlinked.err).toBe("this repo isn't linked to the hosted service\nnext: baesian login  # first, then baesian ci");
    const { dir: other } = linked();
    const signedOut = await run(other, ["ci"]);
    expect(signedOut.code).toBe(1);
    expect(signedOut.err).toContain("this machine isn't signed in to project proj-test on https://baesian.test\nnext: baesian login  # first, then baesian ci");
    expect(signedOut.out).toBe("");
  });
});
