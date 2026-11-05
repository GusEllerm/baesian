import { parseDoc } from "../../src/frontmatter.js";
import { Attachment, CARD_ID, CardMeta, CommitId, DeckMeta, Fallback, type FileKindName, GateRecord, LedgerMeta, MergeEvent, NewerFormat, Preferences, RuleMeta, RuleRetirement, TopicAlias, Verdict, Waiting, Withdrawal, describeError, isLedgerBody, upgradeFile } from "../../src/schema.js";
import { type Store, mergeFile } from "../../src/store.js";

// What a machine may upload (Hosted Service sections 1 and 3): only the kinds of file an agent writes, each checked
// against the store's own schema and against its path. Verdicts, rules, topic merges, preferences, signatures, the
// relay's gate records and trust files are written only by the relay, from a person's session, and signed. One bounded
// exception (B-3zjjx): at first link, before the project's first answer on the website, a machine may upload the answers,
// rules, topic merges and preference files from before linking, which the relay keeps unsigned and apart.

const ID = CARD_ID.source.replace(/^\^|\$$/g, "");
const SUFFIX = "[0-9a-z]+";

/** A schema, as the store's are: only what's needed of one here. */
interface Schema {
  safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: Parameters<typeof describeError>[0] };
}

/** One kind of file an agent writes, where it goes, and what its fields must say about where it is. */
interface AgentKind {
  name: string;
  path: RegExp;
  kind: FileKindName;
  schema: Schema;
  /** Frontmatter and a body, or JSON. */
  doc?: true;
  /** A waiting marker: mutable state, replaced and removed, never in the log (D90). */
  mutable?: true;
  /** What's wrong with it, given its path's parts, the project's store, and a document's body, or nothing. */
  check(parts: string[], fields: Record<string, unknown>, store: Store, body?: string): string | undefined;
}

const sameCard = (parts: string[], fields: Record<string, unknown>) => (fields.card === parts[1] ? undefined : `it's for ${String(fields.card)}, but its path is ${parts[1]}'s`);
const cardHere = (id: string, store: Store) => (store.card(id) ? undefined : `${id} isn't here yet: upload its first revision first`);
const revisionHere = (id: string, revision: unknown, store: Store) => (store.revisions(id).some((r) => r.meta.revision === revision) ? undefined : `${id} has no revision ${String(revision)} here: upload it first`);

