import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { z } from "zod";
import { parseDoc, renderDoc } from "./frontmatter.js";
import { type Repo, openRepo, slug } from "./git.js";
import { newId, randomSuffix } from "./ids.js";
import {
  Attachment,
  CardDraft,
  CardMeta,
  Config,
  FACT_PATTERN,
  DeckMeta,
  Fallback,
  HARD_BY_DEFAULT,
  LedgerMeta,
  type Level,
  Presence,
  RuleMeta,
  TopicAlias,
  Verdict,
  Waiting,
  Withdrawal,
  filingProblems,
  filingWarnings,
  describeError,
} from "./schema.js";
import { SIMILAR_TITLE, jaccard, nearTopics, tokens } from "./similarity.js";

/** The live layer, inside git's common directory: shared by every worktree of a clone, never committed (D34). */
export const LIVE_DIR = "baesian";
/** The record layer, committed on the branch (D34). */
export const RECORD_DIR = ".baesian";

const KINDS = ["cards", "verdicts", "ledger", "decks", "rules", "topics", "attachments", "waiting"] as const;

export type { Brief, Status } from "./api.js";
import type { Brief, Status } from "./api.js";

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

/** One thing for an agent in `baesian inbox`: a verdict, and the brief that goes with it. */
export interface InboxItem {
  /** The card the agent filed. */
  card: string;
  /** The verdict: on this card, or, for a returned dependent, on the card it builds on. */
  verdict: Verdict;
  brief?: Brief;
}

/** The card a verdict file is for, from its name: `<at>-<id>-r<revision>-<suffix>.json` (D107). */
const VERDICT_FILE = /^\d{8}T\d{6}\.\d{3}Z-(B-[0-9a-z]{5})-r\d+-[0-9a-z]+\.json$/;
export const verdictFileCard = (name: string): string | undefined => VERDICT_FILE.exec(name)?.[1];

/** A waiting marker counts as gone after three missed beats, as presence does (D41, D90). */
export const WAITING_BEAT_MS = 30_000;
export const WAITING_STALE_MS = 90_000;

export interface FileResult {
  card: Card;
  /** Topics already in use that look like the one filed (D44). Advisory. */
  nearTopics: string[];
  /** Set when the level was raised to `hard` by the card's facts (D42). */
  hardBecause?: string[];
  /** Advice on fields that file anyway, such as long ones. */
  warnings: string[];
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

/** Compare decisions loosely: case and spacing don't make two answers different. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function parse<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(`${what} is not valid:\n${describeError(result.error)}`);
  return result.data;
}

export class Store {
  readonly live: string;
  readonly record: string;
  /** A read-only store over one directory, e.g. a commit's record in CI (M3b). */
  readonly readOnly: boolean;

  constructor(
    readonly repo: Repo,
    layers?: { dir: string },
  ) {
    this.live = layers ? layers.dir : join(repo.commonDir, LIVE_DIR);
    this.record = layers ? layers.dir : join(repo.toplevel, RECORD_DIR);
    this.readOnly = layers !== undefined;
  }

  static open(cwd?: string): Store {
    return new Store(openRepo(cwd));
  }

  /**
   * Read a record as if it were the live layer. This is how CI sees cards and verdicts: it has no
   * live layer, only what was committed (D34).
   */
  static overRecord(repo: Repo, dir: string): Store {
    return new Store(repo, { dir });
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
    if (this.readOnly) throw new Error("this store is a read-only view of a committed record");
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
    const cached = this.session?.lists.get(dir);
    if (cached) return cached;
    const names = existsSync(dir) ? readdirSync(dir).sort() : [];
    this.session?.lists.set(dir, names);
    return names;
  }

  /** One consistent read of the live layer, while `view` runs. */
  private session?: { files: Map<string, unknown>; lists: Map<string, string[]>; report: (path: string, error: string) => void };

  /**
   * Run `fn` over one consistent view of the live layer: each file is read once, and a file that can't be read
   * (half-written, or invalid) is reported and skipped instead of thrown. The server reads through this (D84).
   */
  view<T>(fn: () => T, report: (path: string, error: string) => void): T {
    const outer = this.session;
    this.session = { files: new Map(), lists: new Map(), report };
    try {
      return fn();
    } finally {
      this.session = outer;
    }
  }

