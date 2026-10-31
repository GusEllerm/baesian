import { z } from "zod";

// The file formats. docs/vault/Design/File Formats.md describes them for people; this module is the
// definition. Every type is flat (no nested objects) so the Markdown ones read well in Obsidian.

/** Crockford base32, lowercase, with no i, l, o or u (D51). Here rather than in ids.ts, so the schema imports nothing from Node. */
const SUFFIX = "[0-9a-hjkmnp-tv-z]";
export const CARD_ID = new RegExp(`^B-${SUFFIX}{5}$`);
export const RULE_ID = new RegExp(`^R-${SUFFIX}{5}$`);

export const CardId = z.string().regex(CARD_ID, "a card ID looks like B-7f3kq");
export const RuleId = z.string().regex(RULE_ID, "a rule ID looks like R-7f3kq");
export const Timestamp = z.iso.datetime();

/** `storage/run-metadata`: lowercase segments joined by slashes (D38). */
export const Topic = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/, "a topic looks like storage/run-metadata");

/** A deck ID is a slug: `storage-layer`, or `branch-feat-run-store` for a branch's default deck. */
export const DeckId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a deck ID is a lowercase slug");

/** provisional: proceed on the proposal; blocking: wait while the reviewer is there; hard: never proceed (D42). */
export const Level = z.enum(["provisional", "blocking", "hard"]);
export type Level = z.infer<typeof Level>;

/** The D11 impact checklist, as facts the agent states. */
export const Fact = z.enum([
  "schema", // changes a schema or on-disk data format
  "public-api", // changes a public API, URL scheme or module boundary
  "dependency", // adds a runtime dependency
  "user-facing", // is user-facing
  "publishes", // publishes something outside the project
  "security", // touches security or privacy
  "money", // spends money
  "data-loss", // deletes or overwrites stored data
  "infra", // changes CI, infrastructure or deployment (D53)
]);
export type Fact = z.infer<typeof Fact>;

/** Facts that make a card hard unless the agent says otherwise (D42). */
export const HARD_BY_DEFAULT: ReadonlySet<Fact> = new Set(["publishes", "security", "money", "data-loss"]);

export const CaughtAt = z.enum(["filing", "merge", "late"]);

/** Which of a card's two options something refers to. */
export const OptionKind = z.enum(["proposal", "alternative"]);
export type OptionKind = z.infer<typeof OptionKind>;

/** How costly a decision is to undo (D95). It decides the card's stakes line and feeds rarity. */
export const Reverse = z.enum(["cheap", "moderate", "one-way"]);

/** A decision or a rule, for the decisions an option would replace or break. */
export const DecisionRef = z.union([CardId, RuleId]);

const Text = z.string().min(1);

/** Frontmatter of one card revision: `cards/<id>/r<revision>.md`. */
export const CardMeta = z.strictObject({
  type: z.literal("card"),
  id: CardId,
  revision: z.number().int().min(1),
  /** A neutral short name, not a question: "Where the access token lives". */
  title: Text,
  /** The decision, as a neutral question. */
  question: Text,
  /** What the agent was doing when the decision came up, in its own voice (D73). */
  doing: Text,
  topic: Topic,
  deck: DeckId,
  level: Level,
  touches: z.array(Fact).default([]),
  reverse: Reverse,
  // The two options (D93): the agent's pick and the strongest alternative, each with what it would do.
  proposal: Text,
  proposal_then: Text,
  alternative: Text,
  alternative_then: Text,
  /** Other options the agent considered, by name. Not shown on the card. */
  also_considered: z.array(Text).default([]),
  // The crux (D74): the one question the choice turns on, and the answer that leads to each option.
  crux: Text,
  crux_proposal: Text,
  crux_alternative: Text,
  /** The crux is about what the reviewer values, not a fact. */
  crux_preference: z.boolean().optional(),
  crux_fact: Text.optional(),
  // The agent's case (D77): the rationale is optional; "wrong if" and its check are required when a facet asks.
  rationale: Text.optional(),
  wrong_if: Text.optional(),
  check: Text.optional(),
  // The trial facets (D75).
  premise: Text.optional(),
  premise_option: OptionKind.optional(),
  premise_check: Text.optional(),
  acted: Text.optional(),
  acted_option: OptionKind.optional(),
  serves: Text.optional(),
  /** Rules the card bears on (D79). */
  rules: z.array(RuleId).default([]),
  /** The decisions or rules each option would replace or break, as the agent declares them. */
  proposal_breaks: z.array(DecisionRef).default([]),
  alternative_breaks: z.array(DecisionRef).default([]),
  modules_touched: z.number().int().min(0).optional(),
  depends_on: z.array(CardId).default([]),
  supersedes: CardId.optional(),
  conflict_of: z.array(CardId).optional(),
  caught_at: CaughtAt.optional(),
  confidence: z.number().min(0).max(1).optional(),
  domain: z.array(z.string().min(1)).default([]),
  evidence: z.array(z.string().min(1)).default([]),
  source_agent: z.string().min(1),
  source_branch: z.string().min(1),
  source_worktree: z.string().min(1),
  created: Timestamp,
});
export type CardMeta = z.infer<typeof CardMeta>;