export const AGENT_KINDS: readonly AgentKind[] = [
  {
    name: "a card revision",
    path: new RegExp(`^cards/(${ID})/r(\\d+)\\.md$`),
    kind: "card",
    schema: CardMeta,
    doc: true,
    check: ([, id, n], f, store) => {
      if (f.id !== id || f.revision !== Number(n)) return `it's ${String(f.id)} r${String(f.revision)}, but its path says ${id} r${n}`;
      return Number(n) > 1 ? revisionHere(id!, Number(n) - 1, store) : undefined;
    },
  },
  {
    name: "the CLI's gate record",
    path: new RegExp(`^cards/(${ID})/gate-r(\\d+)-cli\\.json$`),
    kind: "gate",
    schema: GateRecord,
    check: (parts, f, store) => (f.by !== "cli" ? "a gate record a machine uploads is the CLI's own (by: cli); the relay writes its own" : f.revision !== Number(parts[2]) ? `it's for r${String(f.revision)}, but its path says r${parts[2]}` : (sameCard(parts, f) ?? revisionHere(parts[1]!, f.revision, store))),
  },
  {
    name: "a withdrawal",
    path: new RegExp(`^cards/(${ID})/withdrawn\\.json$`),
    kind: "withdrawal",
    schema: Withdrawal,
    check: (parts, f, store) => sameCard(parts, f) ?? cardHere(parts[1]!, store),
  },
  {
    name: "a fallback",
    path: new RegExp(`^cards/(${ID})/fallback-${SUFFIX}\\.json$`),
    kind: "fallback",
    schema: Fallback,
    check: (parts, f, store) => sameCard(parts, f) ?? revisionHere(parts[1]!, f.revision, store),
  },
  {
    name: "an attachment",
    path: new RegExp(`^attachments/(${ID})-${SUFFIX}\\.json$`),
    kind: "attachment",
    schema: Attachment,
    check: (parts, f, store) => sameCard(parts, f) ?? cardHere(parts[1]!, store),
  },
  {
    name: "a deck",
    path: /^decks\/([a-z0-9][a-z0-9-]*)\.md$/,
    kind: "deck",
    schema: DeckMeta,
    doc: true,
    check: ([, id], f) => (f.id === id ? undefined : `it's deck ${String(f.id)}, but its path says ${id}`),
  },
  // D181: what the hooks write. A ledger entry's body names only the commit's short ID and the card, never its subject
  // or message; a merge names its branches, commit, time and cards.
  {
    name: "a ledger entry",
    path: new RegExp(`^ledger/(${ID})-${SUFFIX}\\.md$`),
    kind: "ledger",
    schema: LedgerMeta,
    doc: true,
    check: (parts, f, store, body) => {
      if (f.card !== parts[1]) return `it's for ${String(f.card)}, but its path is ${parts[1]}'s`;
      if (typeof f.commit !== "string" || !CommitId.safeParse(f.commit).success) return "it must name its commit, in full";
      if (body === undefined || !isLedgerBody(body, f.commit, parts[1]!)) return "its body must be the one line naming the commit's short ID and the card: a commit's subject and message stay on the machine";
      return cardHere(parts[1]!, store);
    },
  },
  {
    name: "a merge",
    path: /^merges\/([0-9a-f]{40}|[0-9a-f]{64})-([0-9a-f]{12})\.json$/,
    kind: "merge",
    schema: MergeEvent,
    check: ([path, commit], f) => {
      if (f.commit !== commit) return `it's for commit ${String(f.commit)}, but its path names ${commit}`;
      if (f.branch === f.into) return "a merge is of one branch into another";
      const named = mergeFile(commit!, String(f.branch));
      return path === named ? undefined : `its path isn't named for its branch: it would be ${named}`;
    },
  },
  {
    name: "a waiting marker",
    path: new RegExp(`^waiting/(${ID})-${SUFFIX}\\.json$`),
    kind: "waiting",
    schema: Waiting,
    mutable: true,
    check: (parts, f, store) => sameCard(parts, f) ?? cardHere(parts[1]!, store),
  },
];

/** What a person wrote before the repo was linked names no account or project: those come only from the website. */
const unlinked = (f: Record<string, unknown>) => (f.account !== undefined || f.project !== undefined ? "it names an account or a project, which only an answer given on the website does" : undefined);
/** A file named for its own time, as verdicts and preference files are (D107). */
const namedAt = (at: string, f: Record<string, unknown>) => (typeof f.at === "string" && f.at.replace(/[-:]/g, "") === at ? undefined : `its name says ${at}, but it says ${String(f.at)}`);
const ruleHere = (id: string, store: Store) => (store.rules().some((r) => r.meta.id === id) ? undefined : `rule ${id} isn't here yet: upload it first`);
const RULE = `R-${SUFFIX}`;
const AT = "\\d{8}T\\d{6}\\.\\d{3}Z";

/**
 * What a person wrote before the repo was linked, which a machine may upload at first link (B-3zjjx), while nobody has
 * answered on the website yet. Each is checked as an upload is, and must name no account or project.
 */
