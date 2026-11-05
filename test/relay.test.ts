import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { agentKind, beforeLinkingKind } from "../service/src/uploads.js";
import type { runProgram } from "../src/ci.js";
import { buildMcpServer } from "../src/mcp.js";
import { main } from "../src/cli.js";
import { renderDoc, parseDoc } from "../src/frontmatter.js";
import { grantPath, readGrant, writeGrant } from "../src/login.js";
import type { MachineGrant } from "../src/schema.js";
import { NAMESPACE, signMessage } from "../src/sshsig.js";
import { runHook } from "../src/hooks.js";
import { Store, mergeFile } from "../src/store.js";
import { RELAY_STATE, agentWritten, linkProblem, unsent, unsentBeforeLinking } from "../src/sync.js";
import { projectLine } from "../src/trust.js";
import { cleanup, draftFile, repo, sh } from "./helpers.js";
import { type LocalRelay, relayAvailable, startRelay } from "./relay-harness.js";
import { TestPasskey, TestService } from "./service.js";

// M9d: the CLI against the real relay, the service's own Worker run locally in workerd (test/relay-harness.ts): signing a
// machine in, refreshing and revoking its grant, linking a repo, pushing and pulling, a revision revised elsewhere, a
// new card's ID taken elsewhere, offline, pre-commit's timeout, `baesian wait` hearing an answer over the relay's socket,
// and the first-commit check (B-5gnea). Tokens are the service's own, made for each run; none is ever printed.

const saved = process.env.BAESIAN_CONFIG;
const home = realpathSync(mkdtempSync(join(tmpdir(), "baesian-home-")));
let relay: LocalRelay;

beforeAll(async () => {
  // This machine's personal config folder, where `baesian login` keeps its grants (B-gq8j1).
  process.env.BAESIAN_CONFIG = join(home, "config.json");
  if (relayAvailable) relay = await startRelay();
}, 120_000);

afterAll(async () => {
  await relay?.dispose();
  process.env.BAESIAN_CONFIG = saved;
  rmSync(home, { recursive: true, force: true });
});

afterEach(() => cleanup());

