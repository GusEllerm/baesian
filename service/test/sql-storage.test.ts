import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readRelayEntry } from "../../src/schema.js";
import { alreadyExists } from "../../src/storage.js";
import { SqlFileStorage } from "../src/sql-storage.js";

// The live layer over a Durable Object's SQLite (B-0ag7h): the storage interface's promises, as test/storage.test.ts
// checks them for a folder and memory, and the relay's log written beside it (P16 section 8).

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | undefined) => (b === undefined ? undefined : new TextDecoder().decode(b));

/** Run `fn` inside a fresh object, over its SQLite. */
function inObject(fn: (s: SqlFileStorage, state: DurableObjectState) => void, opts: ConstructorParameters<typeof SqlFileStorage>[1] = {}) {
  return runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_i, state) => fn(new SqlFileStorage(state.storage, opts), state));
}

describe("the live layer's storage, in a Durable Object's SQLite (B-0ag7h)", () => {
  it("reads what was written, and nothing where nothing was", () =>
    inObject((s) => {
      expect(s.read("cards/B-7f3kq/r1.md")).toBeUndefined();
      s.create("cards/B-7f3kq/r1.md", bytes("one"));
      expect(text(s.read("cards/B-7f3kq/r1.md"))).toBe("one");
    }));

  it("writes a write-once file once: a second create fails with EEXIST, and the first stays", () =>
    inObject((s) => {
      s.create("verdicts/a.json", bytes("first"));
      let error: unknown;
      try {
        s.create("verdicts/a.json", bytes("second"));
      } catch (e) {
        error = e;
      }
      expect(alreadyExists(error)).toBe(true);
      expect(text(s.read("verdicts/a.json"))).toBe("first");
      expect(s.after(0, 10).map((e) => e.path)).toEqual(["verdicts/a.json"]);
    }));

  it("replaces a mutable file whole, and removes one", () =>
    inObject((s) => {
      s.replace("presence.json", bytes("old"));
      s.replace("presence.json", bytes("new"));
      expect(text(s.read("presence.json"))).toBe("new");
      s.remove("presence.json");
      expect(s.read("presence.json")).toBeUndefined();
      expect(() => s.remove("presence.json")).not.toThrow();
    }));

  it("lists a folder's files and folders, one level down, and nothing for a folder with no files", () =>
    inObject((s) => {
      s.create("cards/B-aaaaa/r1.md", bytes("a"));
      s.create("cards/B-aaaaa/gate-r1-cli.json", bytes("g"));
      s.create("cards/B-bbbbb/r1.md", bytes("b"));
      s.create("cardsx/other.json", bytes("x"));
      s.replace("presence.json", bytes("p"));
      expect(s.list("cards").sort()).toEqual(["B-aaaaa", "B-bbbbb"]);
      expect(s.list("cards/B-aaaaa").sort()).toEqual(["gate-r1-cli.json", "r1.md"]);
      expect(s.list("verdicts")).toEqual([]);
      expect(s.list("").sort()).toEqual(["cards", "cardsx", "presence.json"]);
    }));

  it("refuses a path that isn't the layer's, and hands out copies", () =>
    inObject((s) => {
      for (const bad of ["/a", "a//b", "../a", "a/./b", "a\\b", ""]) expect(() => s.read(bad), bad).toThrow(/not a path/);
      s.create("a/b.json", bytes("x"));
      s.read("a/b.json")![0] = 0;
      expect(text(s.read("a/b.json"))).toBe("x");
    }));

  it("keeps everything across the object's eviction: it's in SQLite, not in memory", async () => {
    const stub = env.PROJECTS.get(env.PROJECTS.newUniqueId());
    await runInDurableObject(stub, (_i, state) => new SqlFileStorage(state.storage).create("decks/x.md", bytes("deck")));
    const { evictDurableObject } = await import("cloudflare:test");
    await evictDurableObject(stub);
    await runInDurableObject(stub, (_i, state) => {
      const s = new SqlFileStorage(state.storage);
      expect(text(s.read("decks/x.md"))).toBe("deck");
      expect(s.head()).toBe(1);
    });
  });
});