  /** Read and parse one live file: throws, unless a view is reporting problems instead. */
  private read<T>(path: string, parseText: (text: string) => T): T | undefined {
    if (this.session?.files.has(path)) return this.session.files.get(path) as T | undefined;
    let value: T | undefined;
    try {
      value = parseText(readFileSync(path, "utf8"));
    } catch (e) {
      if (!this.session) throw e;
      this.session.report(relative(this.live, path), e instanceof Error ? e.message : String(e));
    }
    this.session?.files.set(path, value);
    return value;
  }

  // ---------------------------------------------------------------- cards

  cardIds(): string[] {
    return this.list("cards");
  }

  revisions(id: string): Card[] {
    return this.list("cards", id)
      .filter((f) => /^r\d+\.md$/.test(f))
      .flatMap((f) => this.read(join(this.live, "cards", id, f), (text) => {
        const { meta, body } = parseDoc(text);
        return { meta: parse(CardMeta, meta, `${id}/${f}`), body };
      }) ?? [])
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

  /**
   * Validate and normalise a draft, without writing anything. The body is optional context (D92): the
   * strongest alternative is a field now, and the filing rules check it (D12, D77).
   */
  private prepare(draft: unknown): { draft: CardDraft; nearTopics: string[]; hardBecause?: string[]; warnings: string[] } {
    const parsed = parse(CardDraft, draft, "the card");
    const problems = [...filingProblems(parsed), ...this.unknownRefs(parsed)];
    if (problems.length) throw new ValidationError(`the card can't be filed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
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
    return { draft: { ...parsed, level, topic }, nearTopics: near, ...(hardBecause ? { hardBecause } : {}), warnings: filingWarnings(parsed) };
  }

  /** Cards and rules a draft names that don't exist. */
  private unknownRefs(d: CardDraft): string[] {
    const rules = new Set(this.rules().map((r) => r.meta.id));
    const missing = (ids: string[]) => ids.filter((id) => (id.startsWith("R-") ? !rules.has(id) : !this.card(id)));
    const out: string[] = [];
    for (const [field, ids] of [["depends_on", d.depends_on], ["rules", d.rules], ["proposal_breaks", d.proposal_breaks], ["alternative_breaks", d.alternative_breaks]] as const) {
      const gone = missing([...ids]);
      if (gone.length) out.push(`${field} names ${gone.join(", ")}, which ${gone.length === 1 ? "doesn't" : "don't"} exist`);
    }
    return out;
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
    const prep = this.prepare(draft);
    if (!opts.force) {
      const matches = this.matches(prep.draft);
      if (matches.length > 0) throw new PossibleDuplicate(matches);
    }
    const id = newId("B", (candidate) => existsSync(join(this.live, "cards", candidate)));
    const card = this.writeRevision(id, 1, prep.draft, body, opts.agent);
    return { card, nearTopics: prep.nearTopics, ...(prep.hardBecause ? { hardBecause: prep.hardBecause } : {}), warnings: prep.warnings };
  }

  /** File the next revision of a returned card: the agent's reply to a verdict. */
  reviseCard(id: string, draft: unknown, body: string, opts: { agent: string }): FileResult {
    this.requireInit();
    const latest = this.card(id);
    if (!latest) throw new Error(`no card ${id}`);
    const status = this.status(id);
    if (status !== "returned") throw new Error(`${id} is ${status}; only a returned card takes a new revision`);
    const prep = this.prepare(draft);
    const card = this.writeRevision(id, latest.meta.revision + 1, prep.draft, body, opts.agent);
    return { card, nearTopics: prep.nearTopics, ...(prep.hardBecause ? { hardBecause: prep.hardBecause } : {}), warnings: prep.warnings };
  }

  /**
   * Whether the agent may still reply to this card (D89, D104): its latest answer went against the agent's pick
   * (the alternative, or the reviewer's own answer), and it hasn't had its one reply.
   */
  canReply(id: string): boolean {
    const card = this.card(id);
    if (!card || this.revisions(id).some((r) => r.meta.reply !== undefined) || this.status(id) !== "resolved") return false;
    const last = this.latestVerdict(card);
    return last?.response === "alternative" || last?.response === "correction";
  }

  /**
   * The agent's one reply to an answer that went against its pick (D89, D104): the card's next revision, the same
   * as the last but for the fact or check in `reply`. It reopens the card for the reviewer.
   */
  replyToCard(id: string, reply: string, opts: { agent: string }): Card {
    this.requireInit();
    const latest = this.card(id);
    if (!latest) throw new Error(`no card ${id}`);
    if (this.revisions(id).some((r) => r.meta.reply !== undefined)) throw new Error(`${id} has had its reply: an agent replies once to a card (D89)`);
    if (!this.canReply(id)) {
      throw new Error(`${id} is ${this.status(id)}; only a card answered against your pick (the alternative, or the reviewer's own answer) takes a reply`);
    }
    const text = reply.trim();
    if (!text) throw new ValidationError("the reply is empty: give the fact or the check, in a line");
    const { type: _t, id: _i, revision: _r, source_agent: _a, source_branch: _b, created: _c, ...draft } = latest.meta;
    return this.writeRevision(id, latest.meta.revision + 1, { ...draft, reply: text }, latest.body, opts.agent);
  }

  /** The cards that draft a rule from decision `id` (D110), whatever became of them, short of being withdrawn. */
  private ruleDrafts(id: string): Card[] {
    return this.cards().filter((c) => c.meta.rule !== undefined && c.meta.depends_on.includes(id) && this.status(c.meta.id) !== "withdrawn");
  }

  /**
   * Whether the reviewer asked for a rule from this decision (D16's toggle) and none has been drafted yet: the
   * latest verdict on its latest revision carries `make_rule` (D109).
   */
  ruleAsked(id: string): boolean {
    const card = this.card(id);
    if (!card || !this.latestVerdict(card)?.make_rule) return false;
    return this.ruleDrafts(id).length === 0;
  }

  /**
   * Draft the rule the reviewer asked for (D109, D110): a card built from the decision, which asks them to make
   * `rule` a rule covering `covers`. Accepting it saves the rule. It builds on the decision, in the same topic and
   * deck, so it isn't a duplicate of it.
   */
  draftRule(id: string, rule: string, covers: string[], opts: { agent: string }): Card {
    this.requireInit();
    const from = this.card(id);
    if (!from) throw new Error(`no card ${id}`);
    if (this.ruleDrafts(id).length) throw new Error(`a rule from ${id} is already drafted: it's one card per decision`);
    if (!this.latestVerdict(from)?.make_rule) throw new Error(`the reviewer didn't ask for a rule from ${id}: only an answer marked "make this a rule" takes one (D109)`);
    const text = rule.trim();
    if (!text) throw new ValidationError("the rule is empty: give it in a line");
    const bad = covers.filter((p) => !FACT_PATTERN.test(p));
    if (bad.length) throw new ValidationError(`not a gate pattern: ${bad.join(", ")}; patterns look like dep:pytest-* or schema:migrations/*`);
    const lets = covers.length ? `the gate lets through, without a card, commits whose only decisions it covers (${covers.join(", ")})` : "it shows beside every card on this topic";
    const prep = this.prepare({
      title: `A rule from “${from.meta.title}”`,
      question: `Make this a rule: “${text}”?`,
      doing: `drafting the rule you asked for on “${from.meta.title}”`,
      topic: from.meta.topic,
      deck: from.meta.deck,
      touches: [],
      reverse: "moderate",
      proposal: "Make it a rule",
      proposal_then: `it's saved, and ${lets}`,
      alternative: "Keep it to this decision",
      alternative_then: "no rule is saved; the next decision like this one comes to you as a card",
      crux: "Should every decision like this one go the same way from now on?",
      crux_proposal: "If so",
      crux_alternative: "If it depends",
      depends_on: [id],
    });
    const newCard = newId("B", (candidate) => existsSync(join(this.live, "cards", candidate)));
    return this.writeRevision(newCard, 1, { ...prep.draft, rule: text, rule_covers: covers }, "", opts.agent);
  }

  /**
   * Save the rule a draft asked for, once the reviewer accepts it, or answers with their own wording (D110). Rules
   * are immutable, so it's saved once per decision.
   */
  private saveRule(card: Card, v: Verdict): void {
    if (card.meta.rule === undefined || (v.response !== "accept" && v.response !== "correction")) return;
    const from = card.meta.depends_on[0];
    if (from && this.rules().some((r) => r.meta.from_card === from)) return;
    const ruleId = newId("R", (candidate) => existsSync(join(this.live, "rules", `${candidate}.md`)));
    const meta = parse(
      RuleMeta,
      { type: "rule", id: ruleId, topic: this.canonicalTopic(card.meta.topic), covers: card.meta.rule_covers, ...(from ? { from_card: from } : {}), accepted_by: v.reviewer, created: v.at },
      "the rule",
    );
    const rel = join("rules", `${ruleId}.md`);
    this.writeOnce(join(this.live, rel), renderDoc(meta, `${v.response === "correction" ? v.choice : card.meta.rule}\n`));
    this.toRecord(rel);
  }

  private writeRevision(id: string, revision: number, draft: CardDraft & { reply?: string; rule?: string; rule_covers?: string[] }, body: string, agent: string): Card {
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
      .flatMap((f) => this.read(join(this.live, "attachments", f), (t) => parse(Attachment, JSON.parse(t), f)) ?? []);
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
      .flatMap((f) => this.read(join(this.live, "cards", id, f), (t) => parse(Fallback, JSON.parse(t), f)) ?? []);
  }

  // ---------------------------------------------------------------- ledger and rules

  /** Record that a commit builds on a card (D15). Written by the post-commit hook. */
  writeLedger(id: string, entry: { commit: string; branch?: string }, body: string): string {
    this.requireInit();
    if (!this.card(id)) throw new Error(`no card ${id}`);
    const meta = parse(
      LedgerMeta,
      { type: "ledger", card: id, branch: entry.branch ?? this.repo.branch, commit: entry.commit, at: now() },
      "the ledger entry",
    );
    this.writeOnce(join(this.live, "ledger", `${id}-${randomSuffix()}.md`), renderDoc(meta, body));
    return id;
  }

  ledger(id: string): { meta: LedgerMeta; body: string }[] {
    return this.list("ledger")
      .filter((f) => f.startsWith(`${id}-`))
      .flatMap((f) => this.read(join(this.live, "ledger", f), (text) => {
        const { meta, body } = parseDoc(text);
        return { meta: parse(LedgerMeta, meta, `ledger/${f}`), body };
      }) ?? [])
      .sort((a, b) => a.meta.at.localeCompare(b.meta.at));
  }

  rules(): { meta: RuleMeta; body: string }[] {
    return this.list("rules")
      .filter((f) => f.endsWith(".md"))
      .flatMap((f) => this.read(join(this.live, "rules", f), (text) => {
        const { meta, body } = parseDoc(text);
        return { meta: parse(RuleMeta, meta, `rules/${f}`), body };
      }) ?? []);
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
    return this.read(path, (text) => {
      const { meta, body } = parseDoc(text);
      return { meta: parse(DeckMeta, meta, `decks/${id}.md`), body };
    });
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
      try {
        this.createDeck(
          { id, title: `Decisions on ${this.repo.branch}` },
          `Decisions filed while working on the branch \`${this.repo.branch}\`.\n`,
        );
      } catch (e) {
        // Another agent on this branch created it at the same moment: the exclusive create lost the race,
        // and the deck it wanted exists. Found by the server's concurrency test.
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
    return id;
  }

  // ---------------------------------------------------------------- verdicts

  verdicts(id: string): Verdict[] {
    return this.list("verdicts")
      .filter((f) => verdictFileCard(f) === id)
      .flatMap((f) => this.read(join(this.live, "verdicts", f), (t) => parse(Verdict, JSON.parse(t), f)) ?? [])
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
    const name = `${v.at.replace(/[-:]/g, "")}-${v.card}-r${v.revision}-${randomSuffix()}.json`;
    this.writeOnce(join(this.live, "verdicts", name), `${JSON.stringify(v, null, 2)}\n`);
    this.saveRule(card, v);
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
      if (seen.has(other.meta.id)) continue;
      const supersedes = other.meta.supersedes === id;
      // A resolved conflict card supersedes the decisions it names that it didn't choose (D35).
      const lostConflict = other.meta.conflict_of?.includes(id) ?? false;
      if (!supersedes && !lostConflict) continue;
      if (this.status(other.meta.id, seen) !== "resolved") continue;
      if (supersedes) return "superseded";
      if (normalise(this.decision(other.meta.id) ?? "") !== normalise(this.answer(card) ?? "")) {
        return "superseded";
      }
    }
    // Choosing the alternative returns the cards built on the proposal (D80).
    if (this.parentReturns(card).length) return "returned";
    const last = this.latestVerdict(card);
    if (!last) return "open";
    switch (last.response) {
      case "accept":
      case "alternative":
      case "correction":
        return "resolved";
      case "reject":
      case "question":
      case "need_context":
      case "see_it_run":
        return "returned";
      case "not_my_area":
        return "rerouted";
      case "defer":
        return "deferred";
    }
  }

  /** The latest verdict on a card's latest revision. */
  private latestVerdict(card: Card): Verdict | undefined {
    return this.verdicts(card.meta.id)
      .filter((v) => v.revision === card.meta.revision)
      .at(-1);
  }

  /**
   * The cards `card` builds on whose latest verdict chose something other than their proposal (D80), after
   * this card's latest revision and its own latest verdict. A verdict given after the parent's, or a revision
   * filed after it, means the agent or the reviewer has already taken the new answer into account.
   */
  private parentReturns(card: Card): Brief[] {
    const own = this.latestVerdict(card)?.at ?? "";
    const since = own > card.meta.created ? own : card.meta.created;
    const out: Brief[] = [];
    for (const parentId of card.meta.depends_on) {
      const parent = this.card(parentId);
      const pv = parent && this.latestVerdict(parent);
      if (!parent || !pv || (pv.response !== "alternative" && pv.response !== "correction") || pv.at < since) continue;
      out.push({ kind: "parent-decided-otherwise", card: card.meta.id, parent: parentId, parentTitle: parent.meta.title, assumed: parent.meta.proposal, decided: pv.choice!, at: pv.at });
    }
    return out;
  }

  /**
   * The answer on `card` changed after an earlier verdict resolved it (D81). A reply (D104) is the same question
   * asked again, so the answer it replied to counts as earlier.
   */
  private answerChange(card: Card): Brief | undefined {
    const asked = (r: number) => r === card.meta.revision || (card.meta.reply !== undefined && r === card.meta.revision - 1);
    const vs = this.verdicts(card.meta.id).filter((v) => asked(v.revision));
    const last = vs.at(-1);
    const answerOf = (v: Verdict) => (v.response === "accept" ? card.meta.proposal : v.response === "alternative" || v.response === "correction" ? v.choice : undefined);
    const earlier = vs.slice(0, -1).reverse().find((v) => answerOf(v) !== undefined);
    if (!last || !earlier) return undefined;
    const was = answerOf(earlier)!, now = answerOf(last);
    if (now !== undefined && normalise(now) === normalise(was)) return undefined;
    const commits = this.ledger(card.meta.id)
      .filter((e) => e.meta.at < last.at)
      .map((e) => ({ ...(e.meta.commit ? { commit: e.meta.commit } : {}), branch: e.meta.branch }));
    return { kind: "answer-changed", card: card.meta.id, was, now, response: last.response, commits, at: last.at };
  }

  /** What an agent should be told about a card now, beyond its verdict (D80, D81). */
  briefs(id: string): Brief[] {
    const card = this.card(id);
    if (!card) throw new Error(`no card ${id}`);
    const change = this.answerChange(card);
    return [...this.parentReturns(card), ...(change ? [change] : [])];
  }

  /** What was decided, for a resolved card. */
  decision(id: string): string | undefined {
    const card = this.card(id);
    if (!card || this.status(id) !== "resolved") return undefined;
    return this.answer(card);
  }

  /** What the latest verdict on the latest revision chose, without checking supersession (so `status` can use it). */
  private answer(card: Card): string | undefined {
    const last = this.latestVerdict(card);
    if (!last) return undefined;
    if (last.response === "accept") return card.meta.proposal;
    if (last.response === "alternative" || last.response === "correction") return last.choice;
    return undefined;
  }

  // ---------------------------------------------------------------- topics

  aliases(): TopicAlias[] {
    return this.list("topics")
      .filter((f) => f.startsWith("alias-"))
      .flatMap((f) => this.read(join(this.live, "topics", f), (t) => parse(TopicAlias, JSON.parse(t), f)) ?? []);
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
  inbox(opts: { advance: boolean }): InboxItem[] {
    this.requireInit();
    const cursorPath = join(this.live, "cursors", `${slug(this.repo.branch)}.json`);
    const since: string = existsSync(cursorPath) ? JSON.parse(readFileSync(cursorPath, "utf8")).at : "";
    const items: InboxItem[] = [];
    for (const c of this.branchCards()) {
      const change = this.answerChange(c);
      for (const v of this.verdicts(c.meta.id)) {
        if (v.at > since) items.push({ card: c.meta.id, verdict: v, ...(change && change.at === v.at ? { brief: change } : {}) });
      }
      // A dependent returned by its parent's verdict (D80): the verdict is the parent's.
      for (const b of this.parentReturns(c)) {
        const pv = b.kind === "parent-decided-otherwise" ? this.verdicts(b.parent).find((v) => v.at === b.at) : undefined;
        if (pv && b.at > since) items.push({ card: c.meta.id, verdict: pv, brief: b });
      }
    }
    items.sort((a, b) => a.verdict.at.localeCompare(b.verdict.at));
    if (opts.advance && items.length > 0) {
      mkdirSync(dirname(cursorPath), { recursive: true });
      writeFileSync(cursorPath, `${JSON.stringify({ at: items.at(-1)!.verdict.at })}\n`);
    }
    return items;
  }

  // ---------------------------------------------------------------- waiting (D90)

  /**
   * Mark an agent as waiting on a card (D90). `baesian wait` refreshes the marker every `WAITING_BEAT_MS`, and stops
   * it when the wait ends. A wait that runs in short slices (D101) picks up its own fresh marker again, so `since`
   * is when it first started waiting. An agent killed mid-wait leaves its marker behind, to go stale.
   */
  startWaiting(id: string, agent: string, at: string = now()): { since: string; refresh(at?: string): void; stop(): void } {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new Error(`no card ${id}`);
    const atMs = Date.parse(at);
    const mine = this.list("waiting")
      .filter((f) => f.startsWith(`${id}-`) && f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [{ f, w: parse(Waiting, JSON.parse(readFileSync(join(this.live, "waiting", f), "utf8")), f) }];
        } catch {
          return [];
        }
      })
      .find(({ w }) => w.agent === agent && w.revision === card.meta.revision && atMs - Date.parse(w.at) <= WAITING_STALE_MS);
    const path = join(this.live, "waiting", mine ? mine.f : `${id}-${randomSuffix()}.json`);
    const since = mine ? mine.w.since : at;
    mkdirSync(dirname(path), { recursive: true });
    const write = (beat: string) => {
      const w = parse(Waiting, { type: "waiting", card: id, revision: card.meta.revision, agent, since, at: beat }, "the waiting marker");
      const tmp = `${path}.${randomSuffix()}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(w)}\n`);
      renameSync(tmp, path);
    };
    write(at);
    return { since, refresh: (beat = now()) => write(beat), stop: () => rmSync(path, { force: true }) };
  }

  /** The agents waiting on a card, and whether each has gone quiet: stopped waiting without returning (D90). */
  waitingOn(id: string, nowMs: number = Date.now()): { marker: Waiting; stale: boolean }[] {
    return this.list("waiting")
      .filter((f) => f.startsWith(`${id}-`) && f.endsWith(".json"))
      .flatMap((f) => this.read(join(this.live, "waiting", f), (t) => parse(Waiting, JSON.parse(t), f)) ?? [])
      .map((marker) => ({ marker, stale: nowMs - Date.parse(marker.at) > WAITING_STALE_MS }));
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
        const mine = (name: string) => (kind === "verdicts" ? verdictFileCard(name) === id : name.startsWith(`${id}-`));
        for (const f of this.list(kind).filter(mine)) {
          const rel = join(kind, f);
          if (this.toRecord(rel)) added.push(rel);
        }
      }
    }
    return added;
  }
}
