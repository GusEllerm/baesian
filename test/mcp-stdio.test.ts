import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";
import { BODY, cleanup, draft, repo } from "./helpers.js";

// `baesian mcp` as a harness runs it: a child process over stdio (M7, P18 section 10), from source through tsx.

const BIN = join(import.meta.dirname, "..", "src", "bin.ts");
// By its full address: the server runs in a temporary repo, where `tsx` alone wouldn't resolve.
const ARGS = ["--import", import.meta.resolve("tsx"), BIN, "mcp"];
const env = (extra: Record<string, string> = {}) => ({ ...(process.env as Record<string, string>), BAESIAN_OS_NOTIFY: "0", BAESIAN_CONFIG: "/nonexistent/baesian-test-config.json", ...extra });

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  cleanup();
});

describe("baesian mcp over stdio", () => {
  for (const [era, mode, expected] of [
    ["the 2025 handshake", "legacy", "legacy"],
    ["2026-07-28", { pin: "2026-07-28" }, "modern"],
  ] as const) {
    it(`serves a client that opens with ${era}`, async () => {
      const { dir, store } = repo();
      const client = new Client({ name: "claude-code", version: "1.0.0" }, { versionNegotiation: { mode } });
      await client.connect(new StdioClientTransport({ command: process.execPath, args: ARGS, cwd: dir, env: env(), stderr: "pipe" }));
      closers.push(() => client.close());
      expect(client.getProtocolEra()).toBe(expected);
      expect((await client.listTools()).tools).toHaveLength(12);
      const filed = await client.callTool({ name: "file_card", arguments: { ...draft(), body: BODY } });
      const meta = (filed.structuredContent as { card: { meta: { id: string; source_agent: string } } }).card.meta;
      expect(meta.source_agent).toBe("claude-code");
      expect(store.card(meta.id)?.meta.title).toBe("The run-metadata store");
    }, 30_000);
  }
});

/** The server spoken to by hand, line by line, to see every byte it writes. */
function raw(cwd: string, extraEnv: Record<string, string> = {}) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, ARGS, { cwd, env: env(extraEnv), stdio: "pipe" });
  let out = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
  const exited = new Promise<number | null>((done) => child.on("exit", done));
  closers.push(() => {
    if (child.exitCode === null) child.kill();
  });
  const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const lines = () => out.split("\n").filter(Boolean);
  const response = async (id: number) => {
    await expect.poll(() => lines().some((l) => JSON.parse(l).id === id), { timeout: 20_000 }).toBe(true);
    return JSON.parse(lines().find((l) => JSON.parse(l).id === id)!);
  };
  send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { child, send, response, lines, exited, stdout: () => out };
}

describe("its output", () => {
  it("is only protocol messages, even when the user's notify command writes to its own output", async () => {
    const { dir } = repo();
    const config = `${dir}-config.json`;
    const notified = `${dir}-notified.json`;
    writeFileSync(config, JSON.stringify({ notify: `echo "not protocol"; cat > '${notified}'` }));
    closers.push(() => {
      for (const f of [config, notified]) rmSync(f, { force: true });
    });
    const server = raw(dir, { BAESIAN_CONFIG: config });
    await server.response(0);
    server.send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "file_card", arguments: draft({ level: "blocking" }) } });
    const filed = await server.response(1);
    expect(filed.result.isError).toBeUndefined();
    // The notify command ran, with the card, and what it printed went nowhere.
    await expect.poll(() => existsSync(notified) && readFileSync(notified, "utf8").includes('"level":"blocking"'), { timeout: 10_000 }).toBe(true);
    server.child.stdin.end();
    expect(await server.exited).toBe(0);
    for (const line of server.lines()) expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    expect(server.stdout()).not.toContain("not protocol");
  }, 30_000);
});

describe("closing its input", () => {
  it("stops a wait, removes its marker, and exits", async () => {
    const { dir, store } = repo();
    const id = store.fileCard(draft({ level: "blocking" }), BODY, { agent: "raw" }).card.meta.id;
    const server = raw(dir);
    await server.response(0);
    server.send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "wait_for_verdict", arguments: { id } } });
    await expect.poll(() => store.waitingOn(id).length, { timeout: 20_000 }).toBe(1);
    server.child.stdin.end();
    expect(await server.exited).toBe(0);
    expect(store.waitingOn(id)).toEqual([]);
    expect(store.fallbacks(id)).toEqual([]);
  }, 30_000);
});