/** What an agent writes: a card without the fields Baesian fills in. */
export const CardDraft = CardMeta.omit({
  type: true,
  id: true,
  revision: true,
  source_agent: true,
  source_branch: true,
  source_worktree: true,
  created: true,
}).extend({
  type: z.literal("card").optional(),
  deck: DeckId.optional(),
  level: Level.optional(),
});
export type CardDraft = z.infer<typeof CardDraft>;

/** Why a well-formed draft still can't be filed (D74, D77): the rules that span fields. */
export function filingProblems(d: CardDraft): string[] {
  const out: string[] = [];
  if (same(d.proposal, d.alternative)) out.push("the proposal and the alternative are the same option: a card needs two real options");
  if (same(d.crux_proposal, d.crux_alternative)) {
    out.push("crux_proposal and crux_alternative give the same answer, so the crux doesn't decide between the options (D74)");
  }
  const asks = [
    ...(d.reverse === "one-way" ? ["it's one-way"] : []),
    ...(d.touches.includes("security") ? ["it touches security"] : []),
    ...(d.premise ? ["it rests on an unchecked premise"] : []),
  ];
  if (asks.length && !(d.wrong_if && d.check)) {
    out.push(`wrong_if and check are required because ${asks.join(" and ")} (D77): say what would show the pick is wrong, and where to look`);
  }
  const partial = (name: string, fields: (string | undefined)[]) => {
    const set = fields.filter((f) => f !== undefined).length;
    if (set > 0 && set < fields.length) out.push(`the ${name} facet needs all of its fields (D75)`);
  };
  partial("premise (premise, premise_option, premise_check)", [d.premise, d.premise_option, d.premise_check]);
  partial("acted (acted, acted_option)", [d.acted, d.acted_option]);
  return out;
}

/** Advice on a draft that files anyway: no length limit has been measured yet, so long fields only warn. */
export function filingWarnings(d: CardDraft): string[] {
  const long: [string, string | undefined, number][] = [
    ["title", d.title, 60], ["proposal", d.proposal, 60], ["alternative", d.alternative, 60],
    ["question", d.question, 160], ["crux", d.crux, 160], ["doing", d.doing, 160],
    ["proposal_then", d.proposal_then, 240], ["alternative_then", d.alternative_then, 240],
  ];
  return long
    .filter(([, v, max]) => v !== undefined && v.length > max)
    .map(([name, v, max]) => `${name} is ${v!.length} characters; the card reads best under ${max}`);
}

const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();

export const Response = z.enum([
  "accept", // resolves
  "alternative", // resolves with one of the card's alternatives
  "correction", // resolves with the reviewer's own answer
  "reject", // returns: the agent re-proposes or withdraws
  "question", // returns: "have you considered X?"
  "need_context", // returns: re-file with what was missing
  "see_it_run", // returns: come back with a demo, a screenshot or a running preview (D85)
  "not_my_area", // reroutes
  "defer", // deferred, with a reason (D31)
]);
export type Response = z.infer<typeof Response>;

/** A verdict on one card revision: `verdicts/<id>-r<revision>-<suffix>.json`. Only the client writes these (D32). */
export const Verdict = z
  .strictObject({
    type: z.literal("verdict"),
    card: CardId,
    revision: z.number().int().min(1),
    response: Response,
    choice: z.string().min(1).optional(),
    comment: z.string().min(1).optional(),
    /** The option chosen before the agent's pick was shown (D86, D88). */
    first_choice: OptionKind.optional(),
    make_rule: z.boolean().optional(),
    reviewer: z.string().min(1),
    /** Which client wrote the verdict (D62). */
    client: z.string().min(1),
    at: Timestamp,
  })
  .superRefine((v, ctx) => {
    if ((v.response === "alternative" || v.response === "correction") && !v.choice) {
      ctx.addIssue({ code: "custom", path: ["choice"], message: `a ${v.response} verdict needs a choice` });
    }
    if ((v.response === "question" || v.response === "defer") && !v.comment) {
      ctx.addIssue({ code: "custom", path: ["comment"], message: `a ${v.response} verdict needs a comment` });
    }
  });
export type Verdict = z.infer<typeof Verdict>;

/** The agent withdrawing its own card: `cards/<id>/withdrawn.json`. */
export const Withdrawal = z.strictObject({
  type: z.literal("withdrawal"),
  card: CardId,
  reason: z.string().min(1),
  by: z.string().min(1),
  at: Timestamp,
});
export type Withdrawal = z.infer<typeof Withdrawal>;

/** Frontmatter of a ledger entry: `ledger/<id>-<suffix>.md`. The body names symbols in backticks (D15). */
export const LedgerMeta = z.strictObject({
  type: z.literal("ledger"),
  card: CardId,
  branch: z.string().min(1),
  commit: z.string().optional(),
  at: Timestamp,
});
export type LedgerMeta = z.infer<typeof LedgerMeta>;

