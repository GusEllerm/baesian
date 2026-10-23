import { describe, expect, it } from "vitest";
import { parseDoc, renderDoc, section } from "../src/frontmatter.js";
import { CARD_ID, newId } from "../src/ids.js";
import { jaccard, nearTopics, tokens } from "../src/similarity.js";

describe("ids", () => {
  it("makes five-character Crockford IDs with a prefix", () => {
    for (let i = 0; i < 200; i++) expect(newId("B", () => false)).toMatch(CARD_ID);
  });

  it("retries until an ID is free", () => {
    let calls = 0;
    const id = newId("B", () => ++calls < 3);
    expect(calls).toBe(3);
    expect(id).toMatch(CARD_ID);
  });

  it("gives up rather than loop forever", () => {
    expect(() => newId("B", () => true, 5)).toThrow(/free B- id/);
  });
});

describe("frontmatter", () => {
  it("round-trips flat frontmatter and the body", () => {
    const text = renderDoc({ title: "A question?", alternatives: ["x", "y"], n: 2 }, "## Heading\nText\n");
    const doc = parseDoc(text);
    expect(doc.meta).toEqual({ title: "A question?", alternatives: ["x", "y"], n: 2 });
    expect(doc.body).toContain("## Heading");
  });

  it("leaves out undefined values and empty lists", () => {
    const text = renderDoc({ a: 1, b: undefined, c: [], d: ["x"] }, "");
    expect(parseDoc(text).meta).toEqual({ a: 1, d: ["x"] });
  });

  it("keeps ISO timestamps as strings", () => {
    const at = "2026-10-23T10:00:00.000Z";
    expect(parseDoc(renderDoc({ at }, "")).meta.at).toBe(at);
  });

  it("rejects nested objects", () => {
    expect(() => parseDoc("---\nsource:\n  agent: x\n---\nbody")).toThrow(/flat/);
  });

  it("requires a frontmatter block", () => {
    expect(() => parseDoc("just text")).toThrow(/frontmatter/);
  });

  it("finds a section's text", () => {
    const body = "## A\none\n\n## Strongest alternative\nPostgres.\nMore.\n\n## B\ntwo";
    expect(section(body, "Strongest alternative")).toBe("Postgres.\nMore.");
    expect(section(body, "Missing")).toBeUndefined();
  });
});

describe("similarity", () => {
  it("scores near-identical titles high and unrelated ones low", () => {
    const a = tokens("Use SQLite for the run-metadata store?");
    expect(jaccard(a, tokens("SQLite for run metadata store"))).toBeGreaterThanOrEqual(0.5);
    expect(jaccard(a, tokens("Which test runner?"))).toBe(0);
  });

  it("suggests near topics", () => {
    expect(nearTopics("time/formats", ["time/format", "storage/x"])).toEqual(["time/format"]);
    expect(nearTopics("timestamps/format", ["time/format"])).toEqual(["time/format"]);
    expect(nearTopics("storage/run", ["time/format"])).toEqual([]);
  });
});
