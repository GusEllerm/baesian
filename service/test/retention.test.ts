import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiState } from "../../src/api.js";
import { renderDoc } from "../../src/frontmatter.js";
import { type RelayEntry, ledgerBody, readRelayEntry } from "../../src/schema.js";
import { MemoryStorage } from "../../src/storage.js";
import { type Store, mergeFile } from "../../src/store.js";
import type { ProjectRelay } from "../src/index.js";
import { RETENTION, RetentionLedger, cardOfPath, delivered, due } from "../src/retention.js";
import { type Person, machineLogin, signUp } from "./browser.js";
import { call, fileCard, machineStore } from "./client.js";

// Retention on the relay (M9f), as B-9jqt4 ("Keep it 30 days after delivery") and B-ec3kj ("90 days, then only its
// metadata") decided: an answered card's text goes 30 days after every machine signed in to the project has been sent its
// last entry; a held card nobody answers loses its text 90 days after it arrived; everything else keeps it. What stays is
// each log entry without its body, and the card's ID, times, size and level, which the website lists. The clock is the
// test's; each sweep is run as the object's alarm runs it.

const DAY = 86_400_000;
const MINUTE = 60_000;

let now: number;
const at = (t: number) => {
  now = t;
  vi.setSystemTime(t);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Ahead of the real clock, so no alarm the relay sets comes due by itself.
  at(Date.UTC(2027, 2, 1, 9));
});
afterEach(() => vi.useRealTimers());

let n = 0;
interface Owner {
  project: string;
  person: Person;
  grants: Record<string, { access: string; grant: string }>;
  store: Store;
}

