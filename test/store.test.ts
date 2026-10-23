import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PossibleDuplicate, ValidationError } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, repo, worktree } from "./helpers.js";

afterEach(cleanup);

const AGENT = { agent: "claude-code" };

describe("layers", () => {
  it("puts the live layer in git's common dir and the record in the worktree", () => {
    const { dir, store } = repo();
    expect(store.live).toBe(join(dir, ".git", "baesian"));
    expect(store.record).toBe(join(dir, ".baesian"));
    expect(existsSync(join(store.record, "config.json"))).toBe(true);
    expect(store.init()).toEqual([]); // idempotent
  });

  it("works in a new worktree without re-running init", () => {
    const main = repo();
    const feat = worktree(main.dir, "feat/x");
    expect(feat.store.isInitialised()).toBe(true);
    expect(existsSync(feat.store.record)).toBe(false);
    feat.store.fileCard(draft(), BODY, AGENT);
    expect(existsSync(feat.store.record)).toBe(true);
  });

  it("refuses to work before init", () => {
    const { store } = repo();
    const fresh = Object.create(store);
    Object.defineProperty(fresh, "isInitialised", { value: () => false });
    expect(() => fresh.fileCard(draft(), BODY, AGENT)).toThrow(/baesian init/);
  });
});

describe("filing", () => {
  it("files a card into both layers, in the branch's default deck", () => {
    const { store } = repo();
    const { card } = store.fileCard(draft(), BODY, AGENT);
    expect(card.meta.revision).toBe(1);
    expect(card.meta.deck).toBe("branch-main");
    expect(card.meta.source_branch).toBe("main");
    expect(card.meta.level).toBe("provisional");
    const rel = join("cards", card.meta.id, "r1.md");
    expect(existsSync(join(store.live, rel))).toBe(true);
    expect(existsSync(join(store.record, rel))).toBe(true);
    expect(existsSync(join(store.record, "decks", "branch-main.md"))).toBe(true);
    expect(store.status(card.meta.id)).toBe("open");
  });

  it("requires the strongest alternative (D12)", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft(), "## Recommendation\nSQLite.\n", AGENT)).toThrow(ValidationError);
  });

  it("validates the draft", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ touches: ["vibes"] }), BODY, AGENT)).toThrow(/not valid/);
    expect(() => store.fileCard(draft({ topic: "Not A Topic" }), BODY, AGENT)).toThrow(/topic/);
  });

  it("makes cards that spend money or delete data hard by default (D42)", () => {
    const { store } = repo();
    const result = store.fileCard(draft({ title: "Delete old runs?", topic: "retention", touches: ["data-loss"] }), BODY, AGENT);
    expect(result.card.meta.level).toBe("hard");
    expect(result.hardBecause).toEqual(["data-loss"]);
    const explicit = store.fileCard(draft({ title: "Buy a domain?", topic: "domain", touches: ["money"], level: "blocking" }), BODY, AGENT);
    expect(explicit.card.meta.level).toBe("blocking");
  });

  it("refuses an unknown named deck, and accepts a created one", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ deck: "storage-layer" }), BODY, AGENT)).toThrow(/no deck/);
    store.createDeck({ id: "storage-layer", title: "Storage" }, "## Goal\nPersist runs.\n");
    expect(store.fileCard(draft({ deck: "storage-layer" }), BODY, AGENT).card.meta.deck).toBe("storage-layer");
  });
});

describe("the filing check (D36, D38)", () => {
  it("stops a second card on the same topic", () => {
    const { store } = repo();
    const first = store.fileCard(draft(), BODY, AGENT).card;
    try {
      store.fileCard(draft({ title: "Postgres or SQLite?" }), BODY, AGENT);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PossibleDuplicate);
      const [m] = (e as PossibleDuplicate).matches;
      expect(m?.card.meta.id).toBe(first.meta.id);
      expect(m?.by).toBe("topic");
    }
  });

  it("stops a similar title without a topic", () => {
    const { store } = repo();
    store.fileCard(draft({ topic: undefined }), BODY, AGENT);
    expect(() => store.fileCard(draft({ topic: undefined, title: "SQLite for run metadata store?" }), BODY, AGENT)).toThrow(
      PossibleDuplicate,
    );
  });

  it("also matches resolved decisions, and lets --new through", () => {
    const { store } = repo();
    const first = store.fileCard(draft(), BODY, AGENT).card;
    store.addVerdict({ card: first.meta.id, revision: 1, response: "accept", ...REVIEWER });
    try {
      store.fileCard(draft({ title: "Epoch or ISO?" }), BODY, AGENT);
      expect.unreachable();
    } catch (e) {
      expect((e as PossibleDuplicate).matches[0]?.status).toBe("resolved");
    }
    const forced = store.fileCard(draft({ supersedes: first.meta.id }), BODY, { ...AGENT, force: true });
    expect(forced.card.meta.supersedes).toBe(first.meta.id);
  });

  it("follows topic aliases and suggests near topics (D44)", () => {
    const { store } = repo();
    store.fileCard(draft({ title: "Timestamp format?", topic: "time/format" }), BODY, AGENT);
    const near = store.fileCard(draft({ title: "Clock source?", topic: "time/formats" }), BODY, { ...AGENT, force: true });
    expect(near.nearTopics).toEqual(["time/format"]);
    writeFileSync(
      join(store.live, "topics", "alias-aaaaa.json"),
      JSON.stringify({ type: "topic-alias", from: "timestamps/format", to: "time/format", by: "gus", at: new Date().toISOString() }),
    );
    expect(store.canonicalTopic("timestamps/format")).toBe("time/format");
    expect(() => store.fileCard(draft({ title: "Epoch ints?", topic: "timestamps/format" }), BODY, AGENT)).toThrow(
      PossibleDuplicate,
    );
  });
});

