import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderDoc } from "../../src/frontmatter.js";
import type { RelayEntry } from "../../src/schema.js";
import { call, fileCard, machineStore, pullLog, push, upload } from "./client.js";

// Uploads (P15 sections 1 and 3): a machine sends only the kinds of file an agent writes, each checked against the
// store's schema and its path; the same bytes again do nothing; other bytes at a path are refused. And the log the
// CLI pulls them from (P16 section 8).

const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> & { error?: string; entry?: RelayEntry } });

describe("uploads (P15 section 3)", () => {
  it("takes what an agent writes: the deck, the card and the CLI's gate record, each logged and named for its machine", async () => {
    const local = machineStore();
    const id = fileCard(local);
    const before = (await pullLog()).at(-1)?.seq ?? 0;
    const replies = await push(local);
    expect(replies.map((r) => r.status)).toEqual([201, 201, 201]);
    const entries = (await pullLog()).filter((e) => e.seq > before);
    const paths = entries.map((e) => e.path);
    // The service's key comes first, the first time a project is written; then each upload, and the relay's gate record.
    expect(paths.filter((p) => !p.startsWith("trust/"))).toEqual(["decks/branch-main.md", `cards/${id}/r1.md`, `cards/${id}/gate-r1-relay.json`, `cards/${id}/gate-r1-cli.json`]);
    expect(entries.filter((e) => !e.path.startsWith("trust/") && !e.path.endsWith("-relay.json")).every((e) => e.machine === "laptop")).toBe(true);
    expect(entries.find((e) => e.path.endsWith("-relay.json"))).not.toHaveProperty("machine");
    for (const e of entries) {
      const body = Buffer.from(e.body!, "base64");
      expect(e.digest).toBe(createHash("sha256").update(body).digest("hex"));
      expect(e.size).toBe(body.length);
    }
    expect(entries.map((e) => e.seq)).toEqual([...entries.keys()].map((i) => before + 1 + i));
  });

  it("does nothing with the same bytes again, and refuses other bytes at a path: a file is written once", async () => {
    const local = machineStore();
    const id = fileCard(local);
    await push(local);
    const card = local.storage.read(`cards/${id}/r1.md`)!;
    const head = (await pullLog()).at(-1)!.seq;
    const again = await read(await upload(`cards/${id}/r1.md`, card));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ unchanged: true, entry: { path: `cards/${id}/r1.md` } });
    const other = await read(await upload(`cards/${id}/r1.md`, Buffer.from(Buffer.from(card).toString().replace("Decision", "A decision"))));
    expect(other.status).toBe(409);
    expect(other.body.error).toMatch(/already here, with other bytes/);
    expect((await pullLog()).at(-1)!.seq).toBe(head);
  });

  it("refuses a conflicting revision: two machines revise one card, and the second is refused (P15 section 1)", async () => {
    const laptop = machineStore();
    const id = fileCard(laptop);
    await push(laptop);
    const revision = (title: string) => {
      const r1 = laptop.card(id)!;
      return renderDoc({ ...r1.meta, revision: 2, title, created: new Date().toISOString() }, r1.body);
    };
    expect((await upload(`cards/${id}/r2.md`, revision("Revised on the laptop"))).status).toBe(201);
    const second = await read(await upload(`cards/${id}/r2.md`, revision("Revised on the Spark")));
    expect(second.status).toBe(409);
    // A revision with nothing before it isn't taken either.
    const r3 = renderDoc({ ...laptop.card(id)!.meta, revision: 4 }, "");
    expect((await read(await upload(`cards/${id}/r4.md`, r3))).body.error).toMatch(/no revision 3 here/);
  });

  it("refuses every kind of file a person writes, and anything that isn't an agent's", async () => {
    const theirs = ["verdicts/20261103T000000.000Z-B-aaaaa-r1-abcde.json", "rules/R-abcde.md", "rules/R-abcde-retired.json", "topics/alias-abcde.json", "preferences/20261103T000000.000Z-abcde.json", "trust/service-x.json", "trust/passkey-abcde.json", "cards/B-aaaaa/gate-r1-relay.json", "decks/x.md.sig"];
    for (const p of theirs) {
      const r = await read(await upload(p, "{}"));
      expect(r.status, p).toBe(403);
      expect(r.body.error, p).toMatch(/only a person writes/);
    }
    for (const p of ["ledger/B-aaaaa-abcde.md", "presence.json", "cursors/main.json", "server.json", "notes/x.md"]) {
      const r = await read(await upload(p, "{}"));
      expect(r.status, p).toBe(403);
      expect(r.body.error, p).toMatch(/isn't a kind of file an agent writes/);
    }
  });

  it("checks each upload against the store's schema, and its fields against its path", async () => {
    const local = machineStore();
    const id = fileCard(local);
    const card = Buffer.from(local.storage.read(`cards/${id}/r1.md`)!).toString();
    expect((await read(await upload(`cards/${id}/r1.md`, card.replace("proposal:", "proposal_x:")))).status).toBe(400);
    expect((await read(await upload(`cards/B-zzzzz/r1.md`, card))).body.error).toMatch(/but its path says B-zzzzz r1/);
    expect((await read(await upload(`cards/${id}/r1.md`, card.replace("format: 1", "format: 9")))).status).toBe(422);
    expect((await read(await upload(`cards/${id}/r1.md`, new Uint8Array([0xff, 0xfe, 0x00])))).body.error).toMatch(/isn't UTF-8/);
    expect((await read(await upload(`cards/${id}/withdrawn.json`, JSON.stringify({ type: "withdrawal", format: 1, card: id, reason: "no", by: "a", at: new Date().toISOString() })))).body.error).toMatch(/isn't here yet/);
    expect((await read(await upload(`cards/${id}/r1.md`, card))).status).toBe(201);
    expect((await read(await upload(`cards/${id}/withdrawn.json`, JSON.stringify({ type: "withdrawal", format: 1, card: "B-zzzzz", reason: "no", by: "a", at: new Date().toISOString() })))).body.error).toMatch(/it's for B-zzzzz/);
    const gate = JSON.parse(Buffer.from(local.storage.read(`cards/${id}/gate-r1-cli.json`)!).toString());
    expect((await read(await upload(`cards/${id}/gate-r1-cli.json`, JSON.stringify({ ...gate, by: "relay" })))).body.error).toMatch(/the CLI's own/);
    expect((await read(await upload(`files/../verdicts/x.json`, "{}"))).status).toBe(403);
    expect((await read(await call("PUT", "files/cards%2F..%2Fx.md", { as: "machine", body: "x" }))).body.error).toMatch(/not a path/);
  });

  it("takes waiting markers as mutable state: replaced, removed, never in the log", async () => {
    const local = machineStore();
    const id = fileCard(local);
    await push(local);
    const head = (await pullLog()).at(-1)!.seq;
    const waiting = local.startWaiting(id, "claude-code");
    const path = local.storage.list("waiting").map((f) => `waiting/${f}`)[0]!;
    expect((await upload(path, local.storage.read(path)!)).status).toBe(200);
    waiting.refresh(new Date(Date.now() + 30_000).toISOString());
    expect((await upload(path, local.storage.read(path)!)).status).toBe(200);
    const s = (await (await call("GET", "state", { as: "machine" })).json()) as { cards: { meta: { id: string }; waiting: unknown[] }[] };
    expect(s.cards.find((c) => c.meta.id === id)!.waiting).toHaveLength(1);
    expect((await pullLog()).at(-1)!.seq).toBe(head);
    expect((await call("DELETE", `files/${path}`, { as: "machine" })).status).toBe(204);
    expect((await call("DELETE", `files/cards/${id}/r1.md`, { as: "machine" })).status).toBe(403);
    const after = (await (await call("GET", "state", { as: "machine" })).json()) as typeof s;
    expect(after.cards.find((c) => c.meta.id === id)!.waiting).toHaveLength(0);
  });
});

describe("the log (P16 section 8)", () => {
  it("gives the entries after a sequence number, in order, a page at a time", async () => {
    const local = machineStore();
    for (let i = 0; i < 3; i++) fileCard(local);
    await push(local);
    const all = await pullLog();
    expect(all.map((e) => e.seq)).toEqual(all.map((_, i) => i + 1));
    const page = (await (await call("GET", "log?after=2&limit=3", { as: "machine" })).json()) as { entries: RelayEntry[]; head: number; more: boolean };
    expect(page.entries.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(page.head).toBe(all.length);
    expect(page.more).toBe(all.length > 5);
    expect(((await (await call("GET", `log?after=${all.length}`, { as: "machine" })).json()) as { entries: unknown[] }).entries).toEqual([]);
    expect((await call("GET", "log?after=-1", { as: "machine" })).status).toBe(400);
  });

  it("carries each signed file's signature in its entry, and none on an agent's files", async () => {
    const all = await pullLog();
    const relay = all.filter((e) => e.path.endsWith("-relay.json"));
    expect(relay.length).toBeGreaterThan(0);
    expect(relay.every((e) => Buffer.from(e.sig!, "base64").toString().startsWith("-----BEGIN SSH SIGNATURE-----"))).toBe(true);
    expect(all.filter((e) => /\/r\d+\.md$|^decks\//.test(e.path)).every((e) => e.sig === undefined)).toBe(true);
    expect(all.some((e) => e.path.endsWith(".sig"))).toBe(false);
  });
});
