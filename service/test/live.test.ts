import { env, exports } from "cloudflare:workers";
import { evictDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE, call, fileCard, headersFor, machineStore, push } from "./client.js";

// Live updates (B-bv49e): a hibernating WebSocket per open page or waiting agent, told "changed" and the version, as the
// local server's events tell it, across the object's hibernation and eviction.

interface Listener {
  ws: WebSocket;
  /** The next message, within a time. */
  next(ms?: number): Promise<string>;
  closed: Promise<number>;
}

async function listen(as: "machine" | "person" = "person", project = "proj-a"): Promise<Listener> {
  const r = await exports.default.fetch(new Request(`${BASE}/v1/projects/${project}/live`, { headers: { upgrade: "websocket", ...headersFor(as, project) } }));
  expect(r.status).toBe(101);
  const ws = r.webSocket!;
  const queue: string[] = [];
  const waiting: ((m: string) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
    const w = waiting.shift();
    if (w) w(m);
    else queue.push(m);
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  ws.accept();
  return {
    ws,
    closed,
    next: (ms = 2000) =>
      queue.length
        ? Promise.resolve(queue.shift()!)
        : new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error("no message")), ms);
            waiting.push((m) => {
              clearTimeout(t);
              resolve(m);
            });
          }),
  };
}

const version = (m: string) => (JSON.parse(m) as { type: string; version: number }).version;
const stub = () => env.PROJECTS.get(env.PROJECTS.idFromName("proj-a"));

describe("live updates (B-bv49e)", () => {
  it("says changed, with the version, when it opens and whenever something is written", async () => {
    const page = await listen();
    const first = await page.next();
    expect(JSON.parse(first)).toMatchObject({ type: "changed" });
    const laptop = machineStore();
    fileCard(laptop);
    await push(laptop);
    const m = await page.next();
    expect(version(m)).toBeGreaterThan(version(first));
    const s = (await (await call("GET", "state", { as: "person" })).json()) as { version: number };
    // Every write moved the version; the page hears the newest at last, and reads the state again.
    let latest = version(m);
    for (;;) {
      const more = await page.next(200).catch(() => undefined);
      if (!more) break;
      latest = version(more);
    }
    expect(latest).toBe(s.version);
    page.ws.close();
  });

  it("answers a ping with a pong, by the runtime's own reply, which needs no wake (setWebSocketAutoResponse)", async () => {
    const page = await listen("machine");
    await page.next();
    page.ws.send("ping");
    expect(await page.next()).toBe("pong");
    page.ws.close();
  });

  it("doesn't wake listeners for the reviewer's heartbeat", async () => {
    const page = await listen();
    await page.next();
    expect((await call("POST", "presence", { as: "person", json: {} })).status).toBe(204);
    await expect(page.next(300)).rejects.toThrow(/no message/);
    page.ws.close();
  });

  it("keeps the socket across eviction, hibernated, and tells it of the next change", async () => {
    const page = await listen();
    const before = version(await page.next());
    await evictDurableObject(stub());
    const laptop = machineStore();
    fileCard(laptop);
    await push(laptop);
    const after = version(await page.next());
    expect(after).toBeGreaterThan(before);
    // The version is the object's, in SQLite: it never goes back after an eviction.
    page.ws.close();
  });

  it("closes the socket when the object is evicted with its sockets closed, and a new one starts from the version kept", async () => {
    const page = await listen();
    const before = version(await page.next());
    await evictDurableObject(stub(), { webSockets: "close" });
    expect(await page.closed).toBeGreaterThan(0);
    const again = await listen();
    expect(version(await again.next())).toBe(before);
    again.ws.close();
  });

  it("is refused without the upgrade, without a sign-in, and to another project's grant", async () => {
    expect((await call("GET", "live", { as: "person" })).status).toBe(426);
    expect((await exports.default.fetch(new Request(`${BASE}/v1/projects/proj-a/live`, { headers: { upgrade: "websocket" } }))).status).toBe(401);
    expect((await exports.default.fetch(new Request(`${BASE}/v1/projects/proj-a/live`, { headers: { upgrade: "websocket", ...headersFor("machine", "proj-b") } }))).status).toBe(403);
  });
});
