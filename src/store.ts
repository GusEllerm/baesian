import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { z } from "zod";
import { parseDoc, renderDoc, section } from "./frontmatter.js";
import { type Repo, openRepo, slug } from "./git.js";
import { newId, randomSuffix } from "./ids.js";
import {
  Attachment,
  CardDraft,
  CardMeta,
  Config,
  DeckMeta,
  Fallback,
  HARD_BY_DEFAULT,
  type Level,
  Presence,
  STRONGEST_ALTERNATIVE,
  TopicAlias,
  Verdict,
  Withdrawal,
  describeError,
} from "./schema.js";
import { SIMILAR_TITLE, jaccard, nearTopics, tokens } from "./similarity.js";

/** The live layer, inside git's common directory: shared by every worktree of a clone, never committed (D34). */
export const LIVE_DIR = "baesian";
/** The record layer, committed on the branch (D34). */
export const RECORD_DIR = ".baesian";

const KINDS = ["cards", "verdicts", "ledger", "decks", "rules", "topics", "attachments"] as const;

export type Status = "open" | "returned" | "rerouted" | "deferred" | "resolved" | "withdrawn" | "superseded";

/** Statuses that still need the reviewer. */
export const PENDING: ReadonlySet<Status> = new Set(["open", "returned", "rerouted", "deferred"]);

export interface Card {
  meta: CardMeta;
  body: string;
}

export interface Deck {
  meta: DeckMeta;
  body: string;
}

export interface Match {
  card: Card;
  status: Status;
  by: "topic" | "title";
}

export interface FileResult {
  card: Card;
  /** Topics already in use that look like the one filed (D44). Advisory. */
  nearTopics: string[];
  /** Set when the level was raised to `hard` by the card's facts (D42). */
  hardBecause?: string[];
}

export class ValidationError extends Error {}

/** Raised by `fileCard` when the decision may already be open or decided (D36, D38). */
export class PossibleDuplicate extends Error {
  constructor(readonly matches: Match[]) {
    super("this decision may already be on file");
  }
}

function now(): string {
  return new Date().toISOString();
}

function parse<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(`${what} is not valid:\n${describeError(result.error)}`);
  return result.data;
}

export class Store {
  readonly live: string;
  readonly record: string;

  constructor(readonly repo: Repo) {
    this.live = join(repo.commonDir, LIVE_DIR);
    this.record = join(repo.toplevel, RECORD_DIR);
  }

  static open(cwd?: string): Store {
    return new Store(openRepo(cwd));
  }

  // ---------------------------------------------------------------- layers

  /**
   * Set up means the shared live layer exists. A worktree's record is created on first write: a new
   * worktree has no `.baesian/` until the branch it came from committed one.
   */
  isInitialised(): boolean {
    return existsSync(this.live);
  }

