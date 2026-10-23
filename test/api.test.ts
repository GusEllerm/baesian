import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ApiChange, type Snapshot, detectFacts, stagedSnapshot } from "../src/facts.js";
import { evaluate } from "../src/gate.js";
import { parseTrailers } from "../src/trailers.js";
import { BODY, cleanup, draft, repo, sh } from "./helpers.js";

afterEach(cleanup);

function fake(changes: ApiChange[], warning?: string): Snapshot & { calls: number } {
  const snap = {
    calls: 0,
    changes: () => [],
    before: () => undefined,
    after: () => undefined,
    apiChanges() {
      snap.calls++;
      return warning ? { changes, warning } : { changes };
    },
  };
  return snap;
}

const sig = (path: string, qualname: string, kind: ApiChange["kind"]): ApiChange => ({
  path,
  qualname,
  kind,
  was: kind === "added" ? null : `function ${qualname}(a: string): void`,
  now: kind === "removed" ? null : `function ${qualname}(a: string, b?: number): void`,
});

describe("the api: detector (D56, D58, D59)", () => {
  it("is off, and doesn't call livedocs, until gate_api names public modules", () => {
    const snap = fake([sig("src/index.ts", "open", "signature")]);
    expect(detectFacts(snap).facts).toEqual([]);
    expect(detectFacts(snap, { api: [] }).facts).toEqual([]);
    expect(snap.calls).toBe(0);
  });

  it("counts changed signatures and removed exports, not new ones", () => {
    const snap = fake([
      sig("src/index.ts", "open", "signature"),
      sig("src/index.ts", "close", "removed"),
      sig("src/index.ts", "peek", "added"),
    ]);
    const facts = detectFacts(snap, { api: ["src/index.ts"] }).facts;
    expect(facts.map((f) => [f.id, f.detail])).toEqual([
      ["api:close", "removed from src/index.ts"],
      ["api:open", "signature changed in src/index.ts: function open(a: string, b?: number): void"],
    ]);
  });

  it("only looks at the declared public modules", () => {
    const snap = fake([sig("src/index.ts", "open", "signature"), sig("src/internal/hooks.ts", "hookBlock", "signature")]);
    expect(detectFacts(snap, { api: ["src/index.ts", "src/public/**"] }).facts.map((f) => f.id)).toEqual(["api:open"]);
  });

  it("passes livedocs' problems on as warnings, never blocking", () => {
    const snap = fake([], "livedocs isn't installed");
    const d = detectFacts(snap, { api: ["src/**"] });
    expect(d.facts).toEqual([]);
    expect(d.warnings).toEqual(["livedocs isn't installed"]);
  });

  it("is covered by a card that touches public-api (D53)", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft({ touches: ["public-api"] }), BODY, { agent: "a" }).card.meta.id;
    const detection = detectFacts(fake([sig("src/index.ts", "open", "signature")]), { api: ["src/index.ts"] });
    const r = evaluate(store, detection, parseTrailers(`Change open\n\nBaesian-Card: ${id}\n`, dir));
    expect(r.ok).toBe(true);
    expect(r.covered[0]?.cover).toEqual({ by: "card", card: id });
  });
});

let hasLivedocs = false;
try {
  execFileSync("livedocs", ["signatures", "--help"], { stdio: "ignore" });
  hasLivedocs = true;
} catch {
  // not installed: the real-livedocs test is skipped
}

describe.skipIf(!hasLivedocs)("with the real livedocs", { timeout: 60_000 }, () => {
  it("finds a changed exported signature in a staged TypeScript module", () => {
    const { dir } = repo();
    const write = (p: string, t: string) => {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), t);
      sh(dir, "add", "--", p);
    };
    write("src/index.ts", "export function open(path: string): number {\n  return path.length;\n}\n");
    sh(dir, "commit", "-q", "-m", "api");
    write(
      "src/index.ts",
      "export function open(path: string, flags = 0): number {\n  return path.length + flags;\n}\nexport const added = 1;\n",
    );
    const facts = detectFacts(stagedSnapshot(dir), { api: ["src/**"] }).facts;
    expect(facts.map((f) => f.id)).toEqual(["api:open"]);
    expect(facts[0]?.detail).toContain("flags = 0");
  });
});
