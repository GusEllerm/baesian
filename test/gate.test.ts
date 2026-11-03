import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DetectedFact } from "../src/facts.js";
import { renderDoc } from "../src/frontmatter.js";
import { describeReport, evaluate } from "../src/gate.js";
import { cleanMessage, parseTrailers } from "../src/trailers.js";
import { BODY, REVIEWER, cleanup, draft, repo } from "./helpers.js";

afterEach(cleanup);

const AGENT = { agent: "claude-code" };
const dep = (name: string): DetectedFact => ({ id: `dep:${name}`, kind: "dep", path: "package.json", detail: "added to package.json" });
const schema: DetectedFact = { id: "schema:migrations/3.sql", kind: "schema", path: "migrations/3.sql", detail: "added migrations/3.sql" };

function msg(...trailers: string[]): string {
  return ["Add the run store", "", "Body text.", "", ...trailers, ""].join("\n");
}

describe("trailers (D52)", () => {
  it("reads cards and acks from the trailer block", () => {
    const { dir } = repo();
    const t = parseTrailers(
      msg("Baesian-Card: B-7f3kq", "baesian-card: B-2m9qa, B-7f3kq", "Baesian-Ack: dep:httpx needed for the client"),
      dir,
    );
    expect(t.cards).toEqual(["B-7f3kq", "B-2m9qa"]);
    expect([...t.acks]).toEqual([["dep:httpx", "needed for the client"]]);
    expect(t.malformed).toEqual([]);
  });

  it("reports malformed trailers rather than ignoring them", () => {
    const { dir } = repo();
    const t = parseTrailers(msg("Baesian-Card: card-12", "Baesian-Ack: dep:httpx", "Baesian-Ack: because I said so"), dir);
    expect(t.malformed).toHaveLength(3);
  });

  it("ignores trailers that aren't in the final trailer block, as git does", () => {
    const { dir } = repo();
    const t = parseTrailers("Subject\n\nBaesian-Card: B-7f3kq\n\nA closing paragraph.\n", dir);
    expect(t.cards).toEqual([]);
  });

  it("drops comment lines and everything below the scissors", () => {
    expect(cleanMessage("Subject\n# comment\nBody\n# ------------------------ >8 ------------------------\ndiff")).toBe(
      "Subject\nBody",
    );
  });
});

describe("coverage (D24, D53)", () => {
  it("covers a fact by an ack with a reason", () => {
    const { store, dir } = repo();
    const r = evaluate(store, { facts: [dep("httpx")], warnings: [] }, parseTrailers(msg("Baesian-Ack: dep:httpx dev only"), dir));
    expect(r.ok).toBe(true);
    expect(r.covered[0]?.cover).toEqual({ by: "ack", reason: "dev only" });
  });

  it("covers facts whose kind is in the cited card's touches, and only those", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft({ touches: ["schema"] }), BODY, AGENT).card.meta.id;
    const r = evaluate(store, { facts: [dep("httpx"), schema], warnings: [] }, parseTrailers(msg(`Baesian-Card: ${id}`), dir));
    expect(r.ok).toBe(false);
    expect(r.covered.map((c) => c.fact.id)).toEqual([schema.id]);
    expect(r.uncovered.map((f) => f.id)).toEqual(["dep:httpx"]);
    const text = describeReport(r).join("\n");
    expect(text).toContain("Baesian-Ack: dep:httpx <why this is fine>");
  });

  it("covers facts a rule answers (D24)", () => {
    const { store, dir } = repo();
    writeFileSync(
      join(store.live, "rules", "R-aaaaa.md"),
      renderDoc(
        { type: "rule", id: "R-aaaaa", covers: ["dep:pytest-*"], accepted_by: "gus", created: new Date().toISOString() },
        "pytest plugins don't need a card.\n",
      ),
    );
    const r = evaluate(store, { facts: [dep("pytest-cov")], warnings: [] }, parseTrailers(msg(), dir));
    expect(r.covered[0]?.cover).toEqual({ by: "rule", rule: "R-aaaaa" });
  });

  it("notes acks that match nothing, without blocking", () => {
    const { store, dir } = repo();
    const r = evaluate(store, { facts: [], warnings: [] }, parseTrailers(msg("Baesian-Ack: dep:htpx typo"), dir));
    expect(r.ok).toBe(true);
    expect(r.unusedAcks).toEqual(["dep:htpx"]);
  });
});

describe("cards a commit may not build on (D30, D46)", () => {
  it("blocks an unknown card", () => {
    const { store, dir } = repo();
    const r = evaluate(store, { facts: [], warnings: [] }, parseTrailers(msg("Baesian-Card: B-zzzzz"), dir));
    expect(r.problems).toMatchObject([{ card: "B-zzzzz", problem: "unknown" }]);
  });

  it("blocks a rejected card with a rework brief listing what was built on it", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.writeLedger(id, { commit: "0123456789abcdef" }, "Built on it.\n");
    store.addVerdict({ card: id, revision: 1, response: "reject", comment: "Use Postgres.", ...REVIEWER });
    const r = evaluate(store, { facts: [], warnings: [] }, parseTrailers(msg(`Baesian-Card: ${id}`), dir));
    expect(r.ok).toBe(false);
    const text = describeReport(r).join("\n");
    expect(text).toContain(`${id} was rejected by gus (a person): "Use Postgres."`);
    expect(text).toContain("Commits already built on it: 0123456789");
  });

  it("lets a returned-with-a-question card through: it isn't overturned", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "question", comment: "Why not DuckDB?", ...REVIEWER });
    expect(evaluate(store, { facts: [], warnings: [] }, parseTrailers(msg(`Baesian-Card: ${id}`), dir)).ok).toBe(true);
  });

  it("blocks a hard card until it's resolved, then allows it", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft({ touches: ["data-loss", "schema"] }), BODY, AGENT).card.meta.id;
    const t = parseTrailers(msg(`Baesian-Card: ${id}`), dir);
    expect(evaluate(store, { facts: [schema], warnings: [] }, t).problems[0]?.problem).toBe("hard-unresolved");
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const r = evaluate(store, { facts: [schema], warnings: [] }, t);
    expect(r.ok).toBe(true);
    expect(r.covered[0]?.cover).toEqual({ by: "card", card: id });
  });

  it("allows a provisional or blocking card that is only filed (D26, D46)", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft({ level: "blocking" }), BODY, AGENT).card.meta.id;
    expect(evaluate(store, { facts: [schema], warnings: [] }, parseTrailers(msg(`Baesian-Card: ${id}`), dir)).ok).toBe(true);
  });

  it("blocks withdrawn cards", () => {
    const { store, dir } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.withdraw(id, "Not needed.", "claude-code");
    expect(evaluate(store, { facts: [], warnings: [] }, parseTrailers(msg(`Baesian-Card: ${id}`), dir)).problems[0]?.problem).toBe(
      "withdrawn",
    );
  });
});