export const BEFORE_LINKING_KINDS: readonly AgentKind[] = [
  {
    name: "an answer from before linking",
    path: new RegExp(`^verdicts/(${AT})-(${ID})-r(\\d+)-${SUFFIX}\\.json$`),
    kind: "verdict",
    schema: Verdict,
    check: ([, at, id, n], f, store) => unlinked(f) ?? namedAt(at!, f) ?? (f.card !== id || f.revision !== Number(n) ? `it answers ${String(f.card)} r${String(f.revision)}, but its name says ${id} r${n}` : revisionHere(id!, Number(n), store)),
  },
  {
    name: "a rule from before linking",
    path: new RegExp(`^rules/(${RULE})\\.md$`),
    kind: "rule",
    schema: RuleMeta,
    doc: true,
    check: ([, id], f) => unlinked(f) ?? (f.id === id ? undefined : `it's rule ${String(f.id)}, but its path says ${id}`),
  },
  {
    name: "a rule's retirement from before linking",
    path: new RegExp(`^rules/(${RULE})-retired\\.json$`),
    kind: "rule-retirement",
    schema: RuleRetirement,
    check: ([, id], f, store) => unlinked(f) ?? (f.rule === id ? ruleHere(id!, store) : `it retires ${String(f.rule)}, but its path says ${id}`),
  },
  {
    name: "a topic merge from before linking",
    path: new RegExp(`^topics/alias-${SUFFIX}\\.json$`),
    kind: "topic-alias",
    schema: TopicAlias,
    check: (_parts, f) => unlinked(f),
  },
  {
    name: "a preference file from before linking",
    path: new RegExp(`^preferences/(${AT})-${SUFFIX}\\.json$`),
    kind: "preferences",
    schema: Preferences,
    check: ([, at], f) => unlinked(f) ?? namedAt(at!, f),
  },
];

/** The kind of file from before linking a path is (B-3zjjx), or undefined: then it's no such file. */
export function beforeLinkingKind(path: string): { kind: AgentKind; parts: string[] } | undefined {
  for (const kind of BEFORE_LINKING_KINDS) {
    const m = kind.path.exec(path);
    if (m) return { kind, parts: [...m] };
  }
  return undefined;
}

/** The kind of agent-written file a path is, or undefined: then a machine may not upload it. */
export function agentKind(path: string): { kind: AgentKind; parts: string[] } | undefined {
  for (const kind of AGENT_KINDS) {
    const m = kind.path.exec(path);
    if (m) return { kind, parts: [...m] };
  }
  return undefined;
}

/** Why a machine may not upload to `path`, for the refusal. */
export function notAgentWritten(path: string): string {
  const top = path.split("/")[0];
  const theirs = ["verdicts", "rules", "topics", "preferences", "trust"].includes(top!) || path.endsWith(".sig") || /\/gate-r\d+-relay\.json$/.test(path);
  return theirs
    ? `${path} is a kind of file only a person writes, through the relay, which signs it: a machine never uploads one (P15 section 3), but for the answers from before linking, before anyone answers on the website (B-3zjjx)`
    : `${path} isn't a kind of file an agent writes: a machine uploads card revisions, the CLI's gate records, withdrawals, fallbacks, attachments, decks, waiting markers, ledger entries and merges`;
}

/**
 * Check an upload's bytes as the store reads that kind (D156, D157): UTF-8, its frontmatter or JSON through its schema,
 * and its fields matching its path. Returns why it's refused, or nothing.
 */
export function uploadProblem(kind: AgentKind, parts: string[], path: string, bytes: Uint8Array, store: Store): { status: number; error: string } | undefined {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { status: 400, error: `${path} isn't UTF-8 text` };
  }
  let fields: unknown;
  let body: string | undefined;
  try {
    if (kind.doc) ({ meta: fields, body } = parseDoc(text));
    else fields = JSON.parse(text);
  } catch (e) {
    return { status: 400, error: `${path} can't be read as ${kind.name}: ${e instanceof Error ? e.message : String(e)}` };
  }
  let upgraded: unknown;
  try {
    upgraded = upgradeFile(kind.kind, fields, path);
  } catch (e) {
    if (e instanceof NewerFormat) return { status: 422, error: e.message };
    throw e;
  }
  const parsed = kind.schema.safeParse(upgraded);
  if (!parsed.success) return { status: 400, error: `${path} isn't valid as ${kind.name}:\n${describeError(parsed.error)}` };
  const why = kind.check(parts, parsed.data as Record<string, unknown>, store, body);
  return why ? { status: 400, error: `${path}: ${why}` } : undefined;
}