/** Run the CLI in a repo, with a login whose code the test approves as the person (or refuses) when it's shown. */
async function run(cwd: string, args: string[], opts: { stdin?: string; fetch?: typeof fetch; approve?: "yes" | "no"; signal?: AbortSignal; exec?: typeof runProgram } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  let approval: Promise<void> = Promise.resolve();
  const io = {
    out: (l: string) => {
      out.push(l);
      const code = /the code ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(l)?.[1];
      if (code) approval = opts.approve === "no" ? relay.deny(code) : relay.approve(code);
    },
    err: (l: string) => err.push(l),
    stdin: () => opts.stdin ?? "",
    cwd,
    notify: () => {},
    sleep: async () => {
      await approval;
    },
    http: { ...(opts.fetch ? { fetch: opts.fetch } : {}), ...(opts.signal ? { signal: opts.signal } : {}) },
    // `baesian ci --github` runs gh: a test gives a stand-in, and never runs gh for real.
    run: opts.exec ?? (() => {
      throw new Error("a test ran another program without a stand-in");
    }),
  };
  const code = await main(["node", "baesian", ...args], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** A fetch that never reaches anything, as offline. */
const offline: typeof fetch = async () => {
  throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
};

/** A repo whose config names the relay and a project, not yet with its first commit: `baesian login` records it. */
function linkedRepo(project: string) {
  const r = repo();
  const config = join(r.store.record, "config.json");
  writeFileSync(config, `${JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), service: relay.url, project }, null, 2)}\n`);
  return r;
}

/** A repo linked to a project, and this machine signed in to it. */
async function signedIn(project: string) {
  const r = linkedRepo(project);
  const login = await run(r.dir, ["login", "--machine", "test-machine"]);
  expect(login.code, login.err).toBe(0);
  return r;
}

/** The relay's log, as a machine reads it: the paths of every entry. */
async function relayPaths(project: string): Promise<string[]> {
  const grant = readGrant(project)!;
  const r = await fetch(`${relay.url}/v1/projects/${project}/log?after=0`, { headers: { authorization: `Bearer ${grant.access_token}` } });
  return ((await r.json()) as { entries: { path: string }[] }).entries.map((e) => e.path);
}

const fileCard = async (dir: string, overrides: Record<string, unknown> = {}, extra: string[] = []) => {
  const r = await run(dir, ["file", "-", "--json", ...extra], { stdin: draftFile(overrides) });
  expect(r.code, r.err).toBe(0);
  return JSON.parse(r.out).card.meta.id as string;
};

describe.skipIf(!relayAvailable)("the CLI against the real relay (M9d)", () => {
  describe("signing a machine in (B-84e0d, B-gq8j1, B-t5wxr)", () => {
    it("links an unlinked repo and signs in through the device flow, printing the gate's ack; the grant file is only yours", async () => {
      const { dir, store } = repo();
      const r = await run(dir, ["login", "--service", relay.url, "--machine", "laptop"]);
      expect(r.code, r.err).toBe(0);
      const c = store.config();
      expect(c.service).toBe(relay.url);
      expect(c.project).toMatch(/^p-[0-9a-z]{20}$/);
      expect(c.first_commit).toBe(sh(dir, "rev-list", "--max-parents=0", "HEAD"));
      expect(r.out).toContain(`Baesian-Ack: infra:.baesian/config.json linked this repo to ${relay.url} as project ${c.project}`);
      expect(r.out).toContain(`signed in: laptop can now file cards and hear answers in project ${c.project}`);
      const grant = readGrant(c.project!)!;
      expect(grant).toMatchObject({ type: "grant", format: 1, service: relay.url, project: c.project, machine: "laptop" });
      expect(statSync(grantPath(c.project!)).mode & 0o777).toBe(0o600);
      // No token is ever printed.
      for (const t of [grant.access_token, grant.refresh_token]) expect(`${r.out}\n${r.err}`).not.toContain(t);
      // An empty project's relay has nothing yet: its first write puts the service's key in its log.
      expect(r.out).toContain("relay: received 0 files, sent 0");
      expect(r.out).not.toContain("relay: sending");
      // The command it prints commits the link with its ack, which the commit gate takes as covering it (B-w4g6c).
      const command = /^ {2}git add (\S+) && git commit -m "([^"]+)" -m "([^"]+)"$/m.exec(r.out);
      expect(command, r.out).not.toBeNull();
      sh(dir, "add", command![1]!);
      writeFileSync(join(dir, "message.txt"), `${command![2]}\n\n${command![3]}\n`);
      const check = await run(dir, ["check", "--message", "message.txt"]);
      expect(check.code, check.out).toBe(0);
      expect(check.out).toContain("decisions covered: infra:.baesian/config.json (ack)");
      // Signing in again needs a sign-out first.
      const again = await run(dir, ["login"]);
      expect(again.out).toContain("already signed in");
    });

    it("writes nothing when the person refuses the machine", async () => {
      const { dir, store } = repo();
      const r = await run(dir, ["login", "--service", relay.url], { approve: "no" });
      expect(r.code).toBe(1);
      expect(r.err).toContain("the person refused this machine");
      expect(store.config().project).toBeUndefined();
    });

    it("refreshes a token that expired, writing the new pair first; a refresh token used twice revokes the grant", async () => {
      const { dir } = await signedIn("proj-1");
      const before = readGrant("proj-1")!;
      writeGrant({ ...before, access_expires: new Date(Date.now() - 1000).toISOString() });
      const synced = await run(dir, ["sync"]);
      expect(synced.code, synced.err).toBe(0);
      expect(synced.out).toContain("relay: received");
      const after = readGrant("proj-1")!;
      expect(after.access_token).not.toBe(before.access_token);
      expect(after.refresh_token).not.toBe(before.refresh_token);
      expect(Date.parse(after.access_expires)).toBeGreaterThan(Date.now());
      // Someone holding the old refresh token uses it: the service revokes the grant (RFC 9700).
      const reuse = await fetch(`${relay.url}/v1/machines/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: before.refresh_token, client_id: "baesian-cli" }).toString(),
      });
      expect(reuse.status).toBe(400);
      const next = await run(dir, ["sync"]);
      expect(next.err).toContain("Ask the person to run `baesian login` here");
      expect(existsSync(grantPath("proj-1"))).toBe(false);
    });

    it("signs out: revokes the grant on the service and deletes the file", async () => {
      const { dir } = await signedIn("proj-3");
      const r = await run(dir, ["logout"]);
      expect(r.code, r.err).toBe(0);
      expect(r.out).toContain("signed out: revoked this machine's grant for project proj-3");
      expect(existsSync(grantPath("proj-3"))).toBe(false);
      const row = await relay.db.prepare("SELECT revoked FROM grants WHERE project = ? ORDER BY created DESC").bind("proj-3").first<{ revoked: string | null }>();
      expect(row?.revoked).toBeTruthy();
    });
  });

  describe("the ledger and merges (D181)", () => {
    it("go up from the clone that found them and come down to another; a commit's subject never leaves, and an entry listing files stays", async () => {
      const a = await signedIn("proj-d181");
      sh(a.dir, "add", "-A");
      sh(a.dir, "commit", "-q", "-m", "Link");
      // A card on a branch, a commit citing it, and the branch merged: the hooks write the ledger's entry and the merge.
      sh(a.dir, "checkout", "-q", "-b", "feat/runs");
      const id = await fileCard(a.dir, { title: "The run-metadata store", touches: [] });
      Store.open(a.dir).syncRecord();
      writeFileSync(join(a.dir, "runs.txt"), "runs\n");
      sh(a.dir, "add", "-A");
      sh(a.dir, "commit", "-q", "-m", `Secret subject: the acquisition talks\n\nThe body says more.\n\nBaesian-Card: ${id}`);
      const cited = sh(a.dir, "rev-parse", "HEAD");
      const quiet = { out: () => {}, err: () => {} };
      await runHook(Store.open(a.dir), "post-commit", [], quiet);
      sh(a.dir, "checkout", "-q", "main");
      sh(a.dir, "merge", "-q", "--no-ff", "--no-edit", "feat/runs");
      const merged = sh(a.dir, "rev-parse", "HEAD");
      const said: string[] = [];
      // post-merge sends what it found at once, as briefly as pre-commit pulls.
      await runHook(Store.open(a.dir), "post-merge", ["0"], { out: () => {}, err: (l) => said.push(l) });
      expect(said.join("\n")).toContain("recorded feat/runs merged into main, with 1 card");
      const store = Store.open(a.dir);
      const entry = store.ledgerEntries().find((e) => e.meta.commit === cited)!;
      expect(entry.meta).toMatchObject({ card: id, branch: "feat/runs" });
      const ledgerPath = `ledger/${readdirSync(join(store.live, "ledger")).find((f) => f.startsWith(id))}`;
      const mergePath = mergeFile(merged, "feat/runs");
      expect(await relayPaths("proj-d181")).toEqual(expect.arrayContaining([ledgerPath, mergePath]));
      // An entry written before D120 lists the commit's files: it stays on this machine.
      const legacy = `ledger/${id}-old01.md`;
      store.storage.create(legacy, new TextEncoder().encode(renderDoc({ type: "ledger", format: 1, card: id, branch: "feat/runs", commit: cited, at: new Date().toISOString() }, `Commit \`${cited.slice(0, 12)}\` builds on ${id}.\n\n- src/secret-path.ts\n`)));
      expect(unsent(store, new Set())).not.toContain(legacy);
      const synced = await run(a.dir, ["sync"]);
      expect(synced.code, synced.err).toBe(0);
      expect(await relayPaths("proj-d181")).not.toContain(legacy);
      // What the relay holds of them: no subject, no message, no file.
      const grant = readGrant("proj-d181")!;
      const log = (await (await fetch(`${relay.url}/v1/projects/proj-d181/log?after=0`, { headers: { authorization: `Bearer ${grant.access_token}` } })).json()) as { entries: { path: string; body?: string }[] };
      const theirs = log.entries.filter((e) => e.path.startsWith("ledger/") || e.path.startsWith("merges/"));
      expect(theirs.map((e) => e.path).sort()).toEqual([ledgerPath, mergePath].sort());
      for (const e of theirs) expect(Buffer.from(e.body!, "base64").toString()).not.toMatch(/Secret subject|acquisition|body says|secret-path/);
      const merge = JSON.parse(Buffer.from(theirs.find((e) => e.path === mergePath)!.body!, "base64").toString());
      expect(merge).toEqual({ type: "merge", format: 1, branch: "feat/runs", into: "main", commit: merged, at: expect.any(String), cards: [id] });
      // The relay's state carries them, for the website's panel.
      const state = (await (await fetch(`${relay.url}/v1/projects/proj-d181/state`, { headers: { authorization: `Bearer ${grant.access_token}` } })).json()) as { merges: unknown[]; commits: unknown[] };
      expect(state.merges).toEqual([{ branch: "feat/runs", into: "main", commit: merged, at: merge.at, cards: [id] }]);
      expect(state.commits).toEqual([{ commit: cited, branch: "feat/runs", card: id, at: entry.meta.at }]);

      // Another clone pulls them into its live layer, as if it had found them.
      const b = join(realpathSync(mkdtempSync(join(tmpdir(), "baesian-clone-"))), "b");
      sh(tmpdir(), "clone", "-q", a.dir, b);
      Store.open(b).init();
      const pulled = await run(b, ["sync"]);
      expect(pulled.code, pulled.err).toBe(0);
      const there = Store.open(b);
      expect(there.merges()).toEqual([merge]);
      expect(there.ledgerEntries().map((e) => e.meta.commit)).toEqual([cited]);
      // Finding the same merge again there writes nothing new, and sends nothing.
      expect(there.writeMerge({ branch: "feat/runs", into: "main", commit: merged, at: new Date().toISOString(), cards: [id] })).toBeUndefined();
      const again = await run(b, ["sync"]);
      expect(again.out).toContain("sent 0");
      rmSync(join(b, ".."), { recursive: true, force: true });
    });
  });

  describe("pushing and pulling (Hosted Service section 1)", () => {
    it("pushes a filed card, and another clone pulls it; a person's answer comes down signed, and counts", async () => {
      const a = await signedIn("proj-2");
      const id = await fileCard(a.dir, { title: "The run-metadata store", level: "blocking" });
      expect(await relayPaths("proj-2")).toEqual(expect.arrayContaining([`decks/branch-main.md`, `cards/${id}/r1.md`, `cards/${id}/gate-r1-cli.json`]));
      const state = JSON.parse(readFileSync(join(a.store.live, RELAY_STATE), "utf8"));
      expect(state).toMatchObject({ type: "relay", format: 1, service: relay.url, project: "proj-2" });
      expect(state.uploaded).toEqual(expect.arrayContaining([`cards/${id}/r1.md`, "decks/branch-main.md"]));
      // A second clone on this machine: the same grant, its own live layer.
      const b = join(realpathSync(mkdtempSync(join(tmpdir(), "baesian-clone-"))), "b");
      sh(a.dir, "add", "-A");
      sh(a.dir, "commit", "-q", "-m", "link");
      sh(tmpdir(), "clone", "-q", a.dir, b);
      const bStore = Store.open(b);
      bStore.init();
      const pulled = await run(b, ["sync"]);
      expect(pulled.code, pulled.err).toBe(0);
      expect(bStore.card(id)?.meta.title).toBe("The run-metadata store");
      expect(bStore.trustFiles().service).toHaveLength(1);
      expect(existsSync(join(bStore.live, "cards", id, "gate-r1-relay.json.sig"))).toBe(true);
      // The person answers on the website: the answer comes down to the first clone, signed, and counts there.
      expect((await relay.person("proj-2", "POST", "verdicts", { card: id, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      const inbox = await run(a.dir, ["inbox"]);
      expect(inbox.code, inbox.err).toBe(0);
      expect(inbox.out).toContain(`${id} r1  accept by gus (a person)`);
      expect(a.store.status(id)).toBe("resolved");
      expect(a.store.uncounted()).toEqual([]);
      rmSync(join(b, ".."), { recursive: true, force: true });
    });

    it("sends everything an agent wrote when a repo is first linked: cards, revisions, decks and the rest (B-6k0rk)", async () => {
      const { dir, store } = repo();
      const kept = store.fileCard(draftFileFields({ title: "Kept" }), "", { agent: "claude-code" }).card.meta.id;
      const gone = store.fileCard(draftFileFields({ title: "Gone", topic: "storage/other" }), "", { agent: "claude-code" }).card.meta.id;
      store.withdraw(gone, "no longer needed", "claude-code");
      const before = unsent(store, new Set());
      expect(before).toEqual(expect.arrayContaining(["decks/branch-main.md", `cards/${kept}/r1.md`, `cards/${gone}/withdrawn.json`]));
      const config = join(store.record, "config.json");
      writeFileSync(config, `${JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), service: relay.url, project: "proj-4" })}\n`);
      const r = await run(dir, ["login"]);
      expect(r.code, r.err).toBe(0);
      // It says how many before it starts: a repo with a history of cards sends hundreds.
      expect(r.out).toContain(`relay: sending ${before.length} files to ${relay.url}…`);
      expect(r.out).toContain(`sent ${before.length}`);
      expect(await relayPaths("proj-4")).toEqual(expect.arrayContaining(before));
      // Decks went first, then the revisions, then the rest.
      expect(before[0]).toBe("decks/branch-main.md");
      expect(before.indexOf(`cards/${gone}/withdrawn.json`)).toBeGreaterThan(before.indexOf(`cards/${kept}/r1.md`));
    });

    it("tells the agent when a revision was revised elsewhere first, and takes the relay's (409)", async () => {
      const a = await signedIn("proj-5");
      const id = await fileCard(a.dir, { title: "Contested" });
      expect((await relay.person("proj-5", "POST", "verdicts", { card: id, revision: 1, response: "reject", comment: "Say more.", client: "hosted-desktop" })).status).toBe(201);
      // A second clone on this machine has it, returned.
      sh(a.dir, "add", "-A");
      sh(a.dir, "commit", "-q", "-m", "link");
      const b = `${a.dir}-b`;
      sh(tmpdir(), "clone", "-q", a.dir, b);
      const bStore = Store.open(b);
      bStore.init();
      await run(b, ["sync"]);
      await run(a.dir, ["inbox"]);
      expect(bStore.status(id)).toBe("returned");
      // B revises while offline; A revises online, first.
      const offlineRevise = await run(b, ["revise", id, "-"], { stdin: draftFile({ title: "Contested", proposal: "B's answer" }), fetch: offline });
      expect(offlineRevise.code, offlineRevise.err).toBe(0);
      expect(offlineRevise.err).toContain("relay: couldn't reach");
      const onlineRevise = await run(a.dir, ["revise", id, "-"], { stdin: draftFile({ title: "Contested", proposal: "A's answer" }) });
      expect(onlineRevise.code, onlineRevise.err).toBe(0);
      // Back online, B's r2 is refused: the agent is told, and A's r2 replaces it.
      const back = await run(b, ["sync"]);
      expect(back.err).toContain(`relay: ${id} r2 was revised on another machine first`);
      expect(bStore.card(id)?.meta.proposal).toBe("A's answer");
      expect(readFileSync(join(b, ".baesian", "cards", id, "r2.md"), "utf8")).toBe(readFileSync(join(a.store.live, "cards", id, "r2.md"), "utf8"));
      rmSync(b, { recursive: true, force: true });
    });

    it("files a new card again under a new ID when another machine's card took its ID on the relay (409)", async () => {
      const a = await signedIn("proj-6");
      const taken = await fileCard(a.dir, { title: "A's card" });
      sh(a.dir, "add", "-A");
      sh(a.dir, "commit", "-q", "-m", "link");
      const b = `${a.dir}-b`;
      sh(tmpdir(), "clone", "-q", a.dir, b);
      const bStore = Store.open(b);
      bStore.init();
      // B files offline, and its card happens to get the ID A's has: written here as if it had.
      const theirs = await run(b, ["file", "-", "--json"], { stdin: draftFile({ title: "B's card", topic: "storage/b" }), fetch: offline });
      const own = JSON.parse(theirs.out).card.meta.id as string;
      for (const f of bStore.storage.list(`cards/${own}`)) {
        const text = Buffer.from(bStore.storage.read(`cards/${own}/${f}`)!).toString("utf8").replaceAll(own, taken);
        bStore.storage.remove(`cards/${own}/${f}`);
        bStore.storage.create(`cards/${taken}/${f}`, Buffer.from(text));
      }
      rmSync(join(b, ".baesian", "cards", own), { recursive: true, force: true });
      const back = await run(b, ["sync"]);
      const renamed = new RegExp(`relay: ${taken} was already taken on the relay by another machine's card, so yours is filed again as (B-[0-9a-z]{5})`).exec(back.err);
      expect(renamed, back.err).not.toBeNull();
      const now = renamed![1]!;
      expect(bStore.card(taken)?.meta.title).toBe("A's card");
      expect(bStore.card(now)?.meta.title).toBe("B's card");
      expect(await relayPaths("proj-6")).toEqual(expect.arrayContaining([`cards/${now}/r1.md`]));
      rmSync(b, { recursive: true, force: true });
    });

    it("copes with retention (M9f): a card the relay removed (410) isn't offered again; an answer removed before this machine had it is said", async () => {
      const a = await signedIn("proj-12");
      // Filed offline, then sent to a relay that removed this card's text: stood in for on its uploads.
      const filed = await run(a.dir, ["file", "-", "--json"], { stdin: draftFile({ title: "Long finished" }), fetch: offline });
      const id = JSON.parse(filed.out).card.meta.id as string;
      const urlOf = (input: Parameters<typeof fetch>[0]) => (input instanceof Request ? input.url : String(input));
      const removed: typeof fetch = async (input, init) =>
        init?.method === "PUT" && urlOf(input).includes(`/files/cards/${id}/`)
          ? new Response(JSON.stringify({ error: `${id}'s text was removed from the relay`, removed: true }), { status: 410, headers: { "content-type": "application/json" } })
          : fetch(input, init);
      const first = await run(a.dir, ["sync"], { fetch: removed });
      expect(first.code, first.err).toBe(0);
      expect(first.err).toContain(`relay: ${id}'s text was removed from the relay after the time it keeps it`);
      const puts: string[] = [];
      const watch: typeof fetch = async (input, init) => {
        if (init?.method === "PUT") puts.push(urlOf(input));
        return fetch(input, init);
      };
      const again = await run(a.dir, ["sync"], { fetch: watch });
      expect(again.code, again.err).toBe(0);
      expect(puts.filter((u) => u.includes(id))).toEqual([]);
      expect(again.err).not.toContain(id);

      // Another machine's answer, removed from the relay before this clone pulled it, and not in its record.
      const answered = await fileCard(a.dir, { title: "Answered meanwhile", topic: "storage/meanwhile" });
      sh(a.dir, "add", "-A");
      sh(a.dir, "commit", "-q", "-m", "link");
      const b = `${a.dir}-b`;
      sh(tmpdir(), "clone", "-q", a.dir, b);
      Store.open(b).init();
      expect((await relay.person("proj-12", "POST", "verdicts", { card: answered, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      const stripped: typeof fetch = async (input, init) => {
        const r = await fetch(input, init);
        if (!urlOf(input).includes("/log?")) return r;
        const page = (await r.json()) as { entries: Record<string, unknown>[] };
        page.entries = page.entries.map((e) => (String(e.path).startsWith("verdicts/") && String(e.path).includes(answered) ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== "body" && k !== "sig")) : e));
        return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
      };
      const pulled = await run(b, ["sync"], { fetch: stripped });
      expect(pulled.code, pulled.err).toBe(0);
      expect(pulled.err).toContain(`a file of ${answered} had been sent to the project's other machines and then removed from the relay`);
      expect(Store.open(b).status(answered)).toBe("open");
      rmSync(b, { recursive: true, force: true });
    });

    it("starts afresh when the project's log is shorter than what it pulled: deleted with its owner's account and made again (B-b46z3)", async () => {
      const a = await signedIn("proj-13");
      const id = await fileCard(a.dir, { title: "Filed before the project went" });
      const state = () => JSON.parse(readFileSync(join(a.store.live, RELAY_STATE), "utf8")) as { pulled: number; uploaded: string[] };
      expect((await run(a.dir, ["sync"])).code).toBe(0);
      expect(state().pulled).toBeGreaterThan(0);
      // The relay's log as a project made again would give it: nothing yet, at first.
      let remade = true;
      const urlOf = (input: Parameters<typeof fetch>[0]) => (input instanceof Request ? input.url : String(input));
      const fresh: typeof fetch = async (input, init) => {
        if (remade && urlOf(input).includes("/log?") && !urlOf(input).includes("after=0")) {
          remade = false;
          return new Response(JSON.stringify({ entries: [], head: 0, more: false }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return fetch(input, init);
      };
      const r = await run(a.dir, ["sync"], { fetch: fresh });
      expect(r.code, r.err).toBe(0);
      expect(r.err).toContain("is shorter than what this machine had pulled, so it was deleted and made again: this machine starts afresh");
      expect(state().uploaded).toContain(`cards/${id}/r1.md`);
      expect(await relayPaths("proj-13")).toContain(`cards/${id}/r1.md`);
    });
  });

  describe("offline, and when the relay is slow", () => {
    it("files and answers as before offline, and pushes at the next command that reaches the relay", async () => {
      const { dir } = await signedIn("proj-7");
      const filed = await run(dir, ["file", "-"], { stdin: draftFile({ title: "Filed offline" }), fetch: offline });
      expect(filed.code).toBe(0);
      expect(filed.out).toMatch(/^filed B-[0-9a-z]{5} \(provisional, deck branch-main\)/);
      expect(filed.err).toContain("relay: couldn't reach");
      expect(filed.err).toContain("what's new goes up at the next command that reaches the relay");
      const id = /^filed (B-[0-9a-z]{5})/.exec(filed.out)![1]!;
      expect(await relayPaths("proj-7")).not.toContain(`cards/${id}/r1.md`);
      // The next command that reaches the relay pushes it.
      const inbox = await run(dir, ["inbox"]);
      expect(inbox.code, inbox.err).toBe(0);
      expect(await relayPaths("proj-7")).toContain(`cards/${id}/r1.md`);
      // A quiet hook stays quiet offline, and never fails.
      const hook = await run(dir, ["inbox", "--quiet"], { fetch: offline });
      expect(hook).toMatchObject({ code: 0, out: "", err: "" });
    });

    it("pre-commit pulls for at most a few seconds, and never fails the commit", async () => {
      // A relay that takes connections and never answers.
      const hang = createServer(() => {});
      await new Promise<void>((done) => hang.listen(0, "127.0.0.1", done));
      try {
        const { dir, store } = repo();
        const service = `http://127.0.0.1:${(hang.address() as AddressInfo).port}`;
        const first = sh(dir, "rev-list", "--max-parents=0", "HEAD");
        store.setLink({ service, project: "proj-hang", first_commit: first });
        const token = () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
        const grant: MachineGrant = { type: "grant", format: 1, service, project: "proj-hang", machine: "m", access_token: token(), access_expires: new Date(Date.now() + 3_600_000).toISOString(), refresh_token: token() };
        writeGrant(grant);
        const started = Date.now();
        const r = await run(dir, ["hook", "pre-commit"]);
        const took = Date.now() - started;
        expect(r.code).toBe(0);
        expect(r.err).toContain("baesian: relay: couldn't reach");
        expect(r.err).toContain("it didn't answer in time");
        expect(took).toBeGreaterThanOrEqual(2900);
        expect(took).toBeLessThan(8000);
      } finally {
        hang.closeAllConnections();
        hang.close();
      }
    }, 20_000);
  });

  describe("waiting on the relay (B-bv49e)", () => {
    it("hears an answer over the relay's socket, with its waiting marker on the relay meanwhile", async () => {
      const { dir, store } = await signedIn("proj-8");
      const id = await fileCard(dir, { title: "Waited on", level: "blocking" });
      const waiting = run(dir, ["wait", id, "--no-presence"]);
      // The marker reaches the relay, as the website shows it.
      let seen = false;
      for (let i = 0; i < 50 && !seen; i++) {
        await new Promise((done) => setTimeout(done, 100));
        const s = (await (await relay.person("proj-8", "GET", "state")).json()) as { cards: { meta: { id: string }; waiting: { agent: string; stale: boolean }[] }[] };
        seen = s.cards.find((c) => c.meta.id === id)?.waiting.some((w) => !w.stale) ?? false;
      }
      expect(seen).toBe(true);
      const answered = Date.now();
      expect((await relay.person("proj-8", "POST", "verdicts", { card: id, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      const r = await waiting;
      expect(r.code, r.err).toBe(0);
      expect(r.out).toContain(`${id} resolved by gus (a person)`);
      expect(Date.now() - answered).toBeLessThan(5000);
      expect(store.status(id)).toBe("resolved");
      // The marker is gone from the relay.
      const s = (await (await relay.person("proj-8", "GET", "state")).json()) as { cards: { meta: { id: string }; waiting: unknown[] }[] };
      expect(s.cards.find((c) => c.meta.id === id)?.waiting).toEqual([]);
    }, 30_000);

    /** Which of the cards the website shows an agent waiting on now. */
    const waitingOnRelay = async (project: string, ids: string[]) => {
      const s = (await (await relay.person(project, "GET", "state")).json()) as { cards: { meta: { id: string }; waiting: { stale: boolean }[] }[] };
      return Object.fromEntries(ids.map((id) => [id, s.cards.find((c) => c.meta.id === id)?.waiting.some((w) => !w.stale) ?? false]));
    };

    it("waits with no time limit on two cards, hearing both answers over the socket, and ends when both are in (B-xnae9)", async () => {
      const { dir, store } = await signedIn("proj-14");
      const a = await fileCard(dir, { title: "Where runs live", topic: "relay/runs", level: "blocking" }, ["--new"]);
      const b = await fileCard(dir, { title: "Which queue carries jobs", topic: "relay/queue" }, ["--new"]);
      let ended = false;
      const waiting = run(dir, ["wait", a, b, "--until-answered"]).finally(() => (ended = true));
      // Both markers reach the relay, as the website shows them.
      await expect.poll(() => waitingOnRelay("proj-14", [a, b]), { timeout: 5000 }).toEqual({ [a]: true, [b]: true });
      expect((await relay.person("proj-14", "POST", "verdicts", { card: a, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      // The first answer is heard: its card's marker goes, and the wait goes on for the other.
      await expect.poll(() => waitingOnRelay("proj-14", [a, b]), { timeout: 5000 }).toEqual({ [a]: false, [b]: true });
      expect(store.status(a)).toBe("resolved");
      expect(ended).toBe(false);
      const answered = Date.now();
      expect((await relay.person("proj-14", "POST", "verdicts", { card: b, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      const r = await waiting;
      expect(r.code, r.err).toBe(0);
      expect(Date.now() - answered).toBeLessThan(5000);
      expect(r.out.split("\n")[0]).toBe(`Every card you waited on has an answer: ${a} and ${b}.`);
      expect(r.out).toContain(`${a} resolved by gus (a person)`);
      expect(r.out).toContain(`${b} resolved by gus (a person)`);
      expect(await waitingOnRelay("proj-14", [a, b])).toEqual({ [a]: false, [b]: false });
    }, 30_000);

    it("with no time limit, starts offline all the same, and sends its card and hears the answer once the relay answers (B-xnae9)", async () => {
      const { dir, store } = await signedIn("proj-15");
      const filed = await run(dir, ["file", "-"], { stdin: draftFile({ title: "Filed offline", topic: "relay/offline" }), fetch: offline });
      const id = /^filed (B-[0-9a-z]{5})/.exec(filed.out)![1]!;
      expect(await relayPaths("proj-15")).not.toContain(`cards/${id}/r1.md`);
      // The wait's first sync can't reach the relay; everything after can.
      let calls = 0;
      const flaky: typeof fetch = (input, init) => (calls++ === 0 ? offline(input, init) : fetch(input, init));
      const waiting = run(dir, ["wait", id, "--until-answered"], { fetch: flaky });
      await expect.poll(() => relayPaths("proj-15"), { timeout: 10_000 }).toContain(`cards/${id}/r1.md`);
      expect((await relay.person("proj-15", "POST", "verdicts", { card: id, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      const r = await waiting;
      expect(r.code, r.err).toBe(0);
      expect(r.out).toContain(`${id} resolved by gus (a person)`);
      expect(r.err).toContain("relay: couldn't reach");
      expect(store.status(id)).toBe("resolved");
    }, 30_000);
  });

  describe("the local MCP server (D128, P18 section 8)", () => {
    async function connect(dir: string) {
      const [ours, theirs] = InMemoryTransport.createLinkedPair();
      const handle = serveStdio(() => buildMcpServer({ cwd: dir, notify: () => {}, env: {} }), { transport: theirs });
      const client = new Client({ name: "claude-code", version: "1.0.0" }, { versionNegotiation: { mode: "legacy" } });
      await client.connect(ours);
      return {
        async call(name: string, args: Record<string, unknown>) {
          const r = await client.callTool({ name, arguments: args });
          return { text: (r.content as { text: string }[]).map((c) => c.text).join("\n"), data: r.structuredContent as Record<string, unknown>, isError: r.isError === true };
        },
        async close() {
          await client.close();
          await handle.close();
        },
      };
    }

    it("syncs as the CLI does, with the grant `baesian login` made, and its tools are the same twelve", async () => {
      const { dir, store } = await signedIn("proj-9");
      const mcp = await connect(dir);
      try {
        const filed = await mcp.call("file_card", draftFileFields({ title: "Filed through MCP", level: "blocking" }));
        expect(filed.isError, filed.text).toBe(false);
        const id = (filed.data.card as { meta: { id: string } }).meta.id;
        expect(await relayPaths("proj-9")).toContain(`cards/${id}/r1.md`);
        expect((await relay.person("proj-9", "POST", "verdicts", { card: id, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
        const inbox = await mcp.call("check_inbox", {});
        expect(inbox.text).toContain(`${id} r1  accept by gus (a person)`);
        expect(store.status(id)).toBe("resolved");
        // In a hosted repo, a card that looks like it holds a secret is refused, with its own code (B-jfkv9).
        const secret = await mcp.call("file_card", draftFileFields({ title: "A key", topic: "auth/key", crux_fact: `the key is ${["AK", "IA", "Z3XQ7RT2LMPA9KDV"].join("")}` }));
        expect(secret.isError).toBe(true);
        expect((secret.data.error as { code: string }).code).toBe("looks_like_secret");
        const overridden = await mcp.call("file_card", { ...draftFileFields({ title: "A key", topic: "auth/key", crux_fact: `the key is ${["AK", "IA", "Z3XQ7RT2LMPA9KDV"].join("")}` }), secret_reason: "AWS's documented example key" });
        expect(overridden.isError, overridden.text).toBe(false);
      } finally {
        await mcp.close();
      }
    });

    it("files here when this machine isn't signed in, and its text says to ask the person to run `baesian login`", async () => {
      const { dir, store } = linkedRepo("proj-10");
      store.setLink({ service: relay.url, project: "proj-10", first_commit: sh(dir, "rev-list", "--max-parents=0", "HEAD") });
      const mcp = await connect(dir);
      try {
        const filed = await mcp.call("file_card", draftFileFields({ title: "Signed out" }));
        expect(filed.isError).toBe(false);
        expect(filed.text).toContain("relay: this machine isn't signed in to project proj-10");
        expect(filed.text).toContain("ask the person to run `baesian login` here");
        expect(store.cards()).toHaveLength(1);
      } finally {
        await mcp.close();
      }
    });
  });

  describe("the answers from before linking (B-3zjjx)", () => {
    it("go up once, at first link, and the website shows their cards as decided; another machine counts only what its record held", async () => {
      const project = "proj-11";
      const { dir, store } = repo();
      const AGENT = { agent: "claude-code", force: true };
      const answered = store.fileCard(draftFileFields({ title: "Answered before linking", topic: "early/answered" }), "", AGENT).card.meta.id;
      const open = store.fileCard(draftFileFields({ title: "Still open at linking", topic: "early/open" }), "", AGENT).card.meta.id;
      store.addVerdict({ card: answered, revision: 1, response: "accept", reviewer: "gus", client: "test" });
      store.syncRecord();
      sh(dir, "add", "-A");
      sh(dir, "commit", "-q", "-m", "Used locally");
      expect(store.answersFromBeforeLinking()).toEqual([]);

      // Linked: the first sync takes the answer up with the cards, marked as from before linking, and unsigned.
      const config = join(store.record, "config.json");
      writeFileSync(config, `${JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), service: relay.url, project }, null, 2)}\n`);
      expect(Store.open(dir).answersFromBeforeLinking()).toEqual([expect.stringMatching(new RegExp(`^verdicts/.*-${answered}-r1-`))]);
      const login = await run(dir, ["login", "--machine", "laptop"]);
      expect(login.code, login.err).toBe(0);
      const grant = readGrant(project)!;
      const log = (await (await fetch(`${relay.url}/v1/projects/${project}/log?after=0`, { headers: { authorization: `Bearer ${grant.access_token}` } })).json()) as { entries: { path: string; before_linking?: true; sig?: string }[] };
      const entry = log.entries.find((e) => e.path.startsWith("verdicts/"))!;
      expect(entry).toMatchObject({ before_linking: true });
      expect(entry.sig).toBeUndefined();
      const stateOf = async () => (await (await relay.person(project, "GET", "state")).json()) as { cards: { meta: { id: string }; status: string; before_linking?: true }[] };
      let s = await stateOf();
      expect(s.cards.find((c) => c.meta.id === answered)).toMatchObject({ status: "resolved", before_linking: true });
      expect(s.cards.find((c) => c.meta.id === open)!.status).toBe("open");
      // Nothing goes up twice.
      expect((await run(dir, ["sync"])).out).toContain("sent 0");

      // The link is committed. A forged answer, uploaded with this machine's token while nobody has answered on the website,
      // is taken by the relay (the window B-3zjjx accepted), and shown there as from before linking, but a machine whose
      // record at the linking commit doesn't hold it never counts it (B-45xz8).
      store.syncRecord();
      sh(dir, "add", "-A");
      sh(dir, "commit", "-q", "-m", "Link");
      const at = new Date().toISOString();
      const forged = { type: "verdict", format: 1, card: open, revision: 1, response: "accept", reviewer: "gus", client: "test", at };
      const put = await fetch(`${relay.url}/v1/projects/${project}/files/verdicts/${at.replace(/[-:]/g, "")}-${open}-r1-abcde.json`, {
        method: "PUT",
        headers: { authorization: `Bearer ${readGrant(project)!.access_token}` },
        body: `${JSON.stringify(forged, null, 2)}\n`,
      });
      expect(put.status).toBe(201);
      s = await stateOf();
      expect(s.cards.find((c) => c.meta.id === open)).toMatchObject({ status: "resolved", before_linking: true });
      const other = `${dir}-clone`;
      sh(dir, "clone", "-q", dir, other);
      try {
        Store.open(other).init();
        const synced = await run(other, ["sync"]);
        expect(synced.code, synced.err).toBe(0);
        const there = Store.open(other);
        expect(there.status(answered)).toBe("resolved");
        expect(there.status(open)).toBe("open");
        expect(there.uncounted().map((u) => u.file)).toEqual([expect.stringMatching(new RegExp(`^verdicts/.*-${open}-r1-abcde\\.json$`))]);
      } finally {
        rmSync(other, { recursive: true, force: true });
      }

      // Someone answers on the website: from then on, this machine offers nothing more from before linking.
      const third = await fileCard(dir, { title: "Answered on the website", topic: "late/web" });
      expect((await relay.person(project, "POST", "verdicts", { card: third, revision: 1, response: "accept", client: "hosted-desktop" })).status).toBe(201);
      await run(dir, ["sync"]);
      const after = Store.open(dir);
      expect(after.answersFromBeforeLinking().length).toBe(1);
      expect(unsentBeforeLinking(after, new Set())).toEqual([]);
    });
  });

  describe("a copy of a repo isn't the repo (B-5gnea)", () => {
    it("stops a template-style copy from syncing with the original's project, and `baesian login` links it to its own", async () => {
      const original = await signedIn("proj-1x");
      const config = readFileSync(join(original.store.record, "config.json"), "utf8");
      // A new repo made from the files, with a history of its own, as a GitHub template makes one.
      const copy = repo();
      sh(copy.dir, "commit", "-q", "--amend", "--allow-empty", "-m", "the copy's own first commit");
      writeFileSync(join(copy.store.record, "config.json"), config);
      const filed = await run(copy.dir, ["file", "-"], { stdin: draftFile({ title: "In the copy" }) });
      expect(filed.code).toBe(0);
      expect(filed.err).toContain("it's a copy of that repo, such as one made from a template, not the repo itself");
      expect(await relayPaths("proj-1x")).not.toContain(expect.stringMatching(/In the copy/));
      expect(existsSync(join(copy.store.live, RELAY_STATE))).toBe(false);
      const login = await run(copy.dir, ["login"]);
      expect(login.code, login.err).toBe(0);
      expect(login.out).toContain("this checkout is a copy of another repo");
      expect(copy.store.config().project).not.toBe("proj-1x");
      expect(copy.store.config().first_commit).toBe(sh(copy.dir, "rev-list", "--max-parents=0", "HEAD"));
    });
  });

  describe("setting up CI: `baesian ci` (B-pt52b)", () => {
    it("syncs, then prints the service it read the keys from, the pin's lines and the steps; --github sets it with gh", async () => {
      const { dir, store } = await signedIn("proj-ci");
      // The relay sends its key with the project's first file, and nothing's been filed yet.
      const early = await run(dir, ["ci"]);
      expect(early.code).toBe(1);
      expect(early.err).toContain("the relay sends it with the project's first file. File a card, then run `baesian ci` again");
      await fileCard(dir);
      // A passkey's key file as the relay writes it at enrolment, signed with its key; and one signed by another key.
      const passkey = new TestPasskey();
      // Enrolled once the relay's key was valid (from 2026-11-01), so its signature counts.
      const enrolled = "2026-11-04T12:00:00.000Z";
      const keyFile = Buffer.from(`${JSON.stringify(passkey.keyFile(enrolled), null, 2)}\n`);
      store.storage.create("trust/passkey-aaaaaaaaaaaa.json.sig", Buffer.from(signMessage(relay.signingKey, keyFile, NAMESPACE)));
      store.storage.create("trust/passkey-aaaaaaaaaaaa.json", keyFile);
      const eve = Buffer.from(`${JSON.stringify(new TestPasskey("acct-eve", "eve").keyFile(), null, 2)}\n`);
      store.storage.create("trust/passkey-bbbbbbbbbbbb.json.sig", Buffer.from(new TestService("other").signature(eve)));
      store.storage.create("trust/passkey-bbbbbbbbbbbb.json", eve);
      const calls: { command: string; args: string[]; input: string; cwd: string }[] = [];
      const r = await run(dir, ["ci", "--github"], {
        exec: (command, args, o) => {
          calls.push({ command, args, ...o });
          return { status: 0, stdout: "", stderr: "" };
        },
      });
      expect(r.code, r.err).toBe(0);
      expect(r.out).toContain(`keys read from ${relay.url}, the service .baesian/config.json names, for project proj-ci: if that isn't the service you meant, stop here`);
      const keyName = readdirSync(join(store.live, "trust")).find((f) => /^service-.+\.json$/.test(f) && !f.endsWith("-revoked.json"))!;
      const lines = [projectLine("proj-ci"), JSON.stringify(JSON.parse(readFileSync(join(store.live, "trust", keyName), "utf8"))), JSON.stringify(passkey.keyFile(enrolled))];
      expect(r.out.split("\n").filter((l) => l.startsWith("{"))).toEqual(lines);
      expect(r.out).toContain("Check each passkey is yours (gus's, added 2026-11-04): compare its line with the one the website showed when you added it, and with the passkeys on your account page, https://baesian.test/account.");
      expect(r.out).toContain("fetch-depth: 0");
      expect(r.err).toContain("left out trust/passkey-bbbbbbbbbbbb.json: it's signed by a key that isn't trusted");
      // gh gets the lines on its input, in the repo, after they're shown.
      expect(calls).toEqual([{ command: "gh", args: ["variable", "set", "BAESIAN_TRUST"], input: `${lines.join("\n")}\n`, cwd: dir }]);
      expect(r.out.split("\n").at(-1)).toBe("set the repository variable BAESIAN_TRUST with gh: 3 lines");
      // With --json, the same lines.
      const j = await run(dir, ["ci", "--json"]);
      expect(JSON.parse(j.out)).toMatchObject({ service: relay.url, project: "proj-ci", lines, passkeys: [{ handle: "gus" }] });
      // gh not on PATH: the lines are printed, and it says the variable wasn't set.
      const missing = await run(dir, ["ci", "--github"], { exec: () => ({ status: null, stdout: "", stderr: "spawn gh ENOENT", missing: true }) });
      expect(missing.code).toBe(1);
      expect(missing.out).toContain(lines[0]);
      expect(missing.err).toContain("gh isn't on PATH, so BAESIAN_TRUST wasn't set");
      // Offline, it stops: the keys must come from the service.
      const off = await run(dir, ["ci"], { fetch: offline });
      expect(off.code).toBe(1);
      expect(off.err).toContain(`couldn't sync with ${relay.url}, and CI's keys must come from it`);
      // Pointed at another service, as a commit could, it names that service, and this machine isn't signed in there.
      const config = join(store.record, "config.json");
      writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), service: "https://elsewhere.example" }));
      const elsewhere = await run(dir, ["ci"]);
      expect(elsewhere.code).toBe(1);
      expect(elsewhere.err).toContain("this machine isn't signed in to project proj-ci on https://elsewhere.example: run `baesian login` first");
    });
  });
});

/** A draft's fields, as `Store.fileCard` takes them. */
function draftFileFields(overrides: Record<string, unknown>): Record<string, unknown> {
  return parseDoc(draftFile(overrides)).meta as Record<string, unknown>;
}

describe("the first-commit check in a shallow clone (B-5gnea)", () => {
  it("is skipped, since a shallow clone can't see its first commit; linking one is refused", async () => {
    const { dir, store } = repo();
    sh(dir, "commit", "-q", "--allow-empty", "-m", "second");
    sh(dir, "commit", "-q", "--allow-empty", "-m", "third");
    const first = sh(dir, "rev-list", "--max-parents=0", "HEAD");
    store.setLink({ service: "https://baesian.example", project: "proj-shallow", first_commit: first });
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "link");
    const shallow = `${dir}-shallow`;
    sh(tmpdir(), "clone", "-q", "--depth", "1", `file://${dir}`, shallow);
    const s = Store.open(shallow);
    s.init();
    expect(sh(shallow, "rev-parse", "--is-shallow-repository")).toBe("true");
    expect(linkProblem(s)).toBeUndefined();
    // A full copy whose history starts elsewhere fails the check.
    const other = repo();
    sh(other.dir, "commit", "-q", "--amend", "--allow-empty", "-m", "another history");
    other.store.setLink({ service: "https://baesian.example", project: "proj-shallow", first_commit: first });
    expect(linkProblem(other.store)).toContain("it's a copy of that repo");
    // Linking needs the first commit, which a shallow clone can't see.
    const unlinked = `${dir}-shallow-2`;
    sh(tmpdir(), "clone", "-q", "--depth", "1", `file://${other.dir}`, unlinked);
    const u = Store.open(unlinked);
    u.init();
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(["node", "baesian", "login", "--service", "https://baesian.example"], { out: (l) => out.push(l), err: (l) => err.push(l), stdin: () => "", cwd: unlinked, notify: () => {} });
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("which a shallow clone can't see");
    for (const d of [shallow, unlinked]) rmSync(d, { recursive: true, force: true });
  });
});

describe("what a machine pushes is what the relay takes (Hosted Service section 1)", () => {
  it("every kind the CLI pushes is one the relay's uploads accept, and nothing a person writes", () => {
    const pushed = ["decks/branch-main.md", "cards/B-7f3kq/r1.md", "cards/B-7f3kq/r2.md", "cards/B-7f3kq/gate-r1-cli.json", "cards/B-7f3kq/withdrawn.json", "cards/B-7f3kq/fallback-ab3de.json", "attachments/B-7f3kq-ab3de.json", "ledger/B-7f3kq-ab3de.md", mergeFile("a".repeat(40), "feat/x")];
    for (const p of pushed) {
      expect(agentWritten(p), p).toBe(true);
      expect(agentKind(p), p).toBeDefined();
    }
    const theirs = ["verdicts/20261104T120000.000Z-B-7f3kq-r1-ab3de.json", "rules/R-7f3kq.md", "topics/alias-ab3de.json", "preferences/20261104T120000.000Z-ab3de.json", "trust/service-relay-1.json", "cards/B-7f3kq/gate-r1-relay.json", "cards/B-7f3kq/r1.md.sig", "waiting/B-7f3kq-ab3de.json", "presence.json", RELAY_STATE];
    for (const p of theirs) expect(agentWritten(p), p).toBe(false);
    // The answers from before linking go up only through their own path, at first link (B-3zjjx), and the relay knows them.
    for (const p of theirs.slice(0, 4)) expect(beforeLinkingKind(p), p).toBeDefined();
    for (const p of theirs.slice(4)) expect(beforeLinkingKind(p), p).toBeUndefined();
  });
});