describe("the relay's log, beside the files (P16 section 8)", () => {
  it("gives each file written once the next sequence number, with its size, digest, format and bytes", () =>
    inObject((s) => {
      s.create("decks/x.md", bytes("---\ntype: deck\nformat: 1\nid: x\ntitle: X\ncreated: 2026-11-03T00:00:00.000Z\n---\n\nThe deck.\n"));
      s.create("cards/B-aaaaa/withdrawn.json", bytes('{"type":"withdrawal","card":"B-aaaaa"}'));
      const [deck, w] = s.after(0, 10);
      expect(deck).toMatchObject({ seq: 1, path: "decks/x.md", format: 1 });
      expect(w).toMatchObject({ seq: 2, path: "cards/B-aaaaa/withdrawn.json", format: 1 });
      const body = Buffer.from(w!.body!, "base64");
      expect(body.toString()).toBe('{"type":"withdrawal","card":"B-aaaaa"}');
      expect(w!.size).toBe(body.length);
      expect(w!.digest).toBe(createHash("sha256").update(body).digest("hex"));
      expect(w).not.toHaveProperty("sig");
      expect(w).not.toHaveProperty("machine");
      expect(w).not.toHaveProperty("enc");
      expect(s.after(1, 10).map((e) => e.seq)).toEqual([2]);
      expect(s.after(0, 1).map((e) => e.seq)).toEqual([1]);
      expect(s.head()).toBe(2);
    }));

  it("logs no mutable file, and no signature as an entry of its own: it rides in its file's, as sig", () =>
    inObject(
      (s) => {
        s.replace("waiting/B-aaaaa-x1.json", bytes("{}"));
        s.replace("presence.json", bytes("{}"));
        s.create("topics/alias-abcde.json", bytes('{"format":1}'));
        expect(s.after(0, 10).map((e) => e.path)).toEqual(["topics/alias-abcde.json"]);
        expect(Buffer.from(s.after(0, 10)[0]!.sig!, "base64").toString()).toBe("signed: topics/alias-abcde.json");
        expect(text(s.read("topics/alias-abcde.json.sig"))).toBe("signed: topics/alias-abcde.json");
      },
      { sign: (path) => (path.startsWith("topics/") ? `signed: ${path}` : undefined) },
    ));

  it("names the machine an upload came from (D162)", () =>
    inObject((s) => {
      s.asMachine("laptop", () => s.create("decks/a.md", bytes("a")));
      s.create("decks/b.md", bytes("b"));
      expect(s.after(0, 10).map((e) => e.machine)).toEqual(["laptop", undefined]);
    }));

  it("writes the file and its entry in one transaction: a write that fails keeps neither", () =>
    inObject((s) => {
      expect(() =>
        s.transaction(() => {
          s.create("decks/a.md", bytes("a"));
          throw new Error("something later failed");
        }),
      ).toThrow(/later failed/);
      expect(s.read("decks/a.md")).toBeUndefined();
      expect(s.after(0, 10)).toEqual([]);
      s.create("decks/a.md", bytes("a"));
      expect(s.after(0, 10).map((e) => e.path)).toEqual(["decks/a.md"]);
    }));

  it("moves the version with every write but the reviewer's heartbeat", () =>
    inObject((s) => {
      const v = s.version();
      s.replace("presence.json", bytes("{}"));
      expect(s.version()).toBe(v);
      s.create("decks/a.md", bytes("a"));
      s.replace("waiting/B-aaaaa-x1.json", bytes("{}"));
      s.remove("waiting/B-aaaaa-x1.json");
      expect(s.version()).toBe(v + 3);
    }));

  it("refuses an entry that sets enc, by name: an encrypted entry fails loudly (D137)", () => {
    const entry = { seq: 1, path: "decks/a.md", format: 1, size: 1, digest: "0".repeat(64), body: "YQ==", at: "2026-11-03T00:00:00.000Z" };
    expect(readRelayEntry(entry)).toEqual(entry);
    expect(() => readRelayEntry({ ...entry, enc: { alg: "x" } })).toThrow(/encrypted \(enc\)/);
    expect(() => readRelayEntry({ ...entry, extra: 1 })).toThrow();
  });
});
