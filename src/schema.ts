import { z } from "zod";
import { cite } from "./cite.js";
import { ALL_ROWS, POSITIONS, ROWS, ROW_FLOOR, rank } from "./routing.js";

// The file formats. docs/vault/Design/File Formats.md describes them for people; this module is the
// definition. Every type is flat (no nested objects) so the Markdown ones read well in Obsidian.

// ---------------------------------------------------------------- format numbers (D156, D157)

/** A file's fields as read, before its schema checks them. */
type Fields = Record<string, unknown>;

/** Takes a file's fields from one format of its kind to the next, in memory. */
type Upgrade = (fields: Fields) => Fields;

interface FileKind {
  /** What a message calls it. */
  name: string;
  /** `upgrades[n - 1]` takes format n to n + 1: the newest format is one more than their number. */
  upgrades: readonly Upgrade[];
  /** What a file written before v1, with no `format`, needs in order to read as format 1, if anything. */
  beforeV1?: Upgrade;
}

/**
 * Every kind of file Baesian writes, or reads from a person, and the upgrades from each older format (D156). Each kind is
 * numbered on its own: a card format 2 leaves verdicts at 1. A file is upgraded in memory as it's read, and never
 * rewritten: files are written once (D34), and CI checks each commit against its own record (`checkCommit()`), so an old
 * commit's files must stay readable as they are. Writers write only the newest format.
 *
 * A file with no `format` was written before v1, and reads as format 1. That changes nothing, except that the inbox
 * cursor gains the `type` it lacked. A format 2 adds one function to its kind's `upgrades`, and its schema changes to match.
 */
export const FILE_KINDS = {
  card: { name: "card", upgrades: [] },
  "card-draft": { name: "card draft", upgrades: [] },
  verdict: { name: "verdict", upgrades: [] },
  withdrawal: { name: "withdrawal", upgrades: [] },
  fallback: { name: "fallback", upgrades: [] },
  ledger: { name: "ledger entry", upgrades: [] },
  deck: { name: "deck", upgrades: [] },
  rule: { name: "rule", upgrades: [] },
  "rule-retirement": { name: "rule retirement", upgrades: [] },
  "topic-alias": { name: "topic alias", upgrades: [] },
  attachment: { name: "attachment", upgrades: [] },
  // D181: a branch merged into another, as the CLI found it.
  merge: { name: "merge", upgrades: [] },
  // B-jr8mk: the repo's default branch, as the CLI read it, which it sends the relay for the website.
  "default-branch": { name: "default branch", upgrades: [] },
  cursor: { name: "inbox cursor", upgrades: [], beforeV1: (f) => ({ type: "cursor", ...f }) },
  presence: { name: "presence", upgrades: [] },
  waiting: { name: "waiting marker", upgrades: [] },
  server: { name: "server file", upgrades: [] },
  port: { name: "port file", upgrades: [] },
  config: { name: "config", upgrades: [] },
  "user-config": { name: "personal config", upgrades: [] },
  "decision-note": { name: "decision note", upgrades: [] },
  "rule-note": { name: "rule note", upgrades: [] },
  preferences: { name: "preference file", upgrades: [] },
  gate: { name: "gate record", upgrades: [] },
  // M9a, the hosted service's proof (P16 section 7). The relay writes these, never the CLI on its own.
  /** A `.sig` beside a signed file: OpenSSH's own format (D160), with no `format` field; its number is SSHSIG's version. */
  signature: { name: "signature", upgrades: [] },
  "passkey-proof": { name: "passkey proof", upgrades: [] },
  "service-key": { name: "service key", upgrades: [] },
  "service-key-revocation": { name: "service key revocation", upgrades: [] },
  "passkey-key": { name: "passkey key", upgrades: [] },
  /** The repo's project, a line of CI's pin beside the keys (B-mar8x); never a file in `trust/`. */
  project: { name: "pinned project", upgrades: [] },
  // M9d, the CLI's side of the hosted service (P16 section 8): what it keeps of the relay, and the machine's grant.
  relay: { name: "relay state", upgrades: [] },
  grant: { name: "machine grant", upgrades: [] },
  // B-4rwyz, personal mode: what a clone that commits nothing held when it was linked, in the record's place.
  "before-linking": { name: "before-linking snapshot", upgrades: [] },
} as const satisfies Record<string, FileKind>;
export type FileKindName = keyof typeof FILE_KINDS;

/** The newest format of a kind of file, which is the one Baesian writes (D156). */
export function newestFormat(kind: FileKindName): number {
  return FILE_KINDS[kind].upgrades.length + 1;
}

/** A schema's `format`: only the newest, since a file is upgraded before its schema reads it. */
const formatOf = (kind: FileKindName) => z.literal(newestFormat(kind));

/**
 * A file in a newer format than this Baesian reads (D157). It's refused as a bad file is: thrown, or, in a view that
 * reports problems (the server's), reported and skipped.
 */
export class NewerFormat extends Error {
  constructor(
    readonly file: string,
    readonly kind: FileKindName,
    readonly format: number,
  ) {
    super(`${file} has ${FILE_KINDS[kind].name} format ${format}; this Baesian reads up to ${newestFormat(kind)}: upgrade Baesian`);
  }
}

/**
 * A file's fields in the newest format of its kind, for its schema to check (D156): a file with no `format` reads as
 * format 1, and an older one is upgraded, in memory. A newer one throws `NewerFormat` (D157), naming `file`. A `format`
 * that isn't a whole number from 1 is left for the schema to reject.
 */
export function upgradeFile(kind: FileKindName, fields: unknown, file: string): unknown {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return fields;
  const k: FileKind = FILE_KINDS[kind];
  let f = fields as Fields;
  if (f.format === undefined) f = { ...(k.beforeV1 ? k.beforeV1(f) : f), format: 1 };
  const from = f.format;
  if (typeof from !== "number" || !Number.isInteger(from) || from < 1) return f;
  const newest = newestFormat(kind);
  if (from > newest) throw new NewerFormat(file, kind, from);
  for (let n = from; n < newest; n++) f = { ...k.upgrades[n - 1]!(f), format: n + 1 };
  return f;
}

