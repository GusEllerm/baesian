import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("requires the strongest alternative, as a field (D12, D92)", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ alternative: undefined }), BODY, AGENT)).toThrow(ValidationError);
    expect(() => store.fileCard(draft({ alternative_then: undefined }), BODY, AGENT)).toThrow(ValidationError);
  });

  it("files a card with no body: the body is optional context (D92)", () => {
    const { store } = repo();
    expect(store.fileCard(draft(), "", AGENT).card.body.trim()).toBe("");
  });

  it("requires the core: question, trigger, topic, reversibility and the crux (D66, D73, D74, D77, D95)", () => {
    const { store } = repo();
    for (const field of ["question", "doing", "topic", "reverse", "crux", "crux_proposal", "crux_alternative"]) {
      expect(() => store.fileCard(draft({ [field]: undefined }), BODY, AGENT), field).toThrow(ValidationError);
    }
  });

  it("rejects two options that are really one, and a crux that doesn't decide between them (D74)", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ alternative: "sqlite  (WAL MODE)" }), BODY, AGENT)).toThrow(/two real options/);
    expect(() => store.fileCard(draft({ crux_alternative: "if not" }), BODY, AGENT)).toThrow(/doesn't decide/);
  });

  it("asks for wrong_if and check when a facet does (D77)", () => {
    const { store } = repo();
    const premise = { premise: "assumes one writer", premise_option: "proposal", premise_check: "count writers in CI" };
    for (const facet of [{ reverse: "one-way" }, { touches: ["security"] }, premise]) {
      expect(() => store.fileCard(draft(facet), BODY, AGENT)).toThrow(/wrong_if and check are required/);
      const ok = store.fileCard(draft({ ...facet, wrong_if: "two machines write runs", check: "the CI matrix" }), BODY, { ...AGENT, force: true });
      expect(ok.card.meta.wrong_if).toBe("two machines write runs");
    }
  });

  it("wants all of a facet's fields or none (D75)", () => {
    const { store } = repo();
    const half = { premise: "assumes one writer", wrong_if: "x", check: "y" };
    expect(() => store.fileCard(draft(half), BODY, AGENT)).toThrow(/premise .* facet needs all of its fields/);
    expect(() => store.fileCard(draft({ acted: "wrote the migration" }), BODY, AGENT)).toThrow(/acted .* facet/);
  });

  it("rejects references to cards and rules that don't exist", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ depends_on: ["B-zzzzz"] }), BODY, AGENT)).toThrow(/depends_on names B-zzzzz/);
    expect(() => store.fileCard(draft({ rules: ["R-zzzzz"] }), BODY, AGENT)).toThrow(/rules names R-zzzzz/);
    expect(() => store.fileCard(draft({ alternative_breaks: ["B-zzzzz"] }), BODY, AGENT)).toThrow(/alternative_breaks/);
    const first = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const ok = store.fileCard(draft({ topic: "storage/other", title: "Another store", depends_on: [first], proposal_breaks: [first] }), BODY, AGENT);
    expect(ok.card.meta.depends_on).toEqual([first]);
  });

  it("warns about long fields, and files anyway", () => {
    const { store } = repo();
    const r = store.fileCard(draft({ proposal: "SQLite in write-ahead-log mode with a nightly backup to the shared drive" }), BODY, AGENT);
    expect(r.warnings.join()).toMatch(/proposal is \d+ characters/);
    expect(store.fileCard(draft({ topic: "storage/other", title: "Another store" }), BODY, AGENT).warnings).toEqual([]);
  });

  it("validates the draft", () => {
    const { store } = repo();
    expect(() => store.fileCard(draft({ touches: ["vibes"] }), BODY, AGENT)).toThrow(/not valid/);
    expect(() => store.fileCard(draft({ topic: "Not A Topic" }), BODY, AGENT)).toThrow(/topic/);
  });

  it("makes cards that spend money or delete data hard, whatever level the agent asks for (D42, D144)", () => {
    const { store } = repo();
    const result = store.fileCard(draft({ title: "Delete old runs?", topic: "retention", touches: ["data-loss"] }), BODY, AGENT);
    expect(result.card.meta.level).toBe("hard");
    expect(result.hardBecause).toEqual(["data-loss"]);
    // An agent may raise a card's level, never lower it: asking for less than hard doesn't take.
    const lower = store.fileCard(draft({ title: "Buy a domain?", topic: "domain", touches: ["money"], level: "blocking" }), BODY, AGENT);
    expect(lower.card.meta.level).toBe("hard");
    expect(lower.hardBecause).toEqual(["money"]);
    const security = store.fileCard(draft({ title: "Where the token lives", question: "Where should the token live?", topic: "auth/token", touches: ["security"], level: "provisional", wrong_if: "a page script reads it", check: "the client's scripts" }), BODY, AGENT);
    expect(security.card.meta.level).toBe("hard");
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

  it("stops a similar title under another topic", () => {
    const { store } = repo();
    store.fileCard(draft(), BODY, AGENT);
    expect(() => store.fileCard(draft({ topic: "storage/runs", title: "The store for run metadata" }), BODY, AGENT)).toThrow(
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

  it("merges two topics into one, from the client (D44, D111)", () => {
    const { store } = repo();
    store.fileCard(draft({ title: "Timestamp format?", topic: "time/format" }), BODY, AGENT);
    store.fileCard(draft({ title: "Clock source?", topic: "time/formats" }), BODY, { ...AGENT, force: true });
    const alias = store.mergeTopics("time/formats", "time/format", "gus");
    expect(alias).toMatchObject({ from: "time/formats", to: "time/format", by: "gus" });
    expect(store.canonicalTopic("time/formats")).toBe("time/format");
    expect(readdirSync(join(store.record, "topics")).filter((f) => f.startsWith("alias-"))).toHaveLength(1);
    // Merging again, or into a topic nobody uses, is refused.
    expect(() => store.mergeTopics("time/formats", "time/format", "gus")).toThrow(/already the same topic/);
    expect(() => store.mergeTopics("time/format", "clocks/source", "gus")).toThrow(/no card uses the topic "clocks\/source"/);
  });

  it("merges from a topic's canonical key, so aliases never form a cycle", () => {
    const { store } = repo();
    for (const [title, topic] of [["A?", "a/x"], ["B?", "b/x"], ["C?", "c/x"]]) store.fileCard(draft({ title, topic }), BODY, { ...AGENT, force: true });
    store.mergeTopics("a/x", "b/x", "gus");
    store.mergeTopics("b/x", "c/x", "gus");
    expect(store.canonicalTopic("a/x")).toBe("c/x");
    expect(() => store.mergeTopics("c/x", "a/x", "gus")).toThrow(/already the same topic/);
  });
});

describe("filing at the same moment as another agent", () => {
  it("doesn't fail when another agent creates the branch deck first", () => {
    const { store } = repo();
    store.fileCard(draft(), BODY, AGENT); // the deck exists now
    // This agent looked before the other one wrote it, so it tries to create the deck too.
    vi.spyOn(store, "deck").mockReturnValueOnce(undefined);
    expect(() => store.fileCard(draft({ title: "Another store", topic: "storage/other" }), BODY, AGENT)).not.toThrow();
  });
});

describe("verdicts", () => {
  it("returns a card on \"I need to see it run\" (D85)", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    store.addVerdict({ card: id, revision: 1, response: "see_it_run", ...REVIEWER });
    expect(store.status(id)).toBe("returned");
  });

  it("records which client wrote it, and the choice made before the agent's pick showed (D62, D88)", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    expect(() => store.addVerdict({ card: id, revision: 1, response: "accept", reviewer: "gus" } as never)).toThrow(/client/);
    const v = store.addVerdict({ card: id, revision: 1, response: "accept", first_choice: "alternative", ...REVIEWER });
    expect(store.verdicts(id)).toEqual([v]);
    expect(v).toMatchObject({ client: "test", first_choice: "alternative" });
    expect(store.decision(id)).toBe("SQLite (WAL mode)");
  });

  it("are named for when they were given, so a listing shows them in order (D107)", () => {
    const { store } = repo();
    const a = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const b = store.fileCard(draft({ title: "Run file layout", question: "Where do run files go?", topic: "storage/run-files" }), BODY, AGENT).card.meta.id;
    const first = store.addVerdict({ card: b, revision: 1, response: "question", comment: "Why there?", ...REVIEWER, at: "2026-11-01T09:30:12.345Z" });
    const second = store.addVerdict({ card: a, revision: 1, response: "accept", ...REVIEWER, at: "2026-11-01T09:31:00.000Z" });
    const third = store.addVerdict({ card: b, revision: 1, response: "accept", ...REVIEWER, at: "2026-11-01T09:32:00.000Z" });
    const names = readdirSync(join(store.live, "verdicts")).sort();
    expect(names.map((n) => n.slice(0, 20))).toEqual(["20261101T093012.345Z", "20261101T093100.000Z", "20261101T093200.000Z"]);
    expect(names[0]).toMatch(new RegExp(`^20261101T093012\\.345Z-${b}-r1-[0-9a-z]+\\.json$`));
    // Each card still finds its own, whatever the order of the names.
    expect(store.verdicts(b)).toEqual([first, third]);
    expect(store.verdicts(a)).toEqual([second]);
  });
});

describe("cards don't record the folder they were filed from (D105)", () => {
  it("leaves the path out of the record, and refuses a draft that carries one", () => {
    const { store } = repo();
    const { card } = store.fileCard(draft(), BODY, AGENT);
    expect(card.meta).not.toHaveProperty("source_worktree");
    expect(card.meta).toMatchObject({ source_agent: "claude-code", source_branch: "main" });
    expect(() => store.fileCard(draft({ title: "Another", question: "Another?", topic: "x/y", source_worktree: "/Users/someone/repo" }), BODY, AGENT)).toThrow(/source_worktree/);
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
    const r2 = store.reviseCard(id, draft({ proposal: "Postgres", alternative: "SQLite (WAL mode)" }), BODY, AGENT);
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
    const next = store.fileCard(draft({ proposal: "Postgres", alternative: "SQLite (WAL mode)", supersedes: old }), BODY, { ...AGENT, force: true }).card.meta.id;
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

  it("lets only the agent that filed a card, or one attached to it, withdraw it", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, AGENT).card.meta.id;
    expect(() => store.withdraw(id, "Not mine to drop.", "codex")).toThrow(/filed by claude-code/);
    store.attach(id, "codex");
    expect(store.withdraw(id, "Not needed after all.", "codex").by).toBe("codex");
  });
});

describe("parallel worktrees (D34)", () => {
  it("shares the live layer and keeps each record separate", () => {
    const main = repo();
    const id = main.store.fileCard(draft(), BODY, AGENT).card.meta.id;
    const feat = worktree(main.dir, "feat/other");
    expect(feat.store.live).toBe(main.store.live);
    expect(feat.store.card(id)?.meta.title).toBe("The run-metadata store");
    expect(existsSync(join(feat.store.record, "cards", id))).toBe(false);

    // The other worktree's agent asks the same question: it should attach, not duplicate.
    expect(() => feat.store.fileCard(draft({ title: "Storage for run metadata?" }), BODY, AGENT)).toThrow(PossibleDuplicate);
    feat.store.attach(id, "codex");
    expect(feat.store.attachments()).toEqual([expect.objectContaining({ card: id, agent: "codex", branch: "feat/other" })]);
    expect(feat.store.attachments()[0]).not.toHaveProperty("worktree"); // the branch names the folder (D121)
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
    expect(added[0]).toMatch(new RegExp(`^verdicts/\\d{8}T\\d{6}\\.\\d{3}Z-${id}-r1-[0-9a-z]+\\.json$`));
    expect(store.syncRecord()).toEqual([]);
  });
});

describe("reading through a view", () => {
  it("gives the statuses reading afresh does, and the next view sees what changed in this one", () => {
    const { store } = repo();
    const ids = [0, 1, 2].map((i) => store.fileCard(draft({ title: `Card ${i}`, question: `Question ${i}?`, topic: `area${i}/x` }), BODY, { agent: "a", force: true }).card.meta.id);
    store.addVerdict({ card: ids[0]!, revision: 1, response: "accept", ...REVIEWER });
    const statuses = (s: typeof store) => s.cards().map((c) => s.status(c.meta.id));
    const outside = statuses(store);
    expect(store.view(() => statuses(store))).toEqual(outside);
    // A verdict written during a view is seen by the next read.
    store.view(() => {
      statuses(store);
      store.addVerdict({ card: ids[1]!, revision: 1, response: "reject", comment: "No.", ...REVIEWER });
    });
    expect(store.status(ids[1]!)).toBe("returned");
    expect(store.view(() => store.status(ids[1]!))).toBe("returned");
  });

  it("stays loud without a report: a bad file throws, as the CLI needs", () => {
    const { store } = repo();
    const id = store.fileCard(draft(), BODY, { agent: "a" }).card.meta.id;
    writeFileSync(join(store.live, "cards", id, "r1.md"), "---\nnot: a card\n---\n");
    expect(() => store.view(() => store.cards())).toThrow(/is not valid/);
    const skipped: string[] = [];
    expect(store.view(() => store.cards(), (path) => skipped.push(path))).toEqual([]);
    expect(skipped).toEqual([`cards/${id}/r1.md`]);
  });
});
