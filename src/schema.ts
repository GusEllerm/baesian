import { z } from "zod";
import { CARD_ID, RULE_ID } from "./ids.js";

// The file formats. docs/vault/Design/File Formats.md describes them for people; this module is the
// definition. Every type is flat (no nested objects) so the Markdown ones read well in Obsidian.

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

/** Frontmatter of one card revision: `cards/<id>/r<revision>.md`. */
export const CardMeta = z.strictObject({
  type: z.literal("card"),
  id: CardId,
  revision: z.number().int().min(1),
  title: z.string().min(1),
  proposal: z.string().min(1),
  alternatives: z.array(z.string().min(1)).default([]),
  topic: Topic.optional(),
  deck: DeckId,
  level: Level,
  touches: z.array(Fact).default([]),
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

/** The body section every card must have (D12). */
export const STRONGEST_ALTERNATIVE = "Strongest alternative";

export const Response = z.enum([
  "accept", // resolves
  "alternative", // resolves with one of the card's alternatives
  "correction", // resolves with the reviewer's own answer
  "reject", // returns: the agent re-proposes or withdraws
  "question", // returns: "have you considered X?"
  "need_context", // returns: re-file with what was missing
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
    make_rule: z.boolean().optional(),
    reviewer: z.string().min(1),
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
