import { parseDoc } from "../../src/frontmatter.js";
import { Attachment, CARD_ID, CardMeta, DeckMeta, Fallback, type FileKindName, GateRecord, NewerFormat, Waiting, Withdrawal, describeError, upgradeFile } from "../../src/schema.js";
import type { Store } from "../../src/store.js";

// What a machine may upload (Hosted Service sections 1 and 3): only the kinds of file an agent writes, each checked
// against the store's own schema and against its path. Verdicts, rules, topic merges, preferences, signatures, the
// relay's gate records and trust files are written only by the relay, from a person's session, and signed.

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
  /** What's wrong with it, given its path's parts and the project's store, or nothing. */
  check(parts: string[], fields: Record<string, unknown>, store: Store): string | undefined;
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
  {
    name: "a waiting marker",
    path: new RegExp(`^waiting/(${ID})-${SUFFIX}\\.json$`),
    kind: "waiting",
    schema: Waiting,
    mutable: true,
    check: (parts, f, store) => sameCard(parts, f) ?? cardHere(parts[1]!, store),
  },
];

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
    ? `${path} is a kind of file only a person writes, through the relay, which signs it: a machine never uploads one (P15 section 3)`
    : `${path} isn't a kind of file an agent writes: a machine uploads card revisions, the CLI's gate records, withdrawals, fallbacks, attachments, decks and waiting markers`;
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
  try {
    fields = kind.doc ? parseDoc(text).meta : JSON.parse(text);
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
  const why = kind.check(parts, parsed.data as Record<string, unknown>, store);
  return why ? { status: 400, error: `${path}: ${why}` } : undefined;
}
