import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ApiPractice } from "../../src/api.js";
import { call, fileCard, headersFor, machineStore, pullLog, push, state, upload } from "./client.js";

// B-rehdw, "On the service, for every device": a project's practice answers are kept in a table of its own object, apart
// from its files and its log, at an address only a person signed in in a browser can use (Practice Cards section 5). So a
// machine never reads one, the state never has one, and writing one changes nothing a machine or a page is told of.

type Body = Record<string, unknown> & { error?: string };
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Body });
const practice = (project = "proj-a") => call("GET", "practice", { as: "person", project });
const write = (input: unknown, project = "proj-a") => call("POST", "practice", { as: "person", project, json: input });
const entries = async (project = "proj-a") => ((await (await practice(project)).json()) as ApiPractice).entries;
const answer = (over: Record<string, unknown> = {}) => ({ kind: "answer", card: "B-abcde", revision: 1, answered: "2026-11-01T10:00:00.000Z", blind: "other", final: "planted", ...over });

describe("practice answers on the relay (B-rehdw)", () => {
  it("a person writes them and reads them back, with their account, handle and client, oldest first; the test starts once", async () => {
    const before = (await entries("proj-b")).length;
    const start = await json(await write({ kind: "test-start" }, "proj-b"));
    expect(start.status).toBe(201);
    expect(start.body.entry).toMatchObject({ type: "practice", format: 1, kind: "test-start", reviewer: "gus", account: "acct-gus", client: "hosted-desktop" });
    expect((await json(await write({ ...answer({ test: true }), client: "hosted-phone" }, "proj-b"))).status).toBe(201);
    expect((await json(await write({ kind: "mark", card: "B-abcde", revision: 1, mark: "maybe", practice: true }, "proj-b"))).status).toBe(201);
    const all = (await entries("proj-b")).slice(before);
    expect(all.map((e) => e.kind)).toEqual(["test-start", "answer", "mark"]);
    expect(all[1]).toMatchObject({ client: "hosted-phone", test: true, final: "planted", blind: "other" });
    // The guess about it, on a card of its own after the answer (B-9prve).
    expect(all[2]).toMatchObject({ kind: "mark", card: "B-abcde", mark: "maybe", practice: true });
    const again = await json(await write({ kind: "test-start" }, "proj-b"));
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/runs once/);
  });

  it("refuses what isn't a practice entry: what you typed, a client it doesn't know, a list", async () => {
    expect((await json(await write(answer({ comment: "weak case" })))).status).toBe(400);
    expect((await json(await write({ ...answer(), client: "web" }))).status).toBe(400);
    expect((await json(await write([answer()]))).status).toBe(400);
    expect((await json(await write(answer({ final: "accept" })))).status).toBe(400);
  });

  it("is never for a machine: its token is refused at the address, reading or writing, and with a person's cookie too", async () => {
    for (const method of ["GET", "POST"]) {
      const r = await json(await call(method, "practice", { as: "machine", ...(method === "POST" ? { json: answer() } : {}) }));
      expect(r.status, method).toBe(403);
      expect(r.body.error).toMatch(/practice answers are a person's own/);
    }
    const both = await call("GET", "practice", { as: { headers: { ...headersFor("person"), authorization: headersFor("machine").authorization! } } });
    expect(both.status).toBe(403);
    expect((await call("GET", "practice", { as: "nobody" })).status).toBe(401);
    // Nor can a machine put one among the files an agent writes.
    const up = await json(await upload("practice/20261110T120000.000Z-abcd1234.json", JSON.stringify({ type: "practice", format: 1, kind: "test-start", reviewer: "x", client: "web", at: "2026-11-10T12:00:00.000Z" })));
    expect(up.status).toBe(403);
    expect((await call("DELETE", "practice", { as: "person" })).status).toBe(405);
  });

  it("is never in the log or the state, and writing one changes neither's version", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    await push(laptop);
    const log = await pullLog();
    const s1 = await state();
    expect((await json(await write(answer({ card: id })))).status).toBe(201);
    const s2 = await state();
    expect(s2.version).toBe(s1.version);
    expect(JSON.stringify(s2)).not.toMatch(/practice|planted/);
    const after = await pullLog();
    expect(after).toEqual(log);
    expect(after.some((e) => e.path.startsWith("practice"))).toBe(false);
  });

  it("goes when the project is deleted", async () => {
    expect((await json(await write(answer(), "proj-a"))).status).toBe(201);
    expect((await entries("proj-a")).length).toBeGreaterThan(0);
    await env.PROJECTS.get(env.PROJECTS.idFromName("proj-a")).erase("proj-a");
    expect(await entries("proj-a")).toEqual([]);
  });
});