describe("status (computed, never stored)", () => {
  it("resolves on accept, an alternative or a correction", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "alternative", choice: "Parquet files", ...REVIEWER });
    expect(store.status(id)).toBe("resolved");
    expect(store.decision(id)).toBe("Parquet files");
  });

  it("returns on reject, and reopens with a new revision", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "reject", comment: "Not a good idea.", ...REVIEWER });
    expect(store.status(id)).toBe("returned");
    const r2 = store.reviseCard(id, draft({ proposal: "Postgres" }), BODY, AGENT);
    expect(r2.card.meta.revision).toBe(2);
    expect(store.status(id)).toBe("open");
    expect(() => store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER })).toThrow(/stale/);
    store.addVerdict({ card: id, revision: 2, response: "accept", ...REVIEWER });
    expect(store.decision(id)).toBe("Postgres");
  });

  it("only revises returned cards", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    expect(() => store.reviseCard(id, draft(), BODY, AGENT)).toThrow(/only a returned card/);
  });

  it("reroutes, defers, and needs reasons where it should", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "not_my_area", ...REVIEWER });
    expect(store.status(id)).toBe("rerouted");
    expect(() => store.addVerdict({ card: id, revision: 1, response: "defer", ...REVIEWER })).toThrow(/comment/);
    store.addVerdict({ card: id, revision: 1, response: "defer", comment: "After the benchmark.", ...REVIEWER });
    expect(store.status(id)).toBe("deferred");
  });

  it("withdraws cards whose parent is rejected (D14)", () => {
    const { store } = repo();
    const parent = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const child = store.fileCard(
      draft({ title: "WAL checkpoint interval?", topic: "storage/wal", depends_on: [parent] }),
      BODY,
      AGENT,
    ).card.meta.id;
    store.addVerdict({ card: parent, revision: 1, response: "reject", ...REVIEWER });
    expect(store.status(child)).toBe("withdrawn");
  });

  it("marks a decision superseded once the card superseding it resolves", () => {
    const { store } = repo();
    const old = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: old, revision: 1, response: "accept", ...REVIEWER });
    const next = store.fileCard(draft({ proposal: "Postgres", supersedes: old }), BODY, { ...AGENT, force: true }).card.meta.id;
    expect(store.status(old)).toBe("resolved");
    store.addVerdict({ card: next, revision: 1, response: "accept", ...REVIEWER });
    expect(store.status(old)).toBe("superseded");
  });

  it("orders verdicts given in the same millisecond", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const at = new Date().toISOString();
    store.addVerdict({ card: id, revision: 1, response: "not_my_area", at, ...REVIEWER });
    store.addVerdict({ card: id, revision: 1, response: "accept", at, ...REVIEWER });
    expect(store.status(id)).toBe("resolved");
  });

  it("lets the agent withdraw its own card", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.withdraw(id, "Not needed after all.", "claude-code");
    expect(store.status(id)).toBe("withdrawn");
    expect(() => store.withdraw(id, "again", "claude-code")).toThrow(); // write-once
  });
});

describe("parallel worktrees (D34)", () => {
  it("shares the live layer and keeps each record separate", () => {
    const main = repo();
    const id = main.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const feat = worktree(main.dir, "feat/other");
    expect(feat.store.live).toBe(main.store.live);
    expect(feat.store.card(id)?.meta.title).toBe("Use SQLite for the run-metadata store?");
    expect(existsSync(join(feat.store.record, "cards", id))).toBe(false);

    // The other worktree's agent asks the same question: it should attach, not duplicate.
    expect(() => feat.store.fileCard(draft({ title: "Storage for run metadata?" }), BODY, AGENT)).toThrow(PossibleDuplicate);
    feat.store.attach(id, "codex");
    expect(existsSync(join(feat.store.record, "cards", id, "r1.md"))).toBe(true);
    expect(main.store.waiting(id)).toBe(2);
    expect(feat.store.branchCards().map((c) => c.meta.id)).toEqual([id]);
  });

  it("delivers a verdict to every branch waiting on the card", () => {
    const main = repo();
    const id = main.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const feat = worktree(main.dir, "feat/other");
    feat.store.attach(id, "codex");
    main.store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect(main.store.inbox({ advance: true })).toHaveLength(1);
    expect(feat.store.inbox({ advance: true })).toHaveLength(1);
    expect(feat.store.inbox({ advance: true })).toHaveLength(0);
  });
});

describe("the record (D37)", () => {
  it("syncs verdicts for the cards a branch holds", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    expect(existsSync(join(store.record, "verdicts"))).toBe(false);
    const added = store.syncRecord();
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(new RegExp(`^verdicts/${id}-r1-`));
    expect(store.syncRecord()).toEqual([]);
  });
});
