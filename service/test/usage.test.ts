import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "../../src/storage.js";
import { USAGE_KINDS, usageProblem } from "../../src/usage-fields.js";
import { Usage, routeOf } from "../src/usage.js";
import { WHEN } from "../src/notify.js";
import { machineLogin, signUp } from "./browser.js";
import { call, fileCard, machineStore } from "./client.js";
import { PushStandIn } from "./push-service.js";

// Usage counts (M9e step 2, D141, B-7nq85): every kind of event, recorded with only the fields src/usage-fields.ts allows,
// each from a fixed list, a number or yes/no; never what a card says, nor any name or ID; with a random usage ID per
// account and key per project, and the hour only. Opting out stops it and deletes what was kept; after 90 days only daily
// counts are kept, with no ID, key or hour.

interface Row {
  usage_id: string | null;
  project: string | null;
  kind: string;
  hour: string;
  fields: string;
}
const db = () => env.ACCOUNTS!;
const rows = async (): Promise<Row[]> => (await db().prepare("SELECT * FROM usage_events").all<Row>()).results;

let service: PushStandIn;
beforeEach(() => {
  service = new PushStandIn();
});
afterEach(() => {
  service.restore();
  vi.useRealTimers();
});

const asMachine = (access: string) => ({ headers: { authorization: `Bearer ${access}` } });

/** Upload a machine's card as the CLI does: the revision, then the rest. */
async function upload(store: ReturnType<typeof machineStore>, id: string, project: string, access: string) {
  const mem = store.storage as MemoryStorage;
  const paths = mem.paths().filter((p) => p.startsWith(`cards/${id}/`) && !p.endsWith(".sig") && !p.endsWith("-relay.json"));
  for (const p of paths.sort((a, b) => Number(/\/r\d+\.md$/.test(b)) - Number(/\/r\d+\.md$/.test(a)))) {
    const r = await call("PUT", `files/${p}`, { as: asMachine(access), project, body: mem.read(p)! });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
  }
}