/** Frontmatter of a deck: `decks/<id>.md`. The body is the briefing. Membership is computed from cards. */
export const DeckMeta = z.strictObject({
  type: z.literal("deck"),
  id: DeckId,
  title: z.string().min(1),
  branch: z.string().optional(),
  from: z.string().optional(),
  context_notes: z.array(z.string()).default([]),
  created: Timestamp,
});
export type DeckMeta = z.infer<typeof DeckMeta>;

/** Frontmatter of a rule: `rules/<id>.md`. The body is the rule. */
export const RuleMeta = z.strictObject({
  type: z.literal("rule"),
  id: RuleId,
  topic: Topic.optional(),
  /** Gate fact IDs this rule answers, as globs (`dep:pytest-*`): the gate acks them automatically (D24). */
  covers: z.array(z.string().min(1)).default([]),
  from_card: CardId.optional(),
  accepted_by: z.string().min(1),
  created: Timestamp,
});
export type RuleMeta = z.infer<typeof RuleMeta>;

/** A topic-key merge made in the client: `topics/alias-<suffix>.json` (D44). */
export const TopicAlias = z.strictObject({
  type: z.literal("topic-alias"),
  from: Topic,
  to: Topic,
  by: z.string().min(1),
  at: Timestamp,
});
export type TopicAlias = z.infer<typeof TopicAlias>;

/** An agent waiting on an existing card instead of filing a duplicate (D36): `attachments/<id>-<suffix>.json`. */
export const Attachment = z.strictObject({
  type: z.literal("attachment"),
  card: CardId,
  agent: z.string().min(1),
  branch: z.string().min(1),
  worktree: z.string().min(1),
  at: Timestamp,
});
export type Attachment = z.infer<typeof Attachment>;

/** A blocking card the agent proceeded on without a verdict (D46): `cards/<id>/fallback-<suffix>.json`. */
export const Fallback = z.strictObject({
  type: z.literal("fallback"),
  card: CardId,
  revision: z.number().int().min(1),
  reason: z.enum(["timeout", "away"]),
  agent: z.string().min(1),
  at: Timestamp,
});
export type Fallback = z.infer<typeof Fallback>;

/** The client's heartbeat, `presence.json` in the live layer (D41). Mutable; never in the record. */
export const Presence = z.strictObject({
  type: z.literal("presence"),
  client: z.string().min(1),
  at: Timestamp,
});
export type Presence = z.infer<typeof Presence>;

/**
 * An agent waiting on a card, `waiting/<id>-<suffix>.json` in the live layer (D90). Mutable: `baesian wait`
 * rewrites it while it waits and removes it when it returns. Once it's stale, the agent stopped waiting.
 */
export const Waiting = z.strictObject({
  type: z.literal("waiting"),
  card: CardId,
  revision: z.number().int().min(1),
  agent: z.string().min(1),
  since: Timestamp,
  at: Timestamp,
});
export type Waiting = z.infer<typeof Waiting>;

/**
 * The running server, `server.json` in the live layer (D97). Mutable and readable only by the user; written
 * when `baesian serve` starts and removed when it stops. The token is new each time.
 */
export const ServerInfo = z.strictObject({
  type: z.literal("server"),
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  token: z.string().min(32),
  started: Timestamp,
});
export type ServerInfo = z.infer<typeof ServerInfo>;

/**
 * The port the last server listened on, `port.json` in the live layer (D103). It outlives the server, so the next
 * one starts on the same address when it can, and the browser keeps what it stores for that address: the client's
 * own data, and permission to notify. Not a secret: the token is still new each time (D97).
 */
export const LastPort = z.strictObject({
  type: z.literal("port"),
  port: z.number().int().min(1).max(65535),
});
export type LastPort = z.infer<typeof LastPort>;

/** `.baesian/config.json`: committed, shared by everyone working on the repo. */
export const Config = z.strictObject({
  vault: z.string().optional(),
  /** Globs for the schema detector; replace the defaults (D25). */
  gate_schema: z.array(z.string().min(1)).optional(),
  /** Globs for the CI, infra and deploy detector; replace the defaults. */
  gate_infra: z.array(z.string().min(1)).optional(),
  /** Paths the gate never looks at, added to the defaults. */
  gate_ignore: z.array(z.string().min(1)).optional(),
  /**
   * The project's public modules, as globs. The `api:` detector is off until this is set (D59), and
   * needs livedocs on PATH (`livedocs signatures`, D56).
   */
  gate_api: z.array(z.string().min(1)).optional(),
});
export type Config = z.infer<typeof Config>;

/**
 * `~/.config/baesian/config.json`: personal, never committed. Notification settings live here, not in
 * the repo: a committed `notify` command would run on every clone, and push tokens would leak.
 */
export const UserConfig = z.strictObject({
  /** A shell command run when a blocking or hard card is filed; it receives the card as JSON on stdin (D40). */
  notify: z.string().optional(),
  /** OS notifications for blocking and hard cards. Default true. */
  os_notify: z.boolean().optional(),
});
export type UserConfig = z.infer<typeof UserConfig>;

/** Format a Zod error for a person reading a terminal. */
export function describeError(error: z.ZodError): string {
  return z.prettifyError(error);
}
