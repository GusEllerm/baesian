import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { NO_ACCESS, SESSION_COOKIE, accessFor, isLocal } from "../src/access.js";
import { Accounts } from "../src/accounts.js";
import { type Env, handleRequest } from "../src/index.js";
import { BASE, answer, call, fileCard, grants, headersFor, machineStore, push, upload } from "./client.js";

// Who may do what, before sign-in (Hosted Service section 3, M9c): a machine uploads what an agent writes and reads,
// and never answers; an answer refuses any request with an Authorization header; each grant and session is for one
// project; and production, with no sign-in built, refuses everything.

type Body = { error?: string };
const status = async (r: Response) => ({ status: r.status, error: ((await r.json().catch(() => ({}))) as Body).error });

describe("who may do what (P15 section 3)", () => {
  it("lets a machine upload and read, and a person read and answer", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    expect((await push(laptop)).every((r) => r.status === 201)).toBe(true);
    for (const as of ["machine", "person"] as const) {
      for (const path of ["log?after=0", "state", "presets"]) expect((await call("GET", path, { as })).status, `${as} ${path}`).toBe(200);
    }
    expect((await answer({ card: id, revision: 1, response: "accept" })).status).toBe(201);
  });

  it("never lets a machine answer: an answer refuses any request with an Authorization header, whatever it holds", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    await push(laptop);
    for (const path of ["verdicts", "aliases", "preferences", "presence"]) {
      const asMachine = await status(await call("POST", path, { as: "machine", json: { card: id, revision: 1, response: "accept" } }));
      expect(asMachine.status, path).toBe(403);
      expect(asMachine.error).toMatch(/Authorization header is refused/);
      // A person's cookie doesn't help a request that also carries a header, even one that's nonsense.
      const both = await status(await call("POST", path, { as: { headers: { ...headersFor("person"), authorization: "Basic eA==" } }, json: {} }));
      expect(both.status, path).toBe(403);
    }
  });

  it("lets only a machine upload", async () => {
    const r = await status(await upload("decks/x.md", "---\n---\n", { as: "person" }));
    expect(r.status).toBe(403);
    expect(r.error).toMatch(/only a machine uploads/);
  });

  it("holds each grant and session to its own project", async () => {
    for (const as of ["machine", "person"] as const) {
      const r = await status(await call("GET", "state", { as: { headers: headersFor(as, "proj-b") }, project: "proj-a" }));
      expect(r.status, as).toBe(403);
      expect(r.error).toMatch(/for project proj-b, not proj-a/);
    }
    expect((await call("GET", "state", { as: "machine", project: "proj-b" })).status).toBe(200);
  });

  it("refuses anyone not signed in, or signed in with what it doesn't know", async () => {
    expect((await call("GET", "state")).status).toBe(401);
    expect((await call("GET", "state", { as: { headers: { authorization: "Bearer not-a-grant-at-all" } } })).status).toBe(401);
    expect((await call("GET", "state", { as: { headers: { cookie: `${SESSION_COOKIE}=not-a-session-at-all` } } })).status).toBe(401);
    // A machine's token sent as a cookie is no session.
    expect((await call("GET", "state", { as: { headers: { cookie: `${SESSION_COOKIE}=${grants.machines[0]!.token}` } } })).status).toBe(401);
  });

  it("knows only its own addresses, each with its method", async () => {
    expect((await exports_fetch("/v1/projects/proj-a")).status).toBe(404);
    expect((await exports_fetch("/v2/projects/proj-a/state")).status).toBe(404);
    expect((await exports_fetch("/v1/projects/not%20a%20project/state")).status).toBe(400);
    expect((await call("POST", "state", { as: "person", json: {} })).status).toBe(405);
    expect((await call("GET", "verdicts", { as: "person" })).status).toBe(405);
    expect((await call("GET", "nothing", { as: "person" })).status).toBe(404);
    expect((await call("POST", "verdicts", { as: "person", body: "{}", headers: { "content-type": "text/plain" } })).status).toBe(415);
  });
});

async function exports_fetch(path: string): Promise<Response> {
  return handleRequest(new Request(`${BASE}${path}`, { headers: headersFor("person") }), env as unknown as Env);
}

describe("the stand-in beside sign-in, and production (M9c)", () => {
  it("runs the stand-in only locally or in tests, and only with grants given; production has only real sign-ins", () => {
    expect(isLocal({ BAESIAN_ENV: "test" })).toBe(true);
    expect(isLocal({ BAESIAN_ENV: "development" })).toBe(true);
    expect(isLocal({ BAESIAN_ENV: "production" })).toBe(false);
    expect(isLocal({})).toBe(false);
    expect(accessFor({ BAESIAN_ENV: "test" })).toBe(NO_ACCESS);
    expect(accessFor({ BAESIAN_ENV: "production", BAESIAN_DEV_ACCESS: env.BAESIAN_DEV_ACCESS! })).toBe(NO_ACCESS);
    expect(accessFor({ BAESIAN_DEV_ACCESS: env.BAESIAN_DEV_ACCESS! })).toBe(NO_ACCESS);
    expect(accessFor({ BAESIAN_ENV: "test", BAESIAN_DEV_ACCESS: env.BAESIAN_DEV_ACCESS! })).not.toBe(NO_ACCESS);
    const accounts = new Accounts(env.ACCOUNTS);
    expect(accessFor({ BAESIAN_ENV: "production", BAESIAN_DEV_ACCESS: env.BAESIAN_DEV_ACCESS! }, accounts).name).toBe("sign-in");
    expect(accessFor({ BAESIAN_ENV: "test", BAESIAN_DEV_ACCESS: env.BAESIAN_DEV_ACCESS! }, accounts).name).toMatch(/stand-in.*, or sign-in/);
  });

  it("refuses everything in production that sign-in can't identify, the stand-in's own grants included", async () => {
    const production = { ...(env as unknown as Env), BAESIAN_ENV: "production" };
    const requests = [
      ["GET", "state", "machine"],
      ["GET", "state", "person"],
      ["GET", "log?after=0", "machine"],
      ["PUT", "files/decks/x.md", "machine"],
      ["POST", "verdicts", "person"],
      ["POST", "presence", "person"],
      ["GET", "live", "person"],
    ] as const;
    for (const [method, path, as] of requests) {
      const r = await handleRequest(
        new Request(`${BASE}/v1/projects/proj-a/${path}`, { method, headers: { ...headersFor(as), "content-type": "application/json", ...(path === "live" ? { upgrade: "websocket" } : {}) }, ...(method === "GET" ? {} : { body: "{}" }) }),
        production,
      );
      const s = await status(r);
      expect(s.status, `${method} ${path}`).toBe(401);
      expect(s.error).toMatch(/not signed in/);
    }
  });
});