describe("what's counted (B-7nq85)", () => {
  it("counts every kind of event with only its own fields, from fixed lists, and never a card's text, a name or an ID", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2027, 1, 1, 9, 30));
    const project = `p-usage-${Math.random().toString(36).slice(2, 8)}`;
    const person = await signUp({ handle: `ada-${Math.random().toString(36).slice(2, 7)}` });
    const { access } = await machineLogin(person, project, "ada-laptop");
    const b = await service.browser();
    expect((await person.browser.post("/v1/account/push", { endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } })).status).toBe(201);

    // Cards with text in every field that could carry it.
    const store = machineStore(new MemoryStorage(), project);
    const secretWords = { title: "Rotate the Stripe secret", question: "Should we rotate the payments-key now?", topic: "billing/stripe-keys" };
    const hard = fileCard(store, { ...secretWords, level: "hard", touches: ["security", "money"], reverse: "one-way", wrong_if: "The Stripe key leaks anyway", check: "Stripe dashboard logs" });
    await upload(store, hard, project, access);
    const soft = fileCard(store, { title: "Name of the cache", question: "What do we call the cache folder?", topic: "cache/naming", level: "blocking" });
    await upload(store, soft, project, access);
    // A notification goes, and is opened.
    vi.setSystemTime(Date.now() + WHEN.soonMs);
    await runDurableObjectAlarm(env.PROJECTS.get(env.PROJECTS.idFromName(project)));
    expect(service.to(b)).toHaveLength(1);
    expect((await person.browser.post("/v1/account/push/opened", { minutes_after: 7, project })).status).toBe(204);
    // A visit, twice the same day: counted once.
    for (let i = 0; i < 2; i++) expect((await person.browser.post(`/v1/projects/${project}/presence`, { client: "hosted-phone" })).status).toBe(204);
    // An answer, blind first, then switched.
    vi.setSystemTime(Date.now() + 12 * 60_000);
    const answered = await person.browser.post(`/v1/projects/${project}/verdicts`, { card: soft, revision: 1, response: "alternative", choice: "the alternative", first_choice: "proposal", client: "hosted-phone" });
    expect(answered.status, JSON.stringify(answered.body)).toBe(201);
    // A preference change, and a topic merge.
    const state = (await (await call("GET", "state", { as: asMachine(access), project })).json()) as { routing: { preferences?: { name: string } } };
    const pref = await person.browser.post(`/v1/projects/${project}/preferences`, { ...(state.routing.preferences ? { replaces: state.routing.preferences.name } : {}), row_dependency: "stop-and-ask" });
    expect(pref.status, JSON.stringify(pref.body)).toBe(201);
    expect((await person.browser.post(`/v1/projects/${project}/aliases`, { from: "cache/naming", to: "billing/stripe-keys" })).status).toBe(201);
    // A server error, by its address's name alone.
    await new Usage(db()).record(null, "error", { route: routeOf(`/v1/projects/${project}/files/cards/x`), status: 503 });

    const all = await rows();
    const kinds = all.map((r) => r.kind);
    for (const k of Object.keys(USAGE_KINDS)) expect(kinds, k).toContain(k);
    expect(kinds.filter((k) => k === "visit")).toHaveLength(1);
    const account = (await db().prepare("SELECT id, usage_id FROM accounts WHERE handle = ?").bind(person.handle).first<{ id: string; usage_id: string }>())!;
    const key = (await db().prepare("SELECT usage_key FROM projects WHERE id = ?").bind(project).first<{ usage_key: string }>())!.usage_key;
    const forbidden = [person.handle, person.email, person.account, project, `Project ${project}`, "ada-laptop", hard, soft, ...Object.values(secretWords), "Name of the cache", "cache folder", "cache/naming", "Stripe", "payments", "leaks", "dashboard", b.endpoint, "push.test", "Safari", "Mac"];
    for (const r of all) {
      expect(usageProblem(r.kind, JSON.parse(r.fields)), r.fields).toBeUndefined();
      expect(r.hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
      const text = JSON.stringify(r);
      for (const f of forbidden) expect(text, `${r.kind} holds ${f}`).not.toContain(f);
      if (r.kind === "error") expect([r.usage_id, r.project]).toEqual([null, null]);
      else {
        expect(r.usage_id).toBe(account.usage_id);
        expect(r.usage_id).not.toBe(account.id);
      }
    }
    expect(all.filter((r) => r.project).every((r) => r.project === key)).toBe(true);
    const fieldsOf = (kind: string) => all.filter((r) => r.kind === kind).map((r) => JSON.parse(r.fields));
    expect(fieldsOf("account_created")).toEqual([{ via: "email" }]);
    expect(fieldsOf("machine_approved")).toEqual([{ new_project: true }]);
    expect(fieldsOf("card_filed")).toEqual([
      { revision: 1, level: "hard", gate: "shown", touches: ["security", "money"], reverse: "one-way", harness: "claude-code", by_baesian: false },
      expect.objectContaining({ revision: 1, level: "blocking", gate: "shown", harness: "claude-code" }),
    ]);
    expect(fieldsOf("card_answered")).toEqual([{ response: "alternative", client: "phone", level: "blocking", minutes_waiting: 12, blind_match: true, switched: true, was_held: false, made_rule: false }]);
    expect(fieldsOf("preferences_changed")).toEqual([{ mode: "shadow", loosening: false, rows_changed: 1 }]);
    expect(fieldsOf("push_sent")).toEqual([{ reason: "at once", urgency: "high", cards: 2, result: "delivered" }]);
    expect(fieldsOf("push_opened")).toEqual([{ minutes_after: 7 }]);
    expect(fieldsOf("visit")).toEqual([{ client: "phone" }]);
    expect(all.find((r) => r.kind === "account_created")!.hour).toBe("2027-02-01T09");
  });

  it("leaves blind_match out for a card answered in chat first, which had no blind choice to match (B-nxhtx)", async () => {
    const project = `p-usage-${Math.random().toString(36).slice(2, 8)}`;
    const person = await signUp({ handle: `ada-${Math.random().toString(36).slice(2, 7)}` });
    const { access } = await machineLogin(person, project, "ada-laptop");
    const store = machineStore(new MemoryStorage(), project);
    const seen = fileCard(store, { answered_in_chat: "Postgres, please", proposal: "Postgres", alternative: "SQLite" });
    await upload(store, seen, project, access);
    const answered = await person.browser.post(`/v1/projects/${project}/verdicts`, { card: seen, revision: 1, response: "accept" });
    expect(answered.status, JSON.stringify(answered.body)).toBe(201);
    const key = (await db().prepare("SELECT usage_key FROM projects WHERE id = ?").bind(project).first<{ usage_key: string }>())!.usage_key;
    const events = (await rows()).filter((r) => r.project === key && r.kind === "card_answered").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ response: "accept", switched: false });
    expect(events[0]).not.toHaveProperty("blind_match");
    expect(usageProblem("card_answered", events[0]!)).toBeUndefined();
  });

  it("opting out stops counting and deletes the account's events at once; back in, it's a new ID, unlinked to before", async () => {
    const project = `p-optout-${Math.random().toString(36).slice(2, 8)}`;
    const person = await signUp();
    const { access } = await machineLogin(person, project, "laptop");
    const before = (await db().prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(person.account).first<{ usage_id: string }>())!.usage_id;
    expect((await rows()).filter((r) => r.usage_id === before).map((r) => r.kind)).toEqual(["account_created", "machine_approved"]);
    expect((await person.browser.get("/v1/account")).body.usage).toEqual({ counted: true });

    expect((await person.browser.post("/v1/account/usage", { counted: false })).body).toEqual({ counted: false });
    expect((await person.browser.get("/v1/account")).body.usage).toEqual({ counted: false });
    expect((await rows()).filter((r) => r.usage_id === before)).toEqual([]);
    // Nothing is counted while it's out: a card from its machine, a visit.
    const store = machineStore(new MemoryStorage(), project);
    await upload(store, fileCard(store), project, access);
    await person.browser.post(`/v1/projects/${project}/presence`, { client: "hosted-desktop" });
    expect((await db().prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(person.account).first<{ usage_id: string | null }>())!.usage_id).toBeNull();
    const n = (await rows()).length;
    await upload(store, fileCard(store), project, access);
    expect((await rows()).length).toBe(n);

    // Back in: counted again, under a new ID.
    await person.browser.post("/v1/account/usage", { counted: true });
    await upload(store, fileCard(store), project, access);
    const after = (await db().prepare("SELECT usage_id FROM accounts WHERE id = ?").bind(person.account).first<{ usage_id: string }>())!.usage_id;
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect((await rows()).filter((r) => r.usage_id === after).map((r) => r.kind)).toEqual(["card_filed"]);
    expect((await person.browser.post("/v1/account/usage", { counted: "no" })).status).toBe(400);
  });

  it("keeps raw events 90 days, then only daily counts, with no ID, key or hour", async () => {
    const usage = new Usage(db(), () => new Date(Date.UTC(2027, 6, 1)));
    await db().prepare("DELETE FROM usage_events").run();
    await db().batch([
      db().prepare("INSERT INTO usage_events (usage_id, project, kind, hour, fields) VALUES (?, ?, ?, ?, ?)").bind("u-1", "k-1", "card_filed", "2027-03-01T10", JSON.stringify({ level: "hard", touches: ["security", "money"] })),
      db().prepare("INSERT INTO usage_events (usage_id, project, kind, hour, fields) VALUES (?, ?, ?, ?, ?)").bind("u-2", "k-2", "card_filed", "2027-03-01T22", JSON.stringify({ level: "hard", touches: ["security"] })),
      db().prepare("INSERT INTO usage_events (usage_id, project, kind, hour, fields) VALUES (?, ?, ?, ?, ?)").bind("u-1", "k-1", "visit", "2027-06-20T08", JSON.stringify({ client: "phone" })),
    ]);
    await usage.rollup();
    expect((await rows()).map((r) => r.kind)).toEqual(["visit"]);
    const daily = (await db().prepare("SELECT * FROM usage_daily ORDER BY field, value").all<Record<string, unknown>>()).results;
    expect(daily).toEqual([
      { day: "2027-03-01", kind: "card_filed", field: "", value: "", count: 2 },
      { day: "2027-03-01", kind: "card_filed", field: "level", value: "hard", count: 2 },
      { day: "2027-03-01", kind: "card_filed", field: "touches", value: "money", count: 1 },
      { day: "2027-03-01", kind: "card_filed", field: "touches", value: "security", count: 2 },
    ]);
    expect(JSON.stringify(daily)).not.toMatch(/u-1|u-2|k-1|k-2|T10|T22/);
  });

  it("refuses to record anything outside the list: a field it doesn't have, text where a value goes, an unknown kind", async () => {
    const before = (await rows()).length;
    const usage = new Usage(db());
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await usage.record(null, "error", { route: "Rotate the Stripe secret", status: 500 });
    await usage.record(null, "error", { route: "state", status: 500, path: "/v1/projects/p-x/state" });
    await usage.record(null, "error", { route: "state", status: "500 Internal" });
    await usage.record(null, "card_title" as "error", {});
    expect((await rows()).length).toBe(before);
    expect(errors).toHaveBeenCalledTimes(4);
    errors.mockRestore();
    expect(routeOf("/v1/projects/p-1/state")).toBe("state");
    expect(routeOf("/v1/projects/p-1/files/cards/B-aaaaa/r1.md")).toBe("upload");
    expect(routeOf("/v1/account/push")).toBe("account");
    expect(routeOf("/v1/whatever-else")).toBe("other");
  });
});