  /** Create both layers. Safe to run again. Returns the paths it created. */
  init(config: Config = {}): string[] {
    const created: string[] = [];
    for (const kind of KINDS) {
      const dir = join(this.live, kind);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        created.push(dir);
      }
    }
    const configPath = join(this.record, "config.json");
    if (!existsSync(configPath)) {
      mkdirSync(this.record, { recursive: true });
      writeFileSync(configPath, `${JSON.stringify(parse(Config, config, "config"), null, 2)}\n`);
      created.push(configPath);
    }
    return created;
  }

  config(): Config {
    const path = join(this.record, "config.json");
    return existsSync(path) ? parse(Config, JSON.parse(readFileSync(path, "utf8")), "config.json") : {};
  }

  private requireInit(): void {
    if (!this.isInitialised()) throw new Error("Baesian is not set up in this repository: run `baesian init`");
  }

  /** Write a file that must never change (D34). Fails if it exists. */
  private writeOnce(path: string, text: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, { flag: "wx" });
  }

  /** Copy a live file into this worktree's record, unless it's already there (D37). */
  private toRecord(rel: string): boolean {
    const target = join(this.record, rel);
    if (existsSync(target)) return false;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(this.live, rel), target);
    return true;
  }

  private list(kind: string, sub = ""): string[] {
    const dir = join(this.live, kind, sub);
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  // ---------------------------------------------------------------- cards

  cardIds(): string[] {
    return this.list("cards");
  }

  revisions(id: string): Card[] {
    return this.list("cards", id)
      .filter((f) => /^r\d+\.md$/.test(f))
      .map((f) => {
        const { meta, body } = parseDoc(readFileSync(join(this.live, "cards", id, f), "utf8"));
        return { meta: parse(CardMeta, meta, `${id}/${f}`), body };
      })
      .sort((a, b) => a.meta.revision - b.meta.revision);
  }

  card(id: string): Card | undefined {
    return this.revisions(id).at(-1);
  }

  cards(): Card[] {
    return this.cardIds()
      .map((id) => this.card(id))
      .filter((c): c is Card => c !== undefined);
  }

  /** Validate and normalise a draft, without writing anything. */
  private prepare(draft: unknown, body: string): { draft: CardDraft; nearTopics: string[]; hardBecause?: string[] } {
    const parsed = parse(CardDraft, draft, "the card");
    if (!section(body, STRONGEST_ALTERNATIVE)) {
      throw new ValidationError(
        `the card has no "## ${STRONGEST_ALTERNATIVE}" section. Every card states the best case for another option, or says there is no credible one (D12).`,
      );
    }
    let hardBecause: string[] | undefined;
    const hardFacts = parsed.touches.filter((f) => HARD_BY_DEFAULT.has(f));
    let level: Level = parsed.level ?? "provisional";
    if (parsed.level === undefined && hardFacts.length > 0) {
      level = "hard";
      hardBecause = hardFacts;
    }
    let near: string[] = [];
    let topic = parsed.topic;
    if (topic) {
      topic = this.canonicalTopic(topic);
      const known = this.topics();
      if (!known.has(topic)) near = nearTopics(topic, known);
    }
    return { draft: { ...parsed, level, topic }, nearTopics: near, ...(hardBecause ? { hardBecause } : {}) };
  }

  /** Cards that may already answer `draft` (D36, D38): same topic, or a similar title. */
  matches(draft: { title: string; topic?: string | undefined }): Match[] {
    const topic = draft.topic ? this.canonicalTopic(draft.topic) : undefined;
    const titleTokens = tokens(draft.title);
    const out: Match[] = [];
    for (const card of this.cards()) {
      const status = this.status(card.meta.id);
      if (status === "withdrawn" || status === "superseded") continue;
      const theirs = card.meta.topic ? this.canonicalTopic(card.meta.topic) : undefined;
      if (topic && theirs === topic) out.push({ card, status, by: "topic" });
      else if (jaccard(titleTokens, tokens(card.meta.title)) >= SIMILAR_TITLE) out.push({ card, status, by: "title" });
    }
    return out;
  }

  /**
   * File a new card. Unless `force`, refuses with `PossibleDuplicate` when an open card or a resolved
   * decision may already cover it: attach to the open card, or follow the decision (D36, D38).
   */
  fileCard(draft: unknown, body: string, opts: { agent: string; force?: boolean }): FileResult {
    this.requireInit();
    const prep = this.prepare(draft, body);
    if (!opts.force) {
      const matches = this.matches(prep.draft);
      if (matches.length > 0) throw new PossibleDuplicate(matches);
    }
    const id = newId("B", (candidate) => existsSync(join(this.live, "cards", candidate)));
    const card = this.writeRevision(id, 1, prep.draft, body, opts.agent);
    return { card, nearTopics: prep.nearTopics, ...(prep.hardBecause ? { hardBecause: prep.hardBecause } : {}) };
  }

  /** File the next revision of a returned card: the agent's reply to a verdict. */
  reviseCard(id: string, draft: unknown, body: string, opts: { agent: string }): FileResult {
    this.requireInit();
    const latest = this.card(id);
    if (!latest) throw new Error(`no card ${id}`);
    const status = this.status(id);
    if (status !== "returned") throw new Error(`${id} is ${status}; only a returned card takes a new revision`);
    const prep = this.prepare(draft, body);
    const card = this.writeRevision(id, latest.meta.revision + 1, prep.draft, body, opts.agent);
    return { card, nearTopics: prep.nearTopics, ...(prep.hardBecause ? { hardBecause: prep.hardBecause } : {}) };
  }

  private writeRevision(id: string, revision: number, draft: CardDraft, body: string, agent: string): Card {
    const deck = draft.deck ?? this.ensureBranchDeck();
    if (!this.deck(deck)) throw new Error(`no deck "${deck}": create it with \`baesian deck ${deck}\``);
    const meta = parse(
      CardMeta,
      {
        ...draft,
        type: "card",
        id,
        revision,
        deck,
        source_agent: agent,
        source_branch: this.repo.branch,
        source_worktree: this.repo.toplevel,
        created: now(),
      },
      "the card",
    );
    const rel = join("cards", id, `r${revision}.md`);
    this.writeOnce(join(this.live, rel), renderDoc(meta, body));
    this.toRecord(rel);
    this.toRecord(join("decks", `${deck}.md`));
    return { meta, body };
  }

  /** The agent withdraws its own card. */
  withdraw(id: string, reason: string, by: string): Withdrawal {
    this.requireInit();
    if (!this.card(id)) throw new Error(`no card ${id}`);
    const w = parse(Withdrawal, { type: "withdrawal", card: id, reason, by, at: now() }, "the withdrawal");
    const rel = join("cards", id, "withdrawn.json");
    this.writeOnce(join(this.live, rel), `${JSON.stringify(w, null, 2)}\n`);
    this.toRecord(rel);
    return w;
  }

  /** Wait on an existing card instead of filing a duplicate (D36). Copies the card into this worktree's record. */
  attach(id: string, agent: string): Attachment {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new Error(`no card ${id}`);
    const a = parse(
      Attachment,
      { type: "attachment", card: id, agent, branch: this.repo.branch, worktree: this.repo.toplevel, at: now() },
      "the attachment",
    );
    this.writeOnce(join(this.live, "attachments", `${id}-${randomSuffix()}.json`), `${JSON.stringify(a, null, 2)}\n`);
    for (const r of this.revisions(id)) this.toRecord(join("cards", id, `r${r.meta.revision}.md`));
    this.toRecord(join("decks", `${card.meta.deck}.md`));
    return a;
  }

  attachments(id?: string): Attachment[] {
    return this.list("attachments")
      .filter((f) => !id || f.startsWith(`${id}-`))
      .map((f) => parse(Attachment, JSON.parse(readFileSync(join(this.live, "attachments", f), "utf8")), f));
  }

  /** How many agents are waiting on a card: its filer plus every attachment (D36). */
  waiting(id: string): number {
    return 1 + this.attachments(id).length;
  }

  /** Record that the agent proceeded on a blocking card without a verdict (D46). */
  recordFallback(id: string, reason: Fallback["reason"], agent: string): Fallback {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new Error(`no card ${id}`);
    const f = parse(
      Fallback,
      { type: "fallback", card: id, revision: card.meta.revision, reason, agent, at: now() },
      "the fallback",
    );
    const rel = join("cards", id, `fallback-${randomSuffix()}.json`);
    this.writeOnce(join(this.live, rel), `${JSON.stringify(f, null, 2)}\n`);
    this.toRecord(rel);
    return f;
  }

  fallbacks(id: string): Fallback[] {
    return this.list("cards", id)
      .filter((f) => f.startsWith("fallback-"))
      .map((f) => parse(Fallback, JSON.parse(readFileSync(join(this.live, "cards", id, f), "utf8")), f));
  }

  // ---------------------------------------------------------------- presence

  /** The client's last heartbeat, if it has ever run (D41). */
  presence(): Presence | undefined {
    const path = join(this.live, "presence.json");
    if (!existsSync(path)) return undefined;
    try {
      return parse(Presence, JSON.parse(readFileSync(path, "utf8")), "presence.json");
    } catch {
      return undefined; // a half-written or foreign file means "unknown", never a crash
    }
  }

  /** The client's heartbeat. Written to a temporary file and renamed, so readers never see half a file. */
  touchPresence(client: string, at: string = now()): Presence {
    this.requireInit();
    const p = parse(Presence, { type: "presence", client, at }, "presence");
    const path = join(this.live, "presence.json");
    const tmp = `${path}.${randomSuffix()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(p)}\n`);
    renameSync(tmp, path);
    return p;
  }

  // ---------------------------------------------------------------- decks

  deck(id: string): Deck | undefined {
    const path = join(this.live, "decks", `${id}.md`);
    if (!existsSync(path)) return undefined;
    const { meta, body } = parseDoc(readFileSync(path, "utf8"));
    return { meta: parse(DeckMeta, meta, `decks/${id}.md`), body };
  }

  decks(): Deck[] {
    return this.list("decks")
      .filter((f) => f.endsWith(".md"))
      .map((f) => this.deck(f.slice(0, -3)))
      .filter((d): d is Deck => d !== undefined);
  }

  createDeck(input: { id: string; title: string; from?: string; context_notes?: string[] }, body: string): Deck {
    this.requireInit();
    const meta = parse(
      DeckMeta,
      {
        type: "deck",
        id: input.id,
        title: input.title,
        branch: this.repo.branch,
        ...(input.from ? { from: relative(this.repo.toplevel, input.from) } : {}),
        context_notes: input.context_notes ?? [],
        created: now(),
      },
      "the deck",
    );
    this.writeOnce(join(this.live, "decks", `${meta.id}.md`), renderDoc(meta, body));
    return { meta, body };
  }

  /** The branch's default deck (D29), created on first use. */
  branchDeckId(): string {
    return `branch-${slug(this.repo.branch)}`;
  }

  ensureBranchDeck(): string {
    const id = this.branchDeckId();
    if (!this.deck(id)) {
      this.createDeck(
        { id, title: `Decisions on ${this.repo.branch}` },
        `Decisions filed while working on the branch \`${this.repo.branch}\`.\n`,
      );
    }
    return id;
  }

  // ---------------------------------------------------------------- verdicts

  verdicts(id: string): Verdict[] {
    return this.list("verdicts")
      .filter((f) => f.startsWith(`${id}-`))
      .map((f) => parse(Verdict, JSON.parse(readFileSync(join(this.live, "verdicts", f), "utf8")), f))
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Record a verdict. Only the client calls this: agents never resolve cards (D32). */
  addVerdict(input: Omit<Verdict, "type" | "at"> & { at?: string }): Verdict {
    this.requireInit();
    const card = this.card(input.card);
    if (!card) throw new Error(`no card ${input.card}`);
    if (input.revision !== card.meta.revision) {
      throw new Error(`${input.card} is at revision ${card.meta.revision}; a verdict on r${input.revision} is stale`);
    }
    // A card's verdicts are ordered by `at`, so keep it strictly increasing per card: two verdicts in
    // the same millisecond would otherwise sort arbitrarily, and "the latest verdict" decides the status.
    let at = input.at ?? now();
    const previous = this.verdicts(input.card).at(-1)?.at;
    if (previous && at <= previous) at = new Date(Date.parse(previous) + 1).toISOString();
    const v = parse(Verdict, { ...input, type: "verdict", at }, "the verdict");
    const name = `${v.card}-r${v.revision}-${randomSuffix()}.json`;
    this.writeOnce(join(this.live, "verdicts", name), `${JSON.stringify(v, null, 2)}\n`);
    return v;
  }

  // ---------------------------------------------------------------- status

  /** A card's status, computed from its files; nothing is ever edited in place (D34). */
  status(id: string, seen: Set<string> = new Set()): Status {
    const card = this.card(id);
    if (!card) throw new Error(`no card ${id}`);
    if (existsSync(join(this.live, "cards", id, "withdrawn.json"))) return "withdrawn";
    seen.add(id);
    // Rejecting a parent withdraws the cards that depend on it (D14). `>=`, not `>`: timestamps have
    // millisecond resolution, and a rejection in the same millisecond as the filing still counts.
    for (const parent of card.meta.depends_on) {
      const rejectedAfter = this.verdicts(parent).some((v) => v.response === "reject" && v.at >= card.meta.created);
      if (rejectedAfter) return "withdrawn";
    }
    for (const other of this.cards()) {
      if (other.meta.supersedes === id && !seen.has(other.meta.id) && this.status(other.meta.id, seen) === "resolved") {
        return "superseded";
      }
    }
    const last = this.verdicts(id)
      .filter((v) => v.revision === card.meta.revision)
      .at(-1);
    if (!last) return "open";
    switch (last.response) {
      case "accept":
      case "alternative":
      case "correction":
        return "resolved";
      case "reject":
      case "question":
      case "need_context":
        return "returned";
      case "not_my_area":
        return "rerouted";
      case "defer":
        return "deferred";
    }
  }

  /** What was decided, for a resolved card. */
  decision(id: string): string | undefined {
    const card = this.card(id);
    if (!card || this.status(id) !== "resolved") return undefined;
    const last = this.verdicts(id)
      .filter((v) => v.revision === card.meta.revision)
      .at(-1);
    return last?.response === "accept" ? card.meta.proposal : last?.choice;
  }

  // ---------------------------------------------------------------- topics

  aliases(): TopicAlias[] {
    return this.list("topics")
      .filter((f) => f.startsWith("alias-"))
      .map((f) => parse(TopicAlias, JSON.parse(readFileSync(join(this.live, "topics", f), "utf8")), f));
  }

  /** Follow topic aliases to the canonical key (D44). */
  canonicalTopic(topic: string): string {
    const map = new Map(this.aliases().map((a) => [a.from, a.to]));
    let current = topic;
    for (let hops = 0; map.has(current) && hops < 20; hops++) current = map.get(current)!;
    return current;
  }

  topics(): Set<string> {
    return new Set(
      this.cards()
        .map((c) => c.meta.topic)
        .filter((t): t is string => t !== undefined)
        .map((t) => this.canonicalTopic(t)),
    );
  }

  // ---------------------------------------------------------------- inbox

  /** Cards this branch filed or attached to. */
  branchCards(branch: string = this.repo.branch): Card[] {
    const attached = new Set(this.attachments().filter((a) => a.branch === branch).map((a) => a.card));
    return this.cards().filter((c) => c.meta.source_branch === branch || attached.has(c.meta.id));
  }

  /** Verdicts on this branch's cards newer than its inbox cursor. The cursor is local state, not a record. */
  inbox(opts: { advance: boolean }): Verdict[] {
    this.requireInit();
    const cursorPath = join(this.live, "cursors", `${slug(this.repo.branch)}.json`);
    const since: string = existsSync(cursorPath) ? JSON.parse(readFileSync(cursorPath, "utf8")).at : "";
    const fresh = this.branchCards()
      .flatMap((c) => this.verdicts(c.meta.id))
      .filter((v) => v.at > since)
      .sort((a, b) => a.at.localeCompare(b.at));
    if (opts.advance && fresh.length > 0) {
      mkdirSync(dirname(cursorPath), { recursive: true });
      writeFileSync(cursorPath, `${JSON.stringify({ at: fresh.at(-1)!.at })}\n`);
    }
    return fresh;
  }

  // ---------------------------------------------------------------- record

  /**
   * Copy verdicts and ledger entries for the cards this worktree's record holds (D37). Run by
   * `baesian sync`, and by the pre-commit hook. Returns the files it added.
   */
  syncRecord(): string[] {
    this.requireInit();
    const recordCards = join(this.record, "cards");
    const held = existsSync(recordCards) ? readdirSync(recordCards) : [];
    const added: string[] = [];
    for (const id of held) {
      // Everything in the card's directory: revisions, a withdrawal, fallbacks.
      for (const f of this.list("cards", id)) {
        const rel = join("cards", id, f);
        if (this.toRecord(rel)) added.push(rel);
      }
      for (const kind of ["verdicts", "ledger"] as const) {
        for (const f of this.list(kind).filter((name) => name.startsWith(`${id}-`))) {
          const rel = join(kind, f);
          if (this.toRecord(rel)) added.push(rel);
        }
      }
    }
    return added;
  }
}