// ---------------------------------------------------------------- the formats

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
  "security", // touches security
  "privacy", // touches personal data or privacy (split from security: card B-z3agk)
  "money", // spends money
  "data-loss", // deletes or overwrites stored data
  "infra", // changes CI, infrastructure or deployment (D53)
]);
export type Fact = z.infer<typeof Fact>;

/** Facts that make a card hard unless the agent says otherwise (D42). */
export const HARD_BY_DEFAULT: ReadonlySet<Fact> = new Set(["publishes", "security", "privacy", "money", "data-loss"]);

export const CaughtAt = z.enum(["filing", "merge", "late"]);

/** Which of a card's two options something refers to. */
export const OptionKind = z.enum(["proposal", "alternative"]);
export type OptionKind = z.infer<typeof OptionKind>;

/** How costly a decision is to undo (D95). It decides the card's stakes line and feeds rarity. */
export const Reverse = z.enum(["cheap", "moderate", "one-way"]);

/** A decision or a rule, for the decisions an option would replace or break. */
export const DecisionRef = z.union([CardId, RuleId]);

const Text = z.string().min(1);
/**
 * The stable ID of an account on the hosted service (P16 section 7): Baesian's own, never a Globus identity, which can
 * change (D153). Set by the relay on everything a person writes, beside the handle in `reviewer`, `by` or `accepted_by`.
 */
export const AccountId = z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "an account ID is letters, digits, dots, dashes and underscores");

/**
 * A project's random ID on the hosted service (P16 section 8), in the committed config and, set by the relay, on every
 * file the service signs (B-tf9fc): one key signs every project's files, so a file counts only in its own project.
 */
export const ProjectId = z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "a project ID is letters, digits, dots, dashes and underscores");

/** A SHA-256 digest, in lowercase hex. */
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 digest in lowercase hex");

/** A git commit's full ID, in lowercase hex: SHA-1's 40 digits, or SHA-256's 64. */
export const CommitId = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, "a commit's full ID, in lowercase hex");

/** Bytes as base64url, with no padding, as WebAuthn gives them. */
const Base64Url = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, "base64url, with no padding");

/** A gate fact ID, or a pattern of them, as a rule covers them: `dep:httpx`, `dep:pytest-*`, `schema:migrations/*`. */
export const FACT_PATTERN = /^(dep|schema|infra|api):\S+$/;

/** Frontmatter of one card revision: `cards/<id>/r<revision>.md`. */
export const CardMeta = z.strictObject({
  type: z.literal("card"),
  format: formatOf("card"),
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
  /**
   * The agent's one reply to an answer that went against its pick (D89, D104): a fact the reviewer lacked, or a
   * check that would settle it. The revision is otherwise the one before it. Only `baesian reply` sets it.
   */
  reply: Text.optional(),
  /**
   * A drafted rule (D16, D109, D110): its wording, and the gate facts it covers, as patterns (`dep:pytest-*`). A card
   * that carries one asks you to make it a rule, and accepting it saves `rules/<id>.md`. Only `baesian rule` sets
   * them, on a card it files from the decision you asked a rule of.
   */
  rule: Text.optional(),
  rule_covers: z.array(z.string().regex(FACT_PATTERN, "a gate pattern looks like dep:pytest-* or schema:migrations/*")).default([]),
  /**
   * Why a card that looks like it holds a secret was filed all the same (B-jfkv9). In a hosted repo, where a card goes to
   * the service when it's filed, filing refuses such a card unless the agent gives this; elsewhere it only warns (D136).
   */
  secret_reason: Text.optional(),
  /**
   * A convention card (D161): Baesian found a pattern in your answers, by the same choice on one area's decisions or by
   * a comment in rule words, and asks whether they should become one rule. Only Baesian sets it.
   */
  convention: z.enum(["same-choice", "rule-words"]).optional(),
  /**
   * A slider proposal (B-y6jn6): Baesian proposes moving a row of the repo's preferences one stop, from the record.
   * Accepting it writes a new preference file. Only Baesian sets them, all three together.
   */
  pref_row: z.enum(ROWS).optional(),
  pref_from: z.enum(POSITIONS).optional(),
  pref_to: z.enum(POSITIONS).optional(),
  caught_at: CaughtAt.optional(),
  confidence: z.number().min(0).max(1).optional(),
  domain: z.array(z.string().min(1)).default([]),
  evidence: z.array(z.string().min(1)).default([]),
  source_agent: z.string().min(1),
  source_branch: z.string().min(1),
  created: Timestamp,
});
export type CardMeta = z.infer<typeof CardMeta>;

/**
 * What an agent writes: a card without the fields Baesian fills in. Its optional `format` is the draft's own, never
 * the revision's: Baesian writes every revision in the newest card format.
 */
export const CardDraft = CardMeta.omit({
  type: true,
  format: true,
  id: true,
  revision: true,
  source_agent: true,
  source_branch: true,
  created: true,
  reply: true,
  rule: true,
  rule_covers: true,
  convention: true,
  pref_row: true,
  pref_from: true,
  pref_to: true,
}).extend({
  type: z.literal("card").optional(),
  format: formatOf("card-draft").optional(),
  deck: DeckId.optional(),
  level: Level.optional(),
});
export type CardDraft = z.infer<typeof CardDraft>;

/** Why a well-formed draft still can't be filed (D74, D77): the rules that span fields. */
export function filingProblems(d: CardDraft): string[] {
  const out: string[] = [];
  if (same(d.proposal, d.alternative)) out.push("the proposal and the alternative are the same option: a card needs two real options");
  if (same(d.crux_proposal, d.crux_alternative)) {
    out.push(`crux_proposal and crux_alternative give the same answer, so the crux doesn't decide between the options${cite("D74")}`);
  }
  const asks = [
    ...(d.reverse === "one-way" ? ["it's one-way"] : []),
    ...(d.touches.includes("security") ? ["it touches security"] : []),
    ...(d.touches.includes("privacy") ? ["it touches privacy"] : []),
    ...(d.premise ? ["it rests on an unchecked premise"] : []),
  ];
  if (asks.length && !(d.wrong_if && d.check)) {
    out.push(`wrong_if and check are required because ${asks.join(" and ")}${cite("D77")}: say what would show the pick is wrong, and where to look`);
  }
  const partial = (name: string, fields: (string | undefined)[]) => {
    const set = fields.filter((f) => f !== undefined).length;
    if (set > 0 && set < fields.length) out.push(`the ${name} facet needs all of its fields${cite("D75")}`);
  };
  partial("premise (premise, premise_option, premise_check)", [d.premise, d.premise_option, d.premise_check]);
  partial("acted (acted, acted_option)", [d.acted, d.acted_option]);
  return out;
}