/** A person with a project of their own and machines signed in to it. */
async function owner(machines = ["laptop"]): Promise<Owner> {
  n += 1;
  const project = `p-keep-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const person = await signUp();
  const grants: Owner["grants"] = {};
  for (const m of machines) grants[m] = await machineLogin(person, project, m);
  return { project, person, grants, store: machineStore(new MemoryStorage(), project) };
}

const stub = (o: Owner) => env.PROJECTS.get(env.PROJECTS.idFromName(o.project));
const inObject = <T>(o: Owner, fn: (relay: ProjectRelay, state: DurableObjectState) => T | Promise<T>) => runInDurableObject(stub(o), fn as (i: ProjectRelay, s: DurableObjectState) => Promise<T>);

/** A machine uploads what its store holds of a card, revisions first, as the CLI's sync does; straight to the object, so a token's hour doesn't matter. */
async function upload(o: Owner, id: string, machine = "laptop"): Promise<void> {
  const mem = o.store.storage as MemoryStorage;
  const paths = mem.paths().filter((p) => (p.startsWith(`cards/${id}/`) || p.startsWith(`attachments/${id}-`)) && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  const order = (p: string) => (/\/r\d+\.md$/.test(p) ? 0 : 1);
  for (const p of paths.sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const r = await inObject(o, (relay) => relay.upload(o.project, p, mem.read(p)!, machine));
    expect(r.status, `${p}: ${JSON.stringify(r.body)}`).toBeLessThan(300);
  }
}

async function file(o: Owner, over: Record<string, unknown> = {}): Promise<string> {
  const id = fileCard(o.store, { touches: ["schema"], ...over });
  await upload(o, id);
  return id;
}

/** The person answers on the website. */
async function answer(o: Owner, input: Record<string, unknown>): Promise<void> {
  const r = await o.person.browser.post(`/v1/projects/${o.project}/verdicts`, { revision: 1, response: "accept", ...input });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
}

/** A machine reads the whole log, as `baesian sync` pulls it, noted by its grant. */
async function pull(o: Owner, machine = "laptop"): Promise<RelayEntry[]> {
  const r = await inObject(o, (relay) => relay.log(o.project, 0, 1000, o.grants[machine]!.grant));
  return (r.body as { entries: unknown[] }).entries.map(readRelayEntry);
}

/** The machines stay signed in: each used now, as a sync uses its grant. */
async function keepSignedIn(o: Owner, ...machines: string[]): Promise<void> {
  for (const m of machines.length ? machines : Object.keys(o.grants)) {
    await env.ACCOUNTS!.prepare("UPDATE grants SET last_used = ? WHERE id = ?").bind(new Date(now).toISOString(), o.grants[m]!.grant).run();
  }
}

/** Retention's daily look, as the object's alarm runs it. */
const sweep = (o: Owner) => inObject(o, (relay) => relay.sweep(o.project, now));
const state = async (o: Owner) => (await inObject(o, (relay) => relay.state(o.project))).body as ApiState;
const entriesOf = (entries: RelayEntry[], id: string) => entries.filter((e) => cardOfPath(e.path) === id);
const sent = (o: Owner) => inObject(o, (_r, s) => new RetentionLedger(s.storage.sql).sentTo());

describe("the rules, as pure functions", () => {
  it("knows which card a path belongs to", () => {
    expect(cardOfPath("cards/B-7f3kq/r1.md")).toBe("B-7f3kq");
    expect(cardOfPath("cards/B-7f3kq/gate-r1-relay.json")).toBe("B-7f3kq");
    expect(cardOfPath("verdicts/20270301T090000.000Z-B-7f3kq-r1-ab12.json")).toBe("B-7f3kq");
    expect(cardOfPath("verdicts/20270301T090000.000Z-B-7f3kq-r1-ab12.passkey.json")).toBe("B-7f3kq");
    expect(cardOfPath("attachments/B-7f3kq-ab12.json")).toBe("B-7f3kq");
    expect(cardOfPath("waiting/B-7f3kq-ab12.json")).toBe("B-7f3kq");
    expect(cardOfPath("ledger/B-7f3kq-ab12.md")).toBe("B-7f3kq");
    for (const p of ["rules/R-ab12.md", "topics/alias-x.json", "preferences/20270301T090000.000Z-ab.json", "decks/hosted.md", "trust/service-relay-1.json", `merges/${"c".repeat(40)}-0123456789ab.json`]) expect(cardOfPath(p)).toBeUndefined();
  });

  it("delivered: every machine signed in now was sent the entry, and at least one was", () => {
    expect(delivered(5, ["a", "b"], new Map([["a", 5], ["b", 9]]))).toBe(true);
    expect(delivered(5, ["a", "b"], new Map([["a", 5]]))).toBe(false);
    // A machine no longer signed in doesn't hold it back; one that was sent it still counts.
    expect(delivered(5, ["b"], new Map([["a", 5], ["b", 4]]))).toBe(false);
    expect(delivered(5, [], new Map([["a", 5]]))).toBe(true);
    // An answer no machine was ever sent isn't delivered, even with none signed in.
    expect(delivered(5, [], new Map([["a", 4]]))).toBe(false);
  });

  it("due: answered 30 days after delivery, held 90 days after arriving, the rest never", () => {
    const t = Date.UTC(2027, 0, 1);
    expect(due({ ended: "answered", delivered: true, deliveredAt: t, arrived: t }, t + 30 * DAY - 1)).toBe(false);
    expect(due({ ended: "answered", delivered: true, deliveredAt: t, arrived: t }, t + 30 * DAY)).toBe(true);
    expect(due({ ended: "answered", delivered: false, deliveredAt: t, arrived: t }, t + 300 * DAY)).toBe(false);
    expect(due({ ended: "held", delivered: false, deliveredAt: undefined, arrived: t }, t + 90 * DAY - 1)).toBe(false);
    expect(due({ ended: "held", delivered: false, deliveredAt: undefined, arrived: t }, t + 90 * DAY)).toBe(true);
    expect(due({ ended: undefined, delivered: true, deliveredAt: t, arrived: t }, t + 1000 * DAY)).toBe(false);
    // A withdrawn card, as an answered one (B-dsqyd).
    expect(RETENTION.withdrawnMs).toBe(30 * DAY);
    expect(due({ ended: "withdrawn", delivered: true, deliveredAt: t, arrived: t }, t + 30 * DAY - 1)).toBe(false);
    expect(due({ ended: "withdrawn", delivered: true, deliveredAt: t, arrived: t }, t + 30 * DAY)).toBe(true);
    expect(due({ ended: "withdrawn", delivered: false, deliveredAt: t, arrived: t }, t + 1000 * DAY)).toBe(false);
  });
});

describe("an answered card (B-9jqt4)", () => {
  it("keeps its text until every machine has the answer, then 30 days; then only its ID, times, sizes and level", async () => {
    const o = await owner(["laptop", "desktop"]);
    const t0 = now;
    const answered = await file(o, { title: "Where the access token lives" });
    const open = await file(o);
    await answer(o, { card: answered });
    // The laptop pulls through the Worker, with its grant's token: noted by its grant.
    const r = await call("GET", "log?after=0", { as: { headers: { authorization: `Bearer ${o.grants.laptop!.access}` } }, project: o.project });
    expect(r.status).toBe(200);
    const head = ((await r.json()) as { head: number }).head;
    expect((await sent(o)).get(o.grants.laptop!.grant)).toBe(head);

    // The desktop hasn't pulled: nothing goes, however long.
    at(t0 + 29 * DAY);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 29 * DAY + 1);
    await pull(o, "desktop");
    // Delivered now: 30 days from here, not from the answer.
    expect(await sweep(o)).toEqual([]);
    at(t0 + 58 * DAY);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    expect((await state(o)).cards.map((c) => c.meta.id)).toContain(answered);

    at(t0 + 59 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([answered]);

    // The log keeps every entry, without its body: path, size, digest, machine and time.
    const entries = await pull(o);
    const gone = entriesOf(entries, answered);
    expect(gone.map((e) => e.path).some((p) => p.startsWith("verdicts/"))).toBe(true);
    expect(gone.map((e) => e.path)).toContain(`cards/${answered}/r1.md`);
    for (const e of gone) {
      expect(e.body, e.path).toBeUndefined();
      expect(e.sig, e.path).toBeUndefined();
      expect(e.size).toBeGreaterThan(0);
      expect(e.digest).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(JSON.stringify(gone)).not.toContain("access token");
    // The other card keeps everything.
    for (const e of entriesOf(entries, open)) expect(e.body, e.path).toBeDefined();
    const files = await inObject(o, (_r, s) => s.storage.sql.exec<{ path: string; bytes: ArrayBuffer }>("SELECT path, bytes FROM files").toArray());
    expect(files.filter((f) => cardOfPath(f.path) === answered)).toEqual([]);
    expect(files.some((f) => Buffer.from(f.bytes).toString("utf8").includes("access token"))).toBe(false);

    // The website's state: the card isn't among the cards, and is listed without its text.
    const s = await state(o);
    expect(s.cards.map((c) => c.meta.id)).toEqual([open]);
    expect(s.cards[0]!.status).toBe("open");
    expect(s.removed).toEqual([{ id: answered, revision: 1, level: "provisional", ended: "answered", filed: expect.any(String), settled: expect.any(String), removed: new Date(now).toISOString() }]);
    expect(JSON.stringify(s)).not.toContain("access token");
  });

  it("a changed answer starts the 30 days again", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    await answer(o, { card: id });
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 20 * DAY);
    await keepSignedIn(o);
    // Changed on the website (D81): a new answer, a new last entry, not yet delivered.
    await answer(o, { card: id, response: "alternative", choice: "the other one" });
    at(t0 + 31 * DAY);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 61 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([id]);
  });

  it("an answer no machine was ever sent keeps its card's text, even with no machine signed in", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    await answer(o, { card: id });
    at(t0 + 200 * DAY);
    expect(await sweep(o)).toEqual([]);
    expect((await state(o)).cards.map((c) => c.meta.id)).toEqual([id]);
  });

  it("waits while removing it would change another card: one built on it, returned when it chose otherwise", async () => {
    const o = await owner();
    const t0 = now;
    const parent = await file(o);
    const child = fileCard(o.store, { touches: ["schema"], depends_on: [parent] });
    await upload(o, child);
    // Choosing the alternative on the parent returns the card built on it (D80): its status rests on the parent's answer.
    at(t0 + MINUTE);
    await answer(o, { card: parent, response: "alternative", choice: "the other one" });
    expect((await state(o)).cards.find((c) => c.meta.id === child)!.status).toBe("returned");
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 31 * DAY);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    const s = await state(o);
    expect(s.cards.find((c) => c.meta.id === parent)!.status).toBe("resolved");
    expect(s.cards.find((c) => c.meta.id === child)!.status).toBe("returned");
    expect(s.removed).toBeUndefined();
  });
});

describe("the commits that cite a card, and merges (D181)", () => {
  it("a ledger entry goes with its card's text, without putting off the day; a merge goes once all its cards have; one with none stays", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    const other = await file(o);
    await answer(o, { card: id });
    await pull(o);
    // The daily look notes when the answer was delivered: the 30 days run from there.
    expect(await sweep(o)).toEqual([]);
    const put = async (path: string, text: string) => {
      const r = await inObject(o, (relay) => relay.upload(o.project, path, new TextEncoder().encode(text), "laptop"));
      expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(201);
    };
    // Ten days on, a commit cites the answered card: its ledger entry arrives, after the answer.
    at(t0 + 10 * DAY);
    await keepSignedIn(o);
    const commit = "c".repeat(40);
    const ledger = `ledger/${id}-abcde.md`;
    await put(ledger, renderDoc({ type: "ledger", format: 1, card: id, branch: "feat/x", commit, at: new Date(now).toISOString() }, ledgerBody(commit, id)));
    const merge = (sha: string, cards: string[]) => ({ path: mergeFile(sha, "feat/x", "main"), text: JSON.stringify({ type: "merge", format: 1, branch: "feat/x", into: "main", commit: sha, at: new Date(now).toISOString(), cards }) });
    const both = merge("d".repeat(40), [id, other]);
    const mine = merge("e".repeat(40), [id]);
    const none = merge("f".repeat(40), []);
    for (const m of [both, mine, none]) await put(m.path, m.text);
    await pull(o);
    expect((await state(o)).commits).toEqual([{ commit, branch: "feat/x", card: id, at: new Date(now).toISOString() }]);
    // Thirty days after the answer was delivered, not after the commit: the card's text goes, its ledger entry with it.
    at(t0 + 30 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([id]);
    const files = await inObject(o, (_r, s) => s.storage.sql.exec<{ path: string }>("SELECT path FROM files").toArray().map((f) => f.path));
    expect(files).not.toContain(ledger);
    // The merge that brought only that card goes too; one that brought a card still kept stays, as does one with none.
    expect(files).not.toContain(mine.path);
    expect(files).toEqual(expect.arrayContaining([both.path, none.path]));
    const s = await state(o);
    expect(s.commits).toEqual([]);
    expect(s.merges?.map((m) => m.commit).sort()).toEqual(["d".repeat(40), "f".repeat(40)]);
    // Their log entries stay, without their bodies.
    const entries = await pull(o);
    for (const p of [ledger, mine.path]) expect(entries.find((e) => e.path === p)?.body, p).toBeUndefined();
  });

  it("a merge that brought commits citing cards (B-w41p7) goes once their ledger entries have, with those cards' text, and its own cards'", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    const other = await file(o);
    await answer(o, { card: id });
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    const put = async (path: string, text: string) => {
      const r = await inObject(o, (relay) => relay.upload(o.project, path, new TextEncoder().encode(text), "laptop"));
      expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(201);
    };
    at(t0 + 10 * DAY);
    await keepSignedIn(o);
    // One commit cites the answered card, another the card still waiting.
    const cites = { [id]: "1".repeat(40), [other]: "2".repeat(40) };
    for (const [card, commit] of Object.entries(cites)) {
      await put(`ledger/${card}-abcde.md`, renderDoc({ type: "ledger", format: 1, card, branch: "feat/x", commit, at: new Date(now).toISOString() }, ledgerBody(commit, card)));
    }
    const merge = (sha: string, cards: string[], commits: string[]) => ({ path: mergeFile(sha, "feat/x", "main"), text: JSON.stringify({ type: "merge", format: 1, branch: "feat/x", into: "main", commit: sha, tip: sha, at: new Date(now).toISOString(), cards, commits }) });
    // A later fast-forward that brought only the commit citing the answered card; one that brought both commits; and one
    // that brought the answered card and the commit citing the waiting one.
    const followUp = merge("a".repeat(40), [], [cites[id]!]);
    const both = merge("b".repeat(40), [], [cites[id]!, cites[other]!]);
    const crossed = merge("9".repeat(40), [id], [cites[other]!]);
    for (const m of [followUp, both, crossed]) await put(m.path, m.text);
    expect((await state(o)).merges?.find((m) => m.commit === "a".repeat(40))).toMatchObject({ tip: "a".repeat(40), cards: [], commits: [cites[id]] });
    at(t0 + 30 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([id]);
    const files = await inObject(o, (_r, s) => s.storage.sql.exec<{ path: string }>("SELECT path FROM files").toArray().map((f) => f.path));
    expect(files).not.toContain(followUp.path);
    expect(files).toEqual(expect.arrayContaining([both.path, crossed.path]));
    expect((await state(o)).merges?.map((m) => m.commit).sort()).toEqual(["9".repeat(40), "b".repeat(40)]);
  });

  it("a merge of commits whose ledger entries the relay never held stays while the project does: it ties to no card's text (B-15v62)", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    await answer(o, { card: id });
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    const put = async (path: string, text: string) => {
      const r = await inObject(o, (relay) => relay.upload(o.project, path, new TextEncoder().encode(text), "laptop"));
      expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(201);
    };
    // Found by a pull of commits whose ledger entries another machine committed in git, and which never came here; and
    // one that also brought the answered card.
    const merge = (sha: string, cards: string[]) => ({ path: mergeFile(sha, "feat/x", "main"), text: JSON.stringify({ type: "merge", format: 1, branch: "feat/x", into: "main", commit: sha, tip: sha, at: new Date(now).toISOString(), cards, commits: ["8".repeat(40), "6".repeat(40)] }) });
    const loose = merge("7".repeat(40), []);
    const withCard = merge("5".repeat(40), [id]);
    for (const m of [loose, withCard]) await put(m.path, m.text);
    // The next daily look keeps both.
    at(t0 + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    expect((await state(o)).merges?.map((m) => m.commit).sort()).toEqual(["5".repeat(40), "7".repeat(40)]);
    // Thirty days on, the answered card's text goes; neither merge can be tied to commits whose entries went, so both stay.
    at(t0 + 30 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([id]);
    at(t0 + 400 * DAY);
    await keepSignedIn(o);
    await sweep(o);
    expect((await state(o)).merges?.map((m) => m.commit).sort()).toEqual(["5".repeat(40), "7".repeat(40)]);
    // Sent again, it's there already, with its bytes.
    const again = await inObject(o, (relay) => relay.upload(o.project, loose.path, new TextEncoder().encode(loose.text), "laptop"));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ unchanged: true });
    expect((await pull(o)).find((e) => e.path === loose.path)?.body).toBeDefined();
  });

  it("a merge of commits whose ledger entries go in two sweeps goes once the last of its commits' has", async () => {
    const o = await owner();
    const t0 = now;
    const a = await file(o);
    const b = await file(o);
    await answer(o, { card: a });
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    const put = async (path: string, text: string) => {
      const r = await inObject(o, (relay) => relay.upload(o.project, path, new TextEncoder().encode(text), "laptop"));
      expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(201);
    };
    const cites = { [a]: "3".repeat(40), [b]: "4".repeat(40) };
    for (const [card, commit] of Object.entries(cites)) await put(`ledger/${card}-abcde.md`, renderDoc({ type: "ledger", format: 1, card, branch: "feat/x", commit, at: new Date(now).toISOString() }, ledgerBody(commit, card)));
    const path = mergeFile("5".repeat(40), "feat/x", "main");
    await put(path, JSON.stringify({ type: "merge", format: 1, branch: "feat/x", into: "main", commit: "5".repeat(40), tip: "5".repeat(40), at: new Date(now).toISOString(), cards: [], commits: [cites[a], cites[b]] }));
    // b is answered twenty days on, and delivered.
    at(t0 + 20 * DAY);
    await keepSignedIn(o);
    await answer(o, { card: b });
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    // a's text goes first: b's commit is still cited, so the merge stays.
    at(t0 + 30 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([a]);
    expect((await state(o)).merges?.map((m) => m.commit)).toEqual(["5".repeat(40)]);
    // b's text goes 30 days after it was delivered: both commits' entries were here and went, so the merge goes too.
    at(t0 + 50 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([b]);
    expect((await state(o)).merges ?? []).toEqual([]);
  });
});

describe("what a machine sends for a card whose text went", () => {
  it("the same file again is taken as already there, other bytes refused, and anything new for the card is gone (410)", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    await answer(o, { card: id });
    await pull(o);
    await sweep(o);
    at(t0 + 31 * DAY);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([id]);
    const mem = o.store.storage as MemoryStorage;
    const path = `cards/${id}/r1.md`;
    const again = await inObject(o, (relay) => relay.upload(o.project, path, mem.read(path)!, "laptop"));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ unchanged: true, entry: { path } });
    const other = await inObject(o, (relay) => relay.upload(o.project, path, new TextEncoder().encode("---\nother\n---\n"), "laptop"));
    expect(other.status).toBe(409);
    // A withdrawal, after the fact.
    o.store.withdraw(id, "no longer needed", "claude-code");
    const late = mem.paths().find((p) => p === `cards/${id}/withdrawn.json`)!;
    const r = await inObject(o, (relay) => relay.upload(o.project, late, mem.read(late)!, "laptop"));
    expect(r.status).toBe(410);
    expect(r.body).toMatchObject({ removed: true });
    // And the text never comes back.
    expect((await state(o)).cards).toEqual([]);
  });
});

describe("cards that keep their text, and a withdrawn one (B-dsqyd)", () => {
  it("an open card and a returned one keep it, however long; a withdrawn one goes 30 days after the withdrawal is delivered", async () => {
    const o = await owner();
    const t0 = now;
    const open = await file(o);
    const returned = await file(o);
    const withdrawn = await file(o, { title: "A plan given up" });
    await answer(o, { card: returned, response: "question", comment: "Which machines write runs?" });
    o.store.withdraw(withdrawn, "superseded by another plan", "claude-code");
    await upload(o, withdrawn);
    await pull(o);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 30 * DAY - MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 30 * DAY + MINUTE);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([withdrawn]);
    at(t0 + 400 * DAY);
    await keepSignedIn(o);
    expect(await sweep(o)).toEqual([]);
    const s = await state(o);
    expect(Object.fromEntries(s.cards.map((c) => [c.meta.id, c.status]))).toEqual({ [open]: "open", [returned]: "returned" });
    expect(s.removed).toEqual([expect.objectContaining({ id: withdrawn, ended: "withdrawn" })]);
    expect(JSON.stringify(s)).not.toContain("A plan given up");
  });
});

describe("a held card nobody answers (B-ec3kj)", () => {
  /** The person lets dependency cards past them, with the passkey (D163), and with no audits drawn; or, `rate` 1, every one drawn. */
  async function holdDependencies(o: Owner, rate: number, replaces?: string): Promise<string> {
    const post = (path: string, json: unknown) => o.person.browser.post(`/v1/projects/${o.project}/${path}`, json);
    const r = await post("preferences", { ...(replaces ? { replaces } : {}), mode: "enforce", row_dependency: "agent-decides", burn_in: 0, rate_agent_decides: rate });
    if (r.status === 201) return r.body.name as string;
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    // Asked for alone, and confirmed by one tap (B-a6xpc).
    const asked = await post("batches", { pending: [r.body.passkey.pending] });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    const done = await post("proofs", { batch: asked.body.passkey.batch, response: o.person.passkey.sign(asked.body.passkey.challenge) });
    expect(done.body.answers?.[0]?.status, JSON.stringify(done.body)).toBe(201);
    return done.body.answers[0].body.name as string;
  }

  it("loses its text 90 days after it arrived, delivered or not; an audit and an open card keep theirs; the burn-in still counts it", async () => {
    const o = await owner();
    const t0 = now;
    const prefs = await holdDependencies(o, 0);
    const held = await file(o, { touches: ["dependency"], title: "Which date library" });
    // Tighter needs no passkey: from here every held card is drawn as an audit.
    await holdDependencies(o, 1, prefs);
    const audit = await file(o, { touches: ["dependency"] });
    const open = await file(o, { touches: ["schema"] });
    let s = await state(o);
    expect(s.cards.find((c) => c.meta.id === held)).toMatchObject({ status: "held" });
    expect(s.cards.find((c) => c.meta.id === audit)).toMatchObject({ status: "held", audit: true });

    at(t0 + 90 * DAY - MINUTE);
    expect(await sweep(o)).toEqual([]);
    at(t0 + 90 * DAY + MINUTE);
    expect(await sweep(o)).toEqual([held]);
    s = await state(o);
    expect(s.cards.map((c) => c.meta.id).sort()).toEqual([audit, open].sort());
    expect(s.removed).toEqual([expect.objectContaining({ id: held, ended: "held", level: "provisional", revision: 1 })]);
    expect(JSON.stringify(s)).not.toContain("Which date library");

    // The burn-in counts the held card whose gate record went: the next held card's record says two came before it.
    expect(await inObject(o, (_r, st) => new RetentionLedger(st.storage.sql).heldEarlier("dependency", "relay"))).toBe(1);
    const next = await file(o, { touches: ["dependency"] });
    s = await state(o);
    expect(s.cards.find((c) => c.meta.id === next)!.gate).toMatchObject({ outcome: "held", held_before: 2 });
  });
});

describe("the object's alarm", () => {
  it("is set after a write, and looks at retention once a day", async () => {
    const o = await owner();
    const t0 = now;
    const id = await file(o);
    await answer(o, { card: id });
    await pull(o);
    const alarm = await inObject(o, (_r, s) => s.storage.getAlarm());
    expect(alarm).not.toBeNull();
    // Its first look, then every day.
    at(alarm!);
    expect(await runDurableObjectAlarm(stub(o))).toBe(true);
    const next = await inObject(o, (_r, s) => s.storage.getAlarm());
    expect(next).toBe(alarm! + RETENTION.everyMs);
    at(t0 + 32 * DAY);
    await keepSignedIn(o);
    await inObject(o, (_r, s) => s.storage.setAlarm(now));
    expect(await runDurableObjectAlarm(stub(o))).toBe(true);
    expect((await state(o)).removed?.map((r) => r.id)).toEqual([id]);
  });
});