/**
 * Text that looks like a secret (B-vqn69): the record is committed with the code, so a card shouldn't carry one. Each
 * says what it looks like, for the warning, which never quotes the text.
 */
const SECRET_PATTERNS: readonly { looksLike: string; pattern: RegExp }[] = [
  { looksLike: "a private key", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/ },
  { looksLike: "an AWS access key ID", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA|A3T[A-Z0-9])[A-Z0-9]{16}\b/ },
  { looksLike: "a GitHub token", pattern: /\b(?:gh[opsur]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { looksLike: "a Slack token", pattern: /\b(?:xox[abposr]-[A-Za-z0-9-]{10,}|xapp-\d-[A-Za-z0-9-]{10,})/ },
  { looksLike: "a JWT", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { looksLike: "a token in a URL", pattern: /[?&][\w-]*(?:token|key|secret)=[^\s&#"'<>]{16,}/i },
  // `api_key = …`, `"client_secret": "…"`: a long value with letters and digits, so `process.env.API_KEY` and prose don't count.
  {
    looksLike: "a key, token or password",
    pattern: /\b[\w-]*(?:api[_-]?key|access[_-]?key|secret|token|passw(?:or)?d)[\w-]*["']?\s*[:=]\s*["']?(?=[A-Za-z0-9_\-+/=]*[0-9])(?=[A-Za-z0-9_\-+/=]*[A-Za-z])[A-Za-z0-9_\-+/=]{16,}/i,
  },
];

/** What a text looks like it holds, if it looks like a secret. */
function looksLikeSecret(text: string): string | undefined {
  return SECRET_PATTERNS.find((s) => s.pattern.test(text))?.looksLike;
}

/**
 * The fields of a draft, and its body, that look like they hold a secret (B-vqn69), each with what it looks like: the
 * field's name and the kind, never the text. `secret_reason`, the reason for filing one anyway (B-jfkv9), isn't read.
 */
export function secretsIn(d: CardDraft, body = ""): Map<string, string> {
  const texts: [string, string][] = [
    ...Object.entries(d)
      .filter(([name]) => name !== "secret_reason")
      .flatMap(([name, v]): [string, string][] =>
        typeof v === "string" ? [[name, v]] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => [name, x]) : [],
      ),
    ["the body", body],
  ];
  const secrets = new Map<string, string>();
  for (const [name, text] of texts) {
    const kind = secrets.has(name) ? undefined : looksLikeSecret(text);
    if (kind) secrets.set(name, kind);
  }
  return secrets;
}

/**
 * An outcome that starts with a capital (B-b0dzp): the card shows it after "then", so it reads "then The relay…". A
 * program can't tell a name from an ordinary first word, so this only asks; a first word in capitals (CI, API) passes.
 */
function thenCapitals(d: CardDraft): string[] {
  const capital = (v: string | undefined) => v !== undefined && /^[A-Z]/.test(v) && !/^[A-Z0-9]{2,}\b/.test(v);
  return (["proposal_then", "alternative_then"] as const)
    .filter((name) => capital(d[name]))
    .map((name) => `${name} starts with a capital, and the card shows it after "then": start it lowercase, unless its first word is a name`);
}

/**
 * Advice on a draft that files anyway: no length limit has been measured yet, so long fields only warn; and a field,
 * or the body, that looks like it holds a secret (B-vqn69), named without quoting it. In a hosted repo the store refuses
 * such a draft instead, unless it gives `secret_reason` (B-jfkv9).
 */
export function filingWarnings(d: CardDraft, body = ""): string[] {
  const long: [string, string | undefined, number][] = [
    ["title", d.title, 60], ["proposal", d.proposal, 60], ["alternative", d.alternative, 60],
    ["question", d.question, 160], ["crux", d.crux, 160], ["doing", d.doing, 160],
    ["proposal_then", d.proposal_then, 240], ["alternative_then", d.alternative_then, 240],
  ];
  return [
    ...long.filter(([, v, max]) => v !== undefined && v.length > max).map(([name, v, max]) => `${name} is ${v!.length} characters; the card reads best under ${max}`),
    ...thenCapitals(d),
    ...[...secretsIn(d, body)].map(([name, kind]) => `${name} looks like it holds a secret (${kind}): the record is committed with the code, so check it before the next commit`),
  ];
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

/**
 * A verdict on one card revision: `verdicts/<at>-<id>-r<revision>-<suffix>.json`, with `at` first and compact, so a
 * listing shows verdicts in the order they were given (D107). Only the client writes these (D32).
 */
export const Verdict = z
  .strictObject({
    type: z.literal("verdict"),
    format: formatOf("verdict"),
    card: CardId,
    revision: z.number().int().min(1),
    response: Response,
    choice: z.string().min(1).optional(),
    comment: z.string().min(1).optional(),
    /** The option chosen before the agent's pick was shown (D86, D88). */
    first_choice: OptionKind.optional(),
    make_rule: z.boolean().optional(),
    /**
     * "You should have asked me" (D151, B-87tkc): on a card the gate held back, or in shadow would have, the reviewer
     * would have wanted to see it, whatever they chose. It counts as a miss on the card's row.
     */
    should_have_asked: z.boolean().optional(),
    /** Rules the chosen option breaks that the reviewer retired with this answer (D119). */
    retire_rules: z.array(RuleId).optional(),
    reviewer: z.string().min(1),
    /** The account that wrote it, on the hosted service (P16 section 7): set by the relay, beside the handle. */
    account: AccountId.optional(),
    /** The project it was given in, on the hosted service: set by the relay (B-tf9fc). */
    project: ProjectId.optional(),
    /**
     * The SHA-256 digest of the card revision's file as the relay received it (B-f571v): set by the relay, so the
     * service's signature, and a hard card's passkey proof, cover what was answered, not only its ID.
     */
    card_digest: Sha256.optional(),
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
  format: formatOf("withdrawal"),
  card: CardId,
  reason: z.string().min(1),
  by: z.string().min(1),
  at: Timestamp,
});
export type Withdrawal = z.infer<typeof Withdrawal>;

/** Frontmatter of a ledger entry: `ledger/<id>-<suffix>.md`. The body names symbols in backticks (D15). */
export const LedgerMeta = z.strictObject({
  type: z.literal("ledger"),
  format: formatOf("ledger"),
  card: CardId,
  branch: z.string().min(1),
  commit: z.string().optional(),
  at: Timestamp,
});
export type LedgerMeta = z.infer<typeof LedgerMeta>;

/**
 * A ledger entry's body (D120): one line naming the commit's short ID and the card, never its subject or message, which
 * stay on the machine (D181). Only an entry whose body is exactly this goes up to the relay; those written before D120
 * listed the commit's files, and stay on the machine.
 */
export const ledgerBody = (commit: string, card: string) => `Commit \`${commit.slice(0, 12)}\` builds on ${card}.\n`;

/** Whether a ledger entry's body, as `parseDoc()` reads it (after the blank line under the frontmatter), is `ledgerBody()`. */
export const isLedgerBody = (body: string, commit: string, card: string) => body.replace(/^\n+/, "") === ledgerBody(commit, card);

/**
 * A branch merged into another (D181): `merges/<commit>-<key>.json` in the live layer, where `key` is the first 12 hex
 * digits of the SHA-256 of `branch` and `into` (`mergeFile()`), so two machines that find the same merge write the same
 * path, and one branch fast-forwarded into two branches at one commit is two files. Found
 * by the CLI's hooks (src/merges.ts), never in the record; it goes up to the relay and comes down to the project's other
 * machines. `commit` is where it landed on `into`: the merge commit, the squash commit, or for a fast-forward the commit
 * the branch moved to; `tip`, the commit that landed from the merged side (B-w41p7): a merge commit's other parent, the
 * commit a fast-forward moved to, the tip a squash squashed; `at` is when, as git says it (a fast-forward found as it
 * happens: then); `cards`, the cards whose `source_branch` is `branch` it brought, or the cards its commits cite, where
 * the record isn't committed; `commits`, the commits made on `branch` that cite cards which it brought, oldest first,
 * checked against git's ancestry as it's written: reachable from `tip`, and not from `into` before. A later fast-forward
 * of the same branch is a merge of its own, at its own commit. Commit subjects and messages are never in it.
 */
export const MergeEvent = z.strictObject({
  type: z.literal("merge"),
  format: formatOf("merge"),
  branch: z.string().min(1),
  into: z.string().min(1),
  commit: CommitId,
  /** Absent only from a merge recorded before B-w41p7 (2026-11-05): before v1 a format changes in place (D108). */
  tip: CommitId.optional(),
  at: Timestamp,
  cards: z.array(CardId).default([]),
  commits: z.array(CommitId).default([]),
});
export type MergeEvent = z.infer<typeof MergeEvent>;

/**
 * A branch's name as git allows one (`git check-ref-format --branch`): no spaces, control characters or `~^:?*[\`, no
 * `..` or `@{`, no part starting with a dot or ending in `.lock`, not starting with a dash or a slash, nor ending in a
 * slash or a dot, and not `@`. Only a name, so nothing else can ride in it.
 */
export const BranchName = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (b) => b !== "@" && !/[\x00-\x20\x7f~^:?*[\\]/.test(b) && !b.includes("..") && !b.includes("@{") && !b.includes("//") && !/^[-/]|[/.]$/.test(b) && !b.split("/").some((p) => p.startsWith(".") || p.endsWith(".lock")),
    "a branch's name, as git allows one",
  );

/**
 * The repo's default branch (B-jr8mk), as the command line read it (`defaultBranch()`): `default-branch.json`, which a
 * machine sends the relay, so the website's branches panel knows which branch is the trunk. Only its name. Mutable: the
 * relay keeps the latest a machine sent, never logs it, and keeps it while the project exists. Never in the record, nor
 * in a machine's own live layer, which reads git instead.
 */
export const DefaultBranch = z.strictObject({
  type: z.literal("default-branch"),
  format: formatOf("default-branch"),
  branch: BranchName,
});
export type DefaultBranch = z.infer<typeof DefaultBranch>;

/** Frontmatter of a deck: `decks/<id>.md`. The body is the briefing. Membership is computed from cards. */
export const DeckMeta = z.strictObject({
  type: z.literal("deck"),
  format: formatOf("deck"),
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
  format: formatOf("rule"),
  id: RuleId,
  topic: Topic.optional(),
  /** Gate fact IDs this rule answers, as globs (`dep:pytest-*`): the gate acks them automatically (D24). */
  covers: z.array(z.string().min(1)).default([]),
  from_card: CardId.optional(),
  accepted_by: z.string().min(1),
  /** The account that wrote it, on the hosted service (P16 section 7): set by the relay, beside the handle. */
  account: AccountId.optional(),
  /** The project it was saved in, on the hosted service: set by the relay (B-tf9fc). */
  project: ProjectId.optional(),
  created: Timestamp,
});
export type RuleMeta = z.infer<typeof RuleMeta>;

/**
 * A rule retired by an answer that chose an option breaking it (D119): `rules/<id>-retired.json`, beside the rule,
 * which stays on record. The gate and the client skip a retired rule.
 */
export const RuleRetirement = z.strictObject({
  type: z.literal("rule-retirement"),
  format: formatOf("rule-retirement"),
  rule: RuleId,
  /** The card it was retired on. */
  card: CardId,
  by: z.string().min(1),
  /** The account that wrote it, on the hosted service (P16 section 7): set by the relay, beside the handle. */
  account: AccountId.optional(),
  /** The project it was made in, on the hosted service: set by the relay (B-tf9fc). */
  project: ProjectId.optional(),
  at: Timestamp,
});
export type RuleRetirement = z.infer<typeof RuleRetirement>;

/** A topic-key merge made in the client: `topics/alias-<suffix>.json` (D44). */
export const TopicAlias = z.strictObject({
  type: z.literal("topic-alias"),
  format: formatOf("topic-alias"),
  from: Topic,
  to: Topic,
  by: z.string().min(1),
  /** The account that wrote it, on the hosted service (P16 section 7): set by the relay, beside the handle. */
  account: AccountId.optional(),
  /** The project it was made in, on the hosted service: set by the relay (B-tf9fc). */
  project: ProjectId.optional(),
  at: Timestamp,
});
export type TopicAlias = z.infer<typeof TopicAlias>;

/**
 * An agent waiting on an existing card instead of filing a duplicate (D36): `attachments/<id>-<suffix>.json`. No
 * folder path: the branch already names the worktree, since git checks a branch out in only one (D121).
 */
export const Attachment = z.strictObject({
  type: z.literal("attachment"),
  format: formatOf("attachment"),
  card: CardId,
  agent: z.string().min(1),
  branch: z.string().min(1),
  at: Timestamp,
});
export type Attachment = z.infer<typeof Attachment>;

/** A blocking card the agent proceeded on without a verdict (D46): `cards/<id>/fallback-<suffix>.json`. */
export const Fallback = z.strictObject({
  type: z.literal("fallback"),
  format: formatOf("fallback"),
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
  format: formatOf("presence"),
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
  format: formatOf("waiting"),
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
  format: formatOf("server"),
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
  format: formatOf("port"),
  port: z.number().int().min(1).max(65535),
});
export type LastPort = z.infer<typeof LastPort>;

/**
 * An inbox cursor, `cursors/<branch>.json` in the live layer: the branch's place in its inbox, the time of the newest
 * verdict it has read (empty before the first), and `delivered`, what `baesian wait` has delivered since. A session
 * keeps its own place in `cursors/<branch>/<session>.json` (B-ghhym), with no `delivered`. Mutable; never in the
 * record. Written before v1, a cursor had neither `type` nor `format`.
 */
export const Cursor = z.strictObject({
  type: z.literal("cursor"),
  format: formatOf("cursor"),
  at: z.union([Timestamp, z.literal("")]),
  delivered: z.array(z.string().min(1)).optional(),
});
export type Cursor = z.infer<typeof Cursor>;

// ---------------------------------------------------------------- routing (M8: D144–D151, P16 sections 2 and 3)

export const Position = z.enum(POSITIONS);
export const Row = z.enum(ROWS);
export const Mode = z.enum(["shadow", "enforce"]);

/** A path glob for the commit gate (`globToRegExp()`), with no space at either end. */
const Glob = z.string().regex(/^\S(?:.*\S)?$/, "a glob, with no space at either end");

/** A preference file's name: `<at>-<suffix>.json`, timestamp first like a verdict's (D107), so the newest sorts last. */
export const PREFERENCE_FILE = new RegExp(`^\\d{8}T\\d{6}\\.\\d{3}Z-${SUFFIX}{5}\\.json$`);
const PreferenceName = z.string().regex(PREFERENCE_FILE, "a preference file is named <at>-<suffix>.json");

/**
 * One change to a repo's preferences: `preferences/<at>-<suffix>.json`, in the live layer and the record (D147). Written
 * once, by the client only (or by accepting a slider proposal in it), never by an agent and never in `Config`. The newest
 * is in force; the rest are the history. Every row is required, so a file means the same whatever a later Baesian's
 * presets are (P16). Spending, destroying data and publishing have no key: they're fixed at "never without me" (D146).
 */
export const Preferences = z
  .strictObject({
    type: z.literal("preferences"),
    format: formatOf("preferences"),
    /** shadow records what the gate would hold back, and holds nothing (D148). */
    mode: Mode,
    row_public_api: Position,
    row_schema: Position,
    row_dependency: Position,
    row_infra: Position,
    row_user_facing: Position,
    row_security: Position,
    row_privacy: Position,
    row_other: Position,
    /** The chance a held card is drawn for audit, at each of the two low positions (B-fgc4y). */
    rate_agent_decides: z.number().min(0).max(1),
    rate_sample: z.number().min(0).max(1),
    /** How many of each row's first held cards are all drawn (B-fgc4y). */
    burn_in: z.number().int().min(0),
    /**
     * What the commit gate looks at (B-qkek1), here rather than in the committed config so that only a person sets it,
     * and a change that makes the gate see less takes the passkey (D163). Each is a list of globs; left out, it's the
     * built-in list (`DEFAULT_SCHEMA`, `DEFAULT_INFRA`; no public modules; no paths ignored beyond `DEFAULT_IGNORE`). The
     * schema and infra lists replace the built-in ones, and an empty one is kept: the gate looks for none.
     */
    gate_schema: z.array(Glob).optional(),
    gate_infra: z.array(Glob).optional(),
    /** The public modules: the `api:` detector runs only when there are some (D59). */
    gate_api: z.array(Glob).min(1).optional(),
    /** Paths the gate never looks at, added to `DEFAULT_IGNORE`. */
    gate_ignore: z.array(Glob).min(1).optional(),
    /** The preset it started from (B-wwxa3). */
    profile: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
    /** The file this change was made from; absent only on the first. A change from an older view is refused (P16). */
    replaces: PreferenceName.optional(),
    /** The slider proposal it came from (B-y6jn6). */
    from_card: CardId.optional(),
    /** The setup survey's answers (B-5na1k): the rows whose example you wanted to see, and those you'd be fine not seeing. */
    survey_see: z.array(Row).optional(),
    survey_fine: z.array(Row).optional(),
    reason: z.string().min(1).optional(),
    by: z.string().min(1),
    /** The account that wrote it, on the hosted service (P16 section 7): set by the relay, beside the handle. */
    account: AccountId.optional(),
    /** The project it was made in, on the hosted service: set by the relay (B-tf9fc). */
    project: ProjectId.optional(),
    /** Which client wrote it (D62). */
    client: z.string().min(1),
    at: Timestamp,
  })
  .superRefine((p, ctx) => {
    for (const [row, floor] of Object.entries(ROW_FLOOR)) {
      const key = `row_${row}` as keyof typeof p;
      if (floor && rank(p[key] as (typeof POSITIONS)[number]) < rank(floor)) {
        ctx.addIssue({ code: "custom", path: [key], message: `${row} may go no lower than ${floor} (D146)` });
      }
    }
  });
export type Preferences = z.infer<typeof Preferences>;

/** The gate's outcome for one card revision (P16 section 3). */
export const GateOutcome = z.enum(["shown", "held"]);

/**
 * What the gate did with one card revision, and why: `cards/<id>/gate-r<n>-<by>.json`, beside the card, in both layers,
 * written once at filing (D145). Stored rather than computed, since the settings it applied and its draw are fixed when
 * it runs. The CLI's (`by: cli`) is the one that counts locally; a hosted repo's relay will write its own, signed (D158).
 * A classifier's model, score and threshold are reserved for later: a v1 reader refuses a record that sets them, as the
 * schema is strict.
 */
export const GateRecord = z
  .strictObject({
    type: z.literal("gate"),
    format: formatOf("gate"),
    card: CardId,
    revision: z.number().int().min(1),
    by: z.enum(["cli", "relay"]),
    /** The rules' version: rules-1. */
    gate: z.string().min(1),
    /** Copied from the preferences; shadow when there are none. */
    mode: Mode,
    /** The preference file it applied; absent when there was none, so "Today" applied, in shadow. */
    preferences: PreferenceName.optional(),
    /** What it read from the card. */
    touches: z.array(Fact).default([]),
    reverse: Reverse,
    /** The level the draft asked for, if any. It only raises a shown card's level (D144, B-chq61). */
    asked: Level.optional(),
    /** An agent's card; one Baesian filed itself; or a revision that follows an answer, or a reply. The last two are always shown. */
    source: z.enum(["agent", "baesian", "answer"]),
    /** The strictest row it fell in, and that row's position. */
    row: z.enum(ALL_ROWS),
    position: Position,
    /** In shadow, what it would have done. */
    outcome: GateOutcome,
    /** The level it was shown at, when shown. */
    level: Level.optional(),
    reason: z.enum(["row", "floor", "one-way", "agent", "baesian", "answer", "error"]),
    /** When held: the card's draw (a hash of its ID and revision, read as a number from 0 to 1), the chance it had, the row's earlier held cards the gate counted, and whether it was drawn, and by the burn-in (B-fgc4y). */
    draw: z.number().min(0).max(1).optional(),
    p: z.number().min(0).max(1).optional(),
    held_before: z.number().int().min(0).optional(),
    burn_in: z.boolean().optional(),
    drawn: z.boolean().optional(),
    /** The relay's signature its draw came from (D158): on the relay's record only, from M9. */
    draw_proof: z.string().min(1).optional(),
    /** The project it gated the card in: on the relay's record only (B-tf9fc). */
    project: ProjectId.optional(),
    at: Timestamp,
  })
  .superRefine((g, ctx) => {
    if (g.outcome === "shown" && !g.level) ctx.addIssue({ code: "custom", path: ["level"], message: "a shown card has a level" });
    if (g.outcome === "held" && (g.drawn === undefined || g.p === undefined || g.draw === undefined || g.held_before === undefined)) {
      ctx.addIssue({ code: "custom", path: ["drawn"], message: "a held card has its draw: draw, p, held_before and drawn" });
    }
  });
export type GateRecord = z.infer<typeof GateRecord>;

// ---------------------------------------------------------------- the hosted service's proof (M9a: D138, D139, D142, D159, D160)

/** A website's origin: its scheme and host, with no path. */
export const Origin = z.string().regex(/^https?:\/\/[^\s/?#]+$/, "an origin: https://host, with no path");

/** A service key's ID, chosen by the service: `trust/service-<key>.json`. */
const KeyId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a key ID is a lowercase slug");

/**
 * One of the service's signing keys (D142): `trust/service-<key>.json`, in the live layer and every branch's record, and
 * pinned in CI's own settings (`BAESIAN_TRUST`), where the copy must match. Written once, by the CLI from the relay. A
 * person-written file counts only with a `.sig` this key made while it was valid (D138, D160).
 */
export const ServiceKey = z.strictObject({
  type: z.literal("service-key"),
  format: formatOf("service-key"),
  key: KeyId,
  /** The Ed25519 public key in OpenSSH's form, as an allowed-signers line takes it: `ssh-ed25519 AAAA…`, with no comment. */
  public_key: z.string().regex(/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$/, "an Ed25519 key in OpenSSH's form: ssh-ed25519 AAAA…"),
  /** The website's origin and WebAuthn relying party, which a passkey proof under this key's signature must name (D139). */
  origin: Origin,
  rp_id: z.string().regex(/^[a-z0-9.-]+$/, "a relying party ID is a domain"),
  /** It signs only files whose own time is from `valid_after`, and before `valid_before` (git's allowed signers, B5 F14). */
  valid_after: Timestamp,
  valid_before: Timestamp.optional(),
});
export type ServiceKey = z.infer<typeof ServiceKey>;

/** A service key withdrawn: `trust/service-<key>-revoked.json`. A file signed at or after `at` doesn't count. */
export const ServiceKeyRevocation = z.strictObject({
  type: z.literal("service-key-revocation"),
  format: formatOf("service-key-revocation"),
  key: KeyId,
  reason: z.string().min(1),
  at: Timestamp,
});
export type ServiceKeyRevocation = z.infer<typeof ServiceKeyRevocation>;

/** The COSE algorithms a passkey proof is checked with: ES256, EdDSA and RS256. */
export const PASSKEY_ALGS = [-7, -8, -257] as const;

/**
 * A reviewer's passkey (D139, D159): `trust/passkey-<suffix>.json`, with a `.sig` beside it, written when it's enrolled on
 * the website. Pinned in CI by hand, as the service's key is; the record's copy serves checks on your machine.
 */
export const PasskeyKey = z.strictObject({
  type: z.literal("passkey-key"),
  format: formatOf("passkey-key"),
  account: AccountId,
  /** The account's handle, for people reading the file. */
  handle: z.string().min(1),
  credential: Base64Url,
  /** The public key, SubjectPublicKeyInfo in base64url, and its COSE algorithm. */
  public_key: Base64Url,
  alg: z.literal(PASSKEY_ALGS),
  enrolled: Timestamp,
});
export type PasskeyKey = z.infer<typeof PasskeyKey>;

/**
 * The repo's project, pinned in CI beside the keys (B-mar8x): a line of `BAESIAN_TRUST`, never a file in `trust/`. With
 * keys pinned, `baesian verify` checks every commit against this project, whatever a commit's config says, and finds the
 * commit that linked the repo to it once, from the tip it checks. `baesian ci` prints it.
 */
export const PinnedProject = z.strictObject({
  type: z.literal("project"),
  format: formatOf("project"),
  project: ProjectId,
});
export type PinnedProject = z.infer<typeof PinnedProject>;

/**
 * A passkey's proof that a person made a file (D139, D163): `<file without .json>.passkey.json` beside a verdict on a
 * hard card, or a preference change that lets more cards past. WebAuthn's assertion as the browser returned it, whose
 * challenge is the SHA-256 digest of the file's bytes (P16 section 7). Written once, by the relay.
 *
 * Or, for answers confirmed together by one tap (B-a6xpc), the batch form: `batch` lists the SHA-256 digest of every file
 * the tap confirmed, this one's among them, and the challenge is the digest of that list (`batchChallenge()`). Every
 * proof of the batch holds the same list and the same assertion: that's the signature they share.
 */
export const PasskeyProof = z.strictObject({
  type: z.literal("passkey-proof"),
  format: formatOf("passkey-proof"),
  /** The file it proves, by name, in the same folder. */
  file: z.string().min(1),
  /** In the batch form (B-a6xpc): the digests of the files one tap confirmed, in the order the relay wrote them. */
  batch: z.array(Sha256).min(1).optional(),
  credential: Base64Url,
  authenticator_data: Base64Url,
  client_data: Base64Url,
  signature: Base64Url,
});
export type PasskeyProof = z.infer<typeof PasskeyProof>;

/**
 * `.baesian/config.json`: committed, shared by everyone working on the repo. Its `format` is optional: people write it.
 * In personal mode (B-4rwyz) the same config is the clone's own, `.git/baesian/config.json`, and nothing is committed.
 */
export const Config = z
  .strictObject({
    format: formatOf("config").optional(),
    vault: z.string().optional(),
    /** The hosted service's address (P16 section 8), set with `project` when the repo is linked. */
    service: Origin.optional(),
    /** The project's random ID on the service. No secret, since this file is committed. */
    project: ProjectId.optional(),
    /**
     * The repo's first commit, written when it's linked (B-5gnea): a checkout whose history doesn't start there is a copy
     * of the repo, not the repo, and doesn't sync with the project. Set only with `service`.
     */
    first_commit: CommitId.optional(),
    /**
     * The paths whose edits are user-facing in this repo, as globs (B-bf29j): the plugin's hook reminds an agent about
     * to edit one that a decision there goes to the person as a card (B-qrdhh). Only a reminder, never a gate fact, so
     * it lives here, where agents set it, with no built-in list: a repo that declares none gets no reminder.
     */
    user_facing: z.array(Glob).min(1).optional(),
    /**
     * No longer read (B-qkek1): what the gate looks at is in the preference files now, which only the client writes, since
     * agents edit this file. Still accepted, so a config that has them reads, and `baesian check` and `baesian verify`
     * warn that they're ignored (`staleGateKeys()`).
     */
    gate_schema: z.array(z.string().min(1)).optional(),
    gate_infra: z.array(z.string().min(1)).optional(),
    gate_ignore: z.array(z.string().min(1)).optional(),
    gate_api: z.array(z.string().min(1)).optional(),
  })
  .superRefine((c, ctx) => {
    if ((c.service === undefined) !== (c.project === undefined)) {
      ctx.addIssue({ code: "custom", path: [c.service === undefined ? "service" : "project"], message: "service and project are set together" });
    }
    if (c.first_commit !== undefined && c.service === undefined) {
      ctx.addIssue({ code: "custom", path: ["first_commit"], message: "first_commit is set only in a linked repo, with service and project" });
    }
  });
export type Config = z.infer<typeof Config>;

/**
 * `~/.config/baesian/config.json`: personal, never committed. Notification settings live here, not in
 * the repo: a committed `notify` command would run on every clone, and push tokens would leak. Its `format` is
 * optional: Baesian never writes it.
 */
export const UserConfig = z.strictObject({
  format: formatOf("user-config").optional(),
  /** A shell command run when a blocking or hard card is filed; it receives the card as JSON on stdin (D40). */
  notify: z.string().optional(),
  /** OS notifications for blocking and hard cards. Default true. */
  os_notify: z.boolean().optional(),
});
export type UserConfig = z.infer<typeof UserConfig>;

// ---------------------------------------------------------------- the relay's protocol (M9b: D127, D137, P16 section 8)

const Base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, "base64");

/**
 * One file in a relay's append-only log (P16 section 8), as `GET /v1/projects/{project}/log` sends it and the CLI will pull
 * it (M9d). It's part of the relay's protocol, versioned by `/v1/` in its address, not a file on disk, so it has no
 * `type` or `format` of its own: `format` is the file's. A `.sig` rides in its file's entry, as `sig`, and is never an
 * entry itself. `enc` is reserved for encryption (D137): absent in v1, and an entry that sets it is refused
 * (`readRelayEntry()`), so an encrypted entry from a later version fails loudly rather than being read as text.
 */
export const RelayEntry = z.strictObject({
  /** The project's sequence number for it: from 1, strictly increasing, never reused. */
  seq: z.number().int().min(1),
  /** Its path in the live layer. */
  path: z.string().min(1),
  /** The file's own format number; 1 for a file that names none (D156). */
  format: z.number().int().min(1),
  /** Its length in bytes, and the SHA-256 digest of its bytes, which a signature covers. */
  size: z.number().int().min(0),
  digest: Sha256,
  /** Its bytes, in base64. Dropped once it's delivered and its card resolved (D137); the rest of the entry is kept. */
  body: Base64.optional(),
  /** Its `.sig`'s bytes, in base64, for the kinds the service signs (D138, D160). */
  sig: Base64.optional(),
  /** The signed-in machine that uploaded it, if a machine did (D162: only the relay knows). */
  machine: z.string().min(1).optional(),
  /**
   * A file a person wrote before the repo was linked, which a machine uploaded at first link (B-3zjjx): unsigned, kept
   * apart, and counted by each machine only where it was in the record at the linking commit (B-45xz8).
   */
  before_linking: z.literal(true).optional(),
  /** When the relay accepted it, by the relay's clock. */
  at: Timestamp,
});
export type RelayEntry = z.infer<typeof RelayEntry>;

/** An entry from a relay, checked (P16 section 8). One that sets `enc` is from a later version that encrypts, and is refused by name (D137). */
export function readRelayEntry(fields: unknown): RelayEntry {
  if (typeof fields === "object" && fields !== null && "enc" in fields) {
    throw new Error(`the relay's entry ${JSON.stringify((fields as { path?: unknown }).path ?? "")} is encrypted (enc), which this Baesian can't read: upgrade Baesian`);
  }
  return RelayEntry.parse(fields);
}

/**
 * What the CLI keeps of a relay (M9d, P16 section 8): `relay.json` in the live layer, mutable, replaced whole whenever it
 * syncs. Never in the record, and never sent. For one service and project: a repo linked to another starts afresh.
 */
export const RelayState = z.strictObject({
  type: z.literal("relay"),
  format: formatOf("relay"),
  service: Origin,
  project: ProjectId,
  /** The last sequence number pulled from the relay's log. */
  pulled: z.number().int().min(0),
  /** The live layer's files the relay has: those it acknowledged an upload of, and those pulled from it. */
  uploaded: z.array(z.string().min(1)),
  /** The repo's default branch as this machine last sent it (B-jr8mk): sent again only when what it reads changes. */
  default_branch: BranchName.optional(),
  /** The last sync. */
  at: Timestamp,
});
export type RelayState = z.infer<typeof RelayState>;

/**
 * What a clone in personal mode (B-4rwyz) held of what a person writes when it was linked: `before-linking.json` in the
 * live layer, written once per project by `baesian login`. Nothing is committed in personal mode, so there's no record at
 * the linking commit to say which answers from before linking count (B-45xz8): this plays its part. Never committed, and
 * never sent: the relay takes the answers themselves, at first link (B-3zjjx).
 */
export const BeforeLinkingSnapshot = z.strictObject({
  type: z.literal("before-linking"),
  format: formatOf("before-linking"),
  project: ProjectId,
  /** When it was taken: when the clone was linked. */
  at: Timestamp,
  /** The repo's object format, which says how each blob ID was taken. */
  object_format: z.enum(["sha1", "sha256"]),
  /** Each unsigned file a person wrote, by its path in the live layer, with its git blob ID. */
  files: z.record(z.string().min(1), z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, "a blob ID in lowercase hex")),
});
export type BeforeLinkingSnapshot = z.infer<typeof BeforeLinkingSnapshot>;

/**
 * A machine's grant for one project (B-84e0d, B-gq8j1, M9d): `grants/<project>.json` beside the personal config,
 * readable only by the user (mode 0600). Written by `baesian login`, replaced whole at each refresh, before the new
 * tokens are used, since a refresh token is used once (RFC 9700); removed by `baesian logout`. Never in a repo.
 */
export const MachineGrant = z.strictObject({
  type: z.literal("grant"),
  format: formatOf("grant"),
  service: Origin,
  project: ProjectId,
  /** The name the website's Machines page shows. */
  machine: z.string().min(1),
  access_token: z.string().min(16),
  access_expires: Timestamp,
  refresh_token: z.string().min(16),
});
export type MachineGrant = z.infer<typeof MachineGrant>;

/** Format a Zod error for a person reading a terminal. */
export function describeError(error: z.ZodError): string {
  return z.prettifyError(error);
}

/**
 * Why a draft isn't a card, in a few lines rather than the schema library's message for each field (B-eyrt5): the
 * headline, then the fields that are missing, those left empty, and those whose value isn't one it takes.
 */
export function describeDraftError(error: z.ZodError, draft?: unknown): string {
  const missing: string[] = [];
  const empty: string[] = [];
  const invalid: string[] = [];
  const unknown: string[] = [];
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".") || "the card";
    if (issue.code === "invalid_type" && /received undefined$/.test(issue.message)) missing.push(field);
    else if (issue.code === "too_small" && issue.origin === "string") empty.push(field);
    else if (issue.code === "invalid_value") invalid.push(`${field} must be ${listOf(issue.values.map(String), "or")}`);
    else if (issue.code === "unrecognized_keys") unknown.push(...issue.keys);
    else invalid.push(`${field}: ${issue.message}`);
  }
  const fields = new Set(error.issues.map((i) => i.path.map(String).join(".")));
  // Unfilled: every field is missing, or empty, or one of a list left as the template has it, "".
  const valueAt = (path: PropertyKey[]) => path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<PropertyKey, unknown>)[k] : undefined), draft);
  const unfilled = !unknown.length && error.issues.every((i) => i.code !== "invalid_value" || [undefined, ""].includes(valueAt(i.path) as string)) && invalid.length === error.issues.filter((i) => i.code === "invalid_value").length;
  const n = fields.size;
  const head = `not filed: ${n === 1 ? "1 of the card's fields needs" : `${n} of the card's fields need`} ${unfilled ? "filling in" : "fixing"}`;
  return [
    head,
    ...(missing.length ? [`  missing:  ${missing.join(", ")}`] : []),
    ...(empty.length ? [`  empty:    ${empty.join(", ")}`] : []),
    ...invalid.map((i) => `  invalid:  ${i}`),
    ...(unknown.length ? [`  unknown:  ${unknown.join(", ")}, which a card doesn't have`] : []),
  ].join("\n");
}

/** "a, b or c". */
function listOf(items: string[], last: string): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;
}
