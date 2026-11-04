import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { z } from "zod";
import { FolderStorage } from "./folder-storage.js";
import { parseDoc, renderDoc } from "./frontmatter.js";
import { type Repo, git, openRepo, slug } from "./git.js";
import { newId, randomSuffix } from "./ids.js";
import {
  type AnyRow,
  BAESIAN,
  GATE_VERSION,
  type GateSource,
  PRESETS,
  type Position,
  ROWS,
  type Row,
  type Settings,
  TODAY,
  higherLevel,
  isOwnCard,
  levelInForce,
  loosening,
  rowOf,
  route,
  suggestPreset,
} from "./routing.js";
import {
  Attachment,
  CardDraft,
  CardMeta,
  Config,
  Cursor,
  FACT_PATTERN,
  DeckMeta,
  Fallback,
  GateRecord,
  HARD_BY_DEFAULT,
  LedgerMeta,
  type Level,
  NewerFormat,
  PREFERENCE_FILE,
  type PasskeyKey,
  PasskeyProof,
  Preferences,
  Presence,
  RuleMeta,
  RuleRetirement,
  type ServiceKey,
  type ServiceKeyRevocation,
  TopicAlias,
  Verdict,
  Waiting,
  Withdrawal,
  filingProblems,
  filingWarnings,
  secretsIn,
  describeError,
  type FileKindName,
  newestFormat,
  upgradeFile,
} from "./schema.js";
import { proofProblem } from "./passkey.js";
import { byLine, cardAuthor } from "./quote.js";
import { SIMILAR_TITLE, jaccard, nearTopics, tokens } from "./similarity.js";
import { type Storage, alreadyExists } from "./storage.js";
import { type History, readHistory } from "./trailers.js";
import { type TrustRoot, checkSigned, pinnedTrust, readTrustFile } from "./trust.js";

/** The live layer, inside git's common directory: shared by every worktree of a clone, never committed (D34). */
export const LIVE_DIR = "baesian";
/** The record layer, committed on the branch (D34). */
export const RECORD_DIR = ".baesian";

const KINDS = ["cards", "verdicts", "ledger", "decks", "rules", "topics", "attachments", "waiting"] as const;

export type { Brief, BriefCommit, Status } from "./api.js";
import type { Brief, BriefCommit, Status } from "./api.js";

/** Statuses that still need the reviewer. A held card doesn't, unless it's drawn for audit (D150, D151). */
export const PENDING: ReadonlySet<Status> = new Set(["open", "returned", "rerouted", "deferred"]);

export { BAESIAN } from "./routing.js";

/** Responses that return a card to its agent. */
const RETURNS: ReadonlySet<Verdict["response"]> = new Set(["reject", "question", "need_context", "see_it_run"]);

/**
 * A card revision's draw for audit (P16 section 3): a SHA-256 hash of its ID and revision, its first six bytes read as a
 * number from 0 to 1. The store picks the ID, so the agent can't choose it; `baesian verify` recomputes it.
 */
export function drawOf(id: string, revision: number): number {
  return createHash("sha256").update(`${id} r${revision}`).digest().readUIntBE(0, 6) / 2 ** 48;
}

/** A change to the preferences, as the client asks for it (D147): any field over the file in force, a preset, or the survey's answers. */
export type PreferenceChange = Partial<Omit<Preferences, "type" | "format" | "replaces" | "from_card" | "by" | "client" | "at">> & {
  replaces?: string | undefined;
  preset?: string | undefined;
};

/** The settings a preference file holds, as the gate reads them. */
export function settingsOf(p: Preferences): Settings {
  return {
    mode: p.mode,
    rows: Object.fromEntries(ROWS.map((r) => [r, p[`row_${r}`]])) as Record<Row, Position>,
    rate_agent_decides: p.rate_agent_decides,
    rate_sample: p.rate_sample,
    burn_in: p.burn_in,
  };
}

export interface Card {
  meta: CardMeta;
  body: string;
}

/** The card fields only Baesian sets, never a draft: a reply, a drafted rule, a convention, a slider move. */
type OwnFields = Partial<Pick<CardMeta, "reply" | "rule" | "rule_covers" | "convention" | "pref_row" | "pref_from" | "pref_to">>;

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

/** An inbox item's name in the cursor's `delivered` list: the card it's listed under, and its verdict. */
const inboxKey = (i: InboxItem) => `${i.card} ${i.verdict.card} ${i.verdict.at}`;

/** A time as a file name starts with it (D107): `20261101T093012.345Z`. */
const compactAt = (at: string) => at.replace(/[-:]/g, "");

/** A rule, or its retirement (D119): `rules/<id>.md`, `rules/<id>-retired.json`. */
const RULE_FILE = /^R-[0-9a-z]{5}(\.md|-retired\.json)$/;

/** The card a verdict file is for, from its name: `<at>-<id>-r<revision>-<suffix>.json` (D107). */
const VERDICT_FILE = /^\d{8}T\d{6}\.\d{3}Z-(B-[0-9a-z]{5})-r\d+-[0-9a-z]+\.json$/;
export const verdictFileCard = (name: string): string | undefined => VERDICT_FILE.exec(name)?.[1];

/** A relay's gate record, which the service signs (D158). */
const RELAY_GATE = /^gate-r\d+-relay\.json$/;

/** A file that goes with another: its signature (D160), or its passkey proof (D139). Copied with it, never read as it. */
const isCompanion = (name: string) => name.endsWith(".sig") || name.endsWith(".passkey.json");

/** Where a file's passkey proof would be: beside it, `.passkey.json` for `.json` (P16 section 7). */
export const proofPath = (rel: string) => rel.replace(/\.json$/, ".passkey.json");

/**
 * Whether a file in the live layer is of a kind the service signs (D138, P16 section 7): what a person writes, as
 * `Store.judge` judges it (verdicts, rules and their retirements, topic aliases, preference files), the relay's gate
 * records, and passkey keys. The relay signs each as it's written; a machine may upload none of them (P15 section 3).
 */
export function signedFile(rel: string): boolean {
  const [dir, a, b, ...rest] = rel.split("/");
  if (!a || rest.length) return false;
  if (b !== undefined) return dir === "cards" && RELAY_GATE.test(b);
  if (dir === "verdicts") return verdictFileCard(a) !== undefined;
  if (dir === "rules") return RULE_FILE.test(a);
  if (dir === "topics") return a.startsWith("alias-") && a.endsWith(".json");
  if (dir === "preferences") return PREFERENCE_FILE.test(a);
  if (dir === "trust") return a.startsWith("passkey-") && a.endsWith(".json");
  return false;
}

/**
 * A hosted repo's keys (D138, D142): CI's pinned keys when it pins any, whatever the record says, so a commit that drops
 * the record's copy can't switch the checks off; otherwise the copy in the layer, its passkeys counted only when the
 * service signed them.
 */
export interface Hosted {
  root: TrustRoot;
  pinned: boolean;
  /** The project the repo is linked to, from its config: a signed file counts only in its own (B-tf9fc). */
  project: string | undefined;
}

/** What a signed file says about itself, for the checks it takes (`Store.signedClaim`). */
interface Claim {
  at: string;
  account?: string | undefined;
  project?: string | undefined;
  /** For an answer: the card revision it answers, and the digest of that revision's file it names (B-f571v). */
  answers?: { card: string; revision: number; digest: string | undefined };
  /** Why it takes a passkey proof, when it does. */
  proof?: string | undefined;
}

/** Whether a file a person writes counts in a hosted repo (D138), and why not. Outside one, everything counts. */
export type Judgement = { ok: true } | { ok: false; why: string };
const COUNTS: Judgement = { ok: true };
const doesnt = (why: string): Judgement => ({ ok: false, why });

/** The service's keys and passkeys found in a layer's `trust/` folder, each with its file. */
export interface TrustFiles {
  service: { file: string; key: ServiceKey }[];
  revoked: { file: string; key: ServiceKeyRevocation }[];
  passkeys: { file: string; key: PasskeyKey }[];
}

/** A waiting marker counts as gone after three missed beats, as presence does (D41, D90). */
export const WAITING_BEAT_MS = 30_000;
export const WAITING_STALE_MS = 90_000;

export interface FileResult {
  card: Card;
  /** What the gate did with it, as its record says (D145). */
  gate: GateRecord;
  /** Topics already in use that look like the one filed (D44). Advisory. */
  nearTopics: string[];
  /** Set when the card's facts made it hard, above the level the agent asked for (D42, D144). */
  hardBecause?: string[];
  /** Advice on fields that file anyway, such as long ones, and a preference file the gate couldn't read. */
  warnings: string[];
}

/** The preferences the gate applies now: the newest file, or "Today" in shadow with none, or with one it can't read (P14). */
export interface InForce {
  name?: string;
  file?: Preferences;
  settings: Settings;
  /** Why the newest file couldn't be read. */
  problem?: string;
}

// The store's errors, by kind, so the MCP server can name each with a code (P18). The CLI prints their messages, and
// exits 1, as it always has; `PossibleDuplicate` exits 3.

/** The card fails its schema or a filing rule. */
export class ValidationError extends Error {}

/**
 * In a hosted repo, a draft that looks like it holds a secret, with no `secret_reason` (B-jfkv9): nothing is written. The
 * message names each field and what it looks like, never the text, as filing's warning does (D136).
 */
export class LooksLikeSecret extends ValidationError {
  constructor(readonly secrets: Map<string, string>) {
    super(
      [
        "nothing filed: in a hosted repo a card goes to the service as it's filed, and this one looks like it holds a secret (B-jfkv9):",
        ...[...secrets].map(([field, kind]) => `  - ${field} looks like it holds ${kind}`),
        "Take it out and file again. If it isn't a secret, file it anyway with a reason, kept on the card: --secret-reason \"<why>\" (secret_reason in the MCP tools).",
      ].join("\n"),
    );
  }
}

/** Raised by `fileCard` when the decision may already be open or decided (D36, D38). */
export class PossibleDuplicate extends Error {
  constructor(readonly matches: Match[]) {
    super("this decision may already be on file");
  }
}

/** Baesian isn't set up in the repository. */
export class NotSetUp extends Error {
  constructor() {
    super("Baesian is not set up in this repository: run `baesian init`");
  }
}

/** No card with that ID. */
export class NoCard extends Error {
  constructor(readonly id: string) {
    super(`no card ${id}`);
  }
}

/** The card's state, or who is asking, doesn't allow it: revising a card that isn't returned, a second reply. */
export class NotAllowed extends Error {}

/** The card names a deck that doesn't exist. */
export class NoDeck extends Error {}

/** A preference change made from an older view: its `replaces` isn't the newest file (P16 section 2). The server says 409. */
export class StalePreferences extends Error {}

/**
 * What was asked needs git or the record, and this store runs over storage alone, as the relay's does (B-0ag7h): setting
 * up, the record, the vault, a document's path in the repo. Nothing is written when it's raised.
 */
export class NeedsRepo extends Error {
  constructor(what: string) {
    super(`${what} needs the repository and its record, and this store has neither: it runs over the live layer's storage alone`);
  }
}

/**
 * Where a store's pinned keys come from (D142): undefined reads CI's settings (`BAESIAN_TRUST`, `BAESIAN_TRUST_FILE`) the
 * first time they're needed; `null` means none are pinned; a root means these.
 */
export interface StoreTrust {
  pinned?: TrustRoot | null;
}

/**
 * Why an unsigned answer from before a repo was linked can't be checked (B-45xz8): in a shallow clone, the commit that
 * linked the repo may be beyond its history.
 */
export const SHALLOW_HISTORY =
  "it isn't signed, and whether it was in the record when the repo was linked can't be told in a shallow clone (B-45xz8): fetch the full history (in CI, fetch-depth: 0)";

/**
 * What was in the record at the commit that linked the repo (B-45xz8): its files' blob IDs by their path in the layer, or
 * why that can't be told. Before the link is committed, the record at the commit being checked stands in for it.
 */
type BeforeLinking = { commit: string; blobs: Map<string, string>; objectFormat: string } | { problem: string };

/** The record at the first commit in `rev`'s history whose config names `project` (B-45xz8), or at `rev` before there is one. */
function recordAtLinking(top: string, rev: string, project: string): BeforeLinking | undefined {
  const config = `${RECORD_DIR}/config.json`;
  let changed: string[];
  try {
    changed = git(top, ["log", "--full-history", "--reverse", "--format=%H", rev, "--", config]).split("\n").filter(Boolean);
  } catch {
    return undefined; // no commits yet
  }
  const names = (commit: string) => {
    try {
      return (JSON.parse(git(top, ["show", `${commit}:${config}`])) as { project?: unknown }).project === project;
    } catch {
      return false;
    }
  };
  let commit = changed.find(names);
  if (commit === undefined) {
    try {
      commit = git(top, ["rev-parse", "--verify", "-q", `${rev}^{commit}`]);
    } catch {
      return undefined;
    }
  } else {
    // A shallow clone's oldest commits seem to add every file: the real link may be further back.
    let shallow: string[] = [];
    try {
      shallow = readFileSync(git(top, ["rev-parse", "--path-format=absolute", "--git-path", "shallow"]), "utf8").split("\n");
    } catch {
      // not shallow
    }
    if (shallow.includes(commit)) return { problem: SHALLOW_HISTORY };
  }
  const blobs = new Map<string, string>();
  for (const entry of git(top, ["ls-tree", "-r", "-z", commit, "--", RECORD_DIR]).split("\0")) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(entry);
    if (m && m[2]!.startsWith(`${RECORD_DIR}/`)) blobs.set(m[2]!.slice(RECORD_DIR.length + 1), m[1]!);
  }
  let objectFormat = "sha1";
  try {
    objectFormat = git(top, ["rev-parse", "--show-object-format"]) || "sha1";
  } catch {
    // an older git: SHA-1
  }
  return { commit, blobs, objectFormat };
}

/** A store over storage alone, with no repo and no record (B-0ag7h): what it takes in their place. */
export interface StorageOptions {
  /** The branch it files on, for the cards and decks it writes and the inbox it reads. */
  branch: string;
  /** The repo's `.baesian/config.json`, which a store with no record can't read: its `project`, in a hosted repo. */
  config?: Config;
  /** The keys it pins. It never reads CI's settings: none are pinned unless given. */
  trust?: StoreTrust;
  /**
   * The answers a machine uploaded as from before linking (B-3zjjx), by path. A store with no repo can't find the record
   * at the linking commit, so it counts these as B-45xz8 counts that record's on a machine. The relay takes them only
   * before the project's first answer on the website, and keeps them unsigned.
   */
  beforeLinking?: ReadonlySet<string>;
}

/** On your machine: the repo, the live layer's folder, and the worktree's record. */
interface Local {
  repo: Repo;
  live: string;
  record: string;
}

function now(): string {
  return new Date().toISOString();
}

const encoder = new TextEncoder();
const encode = (text: string): Uint8Array => encoder.encode(text);
/** A file's bytes as a Buffer, without copying them: signatures and digests read them this way. */
const asBuffer = (bytes: Uint8Array): Buffer => (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
const decode = (bytes: Uint8Array): string => asBuffer(bytes).toString("utf8");

/** With no git to search, no commit is found by its trailers, and none is said to be rewritten. */
const NO_HISTORY: History = { citing: new Map(), onBranch: () => true };

/** Compare decisions loosely: case and spacing don't make two answers different. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function parse<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(`${what} is not valid:\n${describeError(result.error)}`);
  return result.data;
}

/**
 * A file read from disk, in the newest format of its kind (D156): upgraded in memory, then checked by its schema. One in a
 * newer format than this Baesian reads throws `NewerFormat` (D157); a view that reports problems reports it instead.
 */
function readAs<T extends z.ZodType>(kind: FileKindName, schema: T, fields: unknown, what: string): z.infer<T> {
  return parse(schema, upgradeFile(kind, fields, what), what);
}

export class Store {
  /** A read-only store over one directory, e.g. a commit's record in CI (M3b). */
  readonly readOnly: boolean;

  private constructor(
    /** The live layer (B-0ag7h): a folder on your machine, the relay's table, or memory. */
    readonly storage: Storage,
    private readonly local: Local | undefined,
    private readonly options: { branch?: string; config?: Config; trust: StoreTrust; readOnly: boolean; commit?: string; beforeLinking?: ReadonlySet<string> },
  ) {
    this.readOnly = options.readOnly;
  }

  static open(cwd?: string, trust?: StoreTrust): Store {
    const repo = openRepo(cwd);
    const live = join(repo.commonDir, LIVE_DIR);
    return new Store(new FolderStorage(live), { repo, live, record: join(repo.toplevel, RECORD_DIR) }, { trust: trust ?? {}, readOnly: false });
  }

  /**
   * Read a record as if it were the live layer. This is how CI sees cards and verdicts: it has no
   * live layer, only what was committed (D34). `commit` is the one whose record it is, whose history holds the commit
   * that linked the repo (B-45xz8); by default, HEAD.
   */
  static overRecord(repo: Repo, dir: string, trust?: StoreTrust, commit?: string): Store {
    return new Store(new FolderStorage(dir), { repo, live: dir, record: dir }, { trust: trust ?? {}, readOnly: true, ...(commit ? { commit } : {}) });
  }

  /**
   * A store over the live layer's storage alone (B-0ag7h), as the relay runs it: no repo, no record, no git. It files,
   * answers and checks as any store does; what needs git or the record throws `NeedsRepo`, and nothing touches a disk.
   */
  static over(storage: Storage, options: StorageOptions): Store {
    return new Store(storage, undefined, { branch: options.branch, config: options.config, trust: { pinned: options.trust?.pinned ?? null }, readOnly: false, ...(options.beforeLinking ? { beforeLinking: options.beforeLinking } : {}) });
  }

  // ---------------------------------------------------------------- layers

  /** The repo, the live layer's folder and the record, or `NeedsRepo` for a store over storage alone. */
  private need(what: string): Local {
    if (!this.local) throw new NeedsRepo(what);
    return this.local;
  }

  /** The git repository. A store over storage alone has none (`NeedsRepo`). */
  get repo(): Repo {
    return this.need("the repository").repo;
  }

  /** The live layer's folder, on your machine; a store over storage alone has none (`NeedsRepo`). */
  get live(): string {
    return this.need("the live layer's folder").live;
  }

  /** The worktree's record, `.baesian/`, or the directory a read-only store reads. */
  get record(): string {
    return this.need("the record").record;
  }

  /** Whether this store has a repo and a record, as it does on your machine; the relay's has neither (B-0ag7h). */
  get hasRepo(): boolean {
    return this.local !== undefined;
  }

  /** The branch it files on: the checked-out one, or the one a store over storage alone was given. */
  private get branch(): string {
    return this.local ? this.local.repo.branch : this.options.branch!;
  }

  /**
   * Set up means the shared live layer exists. A worktree's record is created on first write: a new
   * worktree has no `.baesian/` until the branch it came from committed one. A store over storage alone is set up.
   */
  isInitialised(): boolean {
    return this.local ? existsSync(this.local.live) : true;
  }

  /** Create both layers. Safe to run again. Returns the paths it created. */
  init(config: Config = {}): string[] {
    const { live, record } = this.need("setting up (`baesian init`)");
    const created: string[] = [];
    for (const kind of KINDS) {
      const dir = join(live, kind);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        created.push(dir);
      }
    }
    const configPath = join(record, "config.json");
    if (!existsSync(configPath)) {
      mkdirSync(record, { recursive: true });
      writeFileSync(configPath, `${JSON.stringify(parse(Config, { ...config, format: newestFormat("config") }, "config"), null, 2)}\n`);
      created.push(configPath);
    }
    return created;
  }

  /** The repo's config, from the record; for a store over storage alone, the one it was given. */
  config(): Config {
    if (!this.local) return this.options.config ?? {};
    const path = join(this.local.record, "config.json");
    return existsSync(path) ? readAs("config", Config, JSON.parse(readFileSync(path, "utf8")), "config.json") : {};
  }

  /**
   * Record the vault in this worktree's config (M6), keeping its other keys: `init` writes a config only once, so
   * `init --vault` in a repo already set up comes here. Returns whether it changed anything.
   */
  setVault(vault: string): boolean {
    const { record } = this.need("recording the vault");
    if (this.readOnly) throw new Error("this store is a read-only view of a committed record");
    const { vault: was, ...rest } = this.config();
    if (was === vault) return false;
    mkdirSync(record, { recursive: true });
    writeFileSync(join(record, "config.json"), `${JSON.stringify(parse(Config, { ...rest, format: newestFormat("config"), vault }, "config"), null, 2)}\n`);
    return true;
  }

  /**
   * Link the repo to a project on the hosted service (M9d, B-5gnea): the service, the project and the repo's first commit,
   * in this worktree's config, keeping its other keys. A gate fact when committed (B-w4g6c).
   */
  setLink(link: { service: string; project: string; first_commit: string }): void {
    const { record } = this.need("linking the repo");
    if (this.readOnly) throw new Error("this store is a read-only view of a committed record");
    const { service: _s, project: _p, first_commit: _f, ...rest } = this.config();
    mkdirSync(record, { recursive: true });
    writeFileSync(join(record, "config.json"), `${JSON.stringify(parse(Config, { ...rest, format: newestFormat("config"), ...link }, "config"), null, 2)}\n`);
  }

  /** Throws `NotSetUp` unless the live layer exists. */
  requireInit(): void {
    if (!this.isInitialised()) throw new NotSetUp();
  }

  /** Write a file that must never change (D34), through the storage's `create`: it fails if the file exists. */
  private writeOnce(rel: string, text: string): void {
    if (this.readOnly) throw new Error("this store is a read-only view of a committed record");
    this.storage.create(rel, encode(text));
  }

  /**
   * Copy a live file into this worktree's record, unless it's already there (D37). A store with no record has nowhere
   * to copy it: the record is your machine's, and it pulls what the relay holds (P15).
   */
  private toRecord(rel: string): boolean {
    if (!this.local) return false;
    const target = join(this.local.record, ...rel.split("/"));
    if (existsSync(target)) return false;
    const bytes = this.storage.read(rel);
    if (!bytes) throw new Error(`${rel} isn't in the live layer, so it can't be copied into the record`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return true;
  }

  /** A folder's names, sorted. In a view, each folder is listed once. */
  private list(dir: string): string[] {
    const cached = this.session?.lists.get(dir);
    if (cached) return cached;
    const names = this.storage.list(dir).sort();
    this.session?.lists.set(dir, names);
    return names;
  }

  /** A card ID no card has yet (D51). */
  private freeCardId(): string {
    return newId("B", (candidate) => this.storage.list(`cards/${candidate}`).length > 0);
  }

  /** One consistent read of the live layer, while `view` runs. */
  private session?: {
    files: Map<string, unknown>;
    lists: Map<string, string[]>;
    /** Built once per view, since every card's status asks: all the cards, verdict files by card, and claimants. */
    cards?: Card[];
    verdictFiles?: Map<string, string[]>;
    claims?: Map<string, Card[]>;
    /** The history's trailers (B-9v5xj), searched once per view. */
    history?: History;
    /** In a hosted repo (M9a): the keys, each signed file's judgement, and the preference files' in order. */
    hosted?: { value: Hosted | undefined };
    judged?: Map<string, Judgement>;
    preferences?: Map<string, Judgement>;
    report: ((path: string, error: string) => void) | undefined;
  };

  /**
   * Run `fn` over one consistent view of the live layer: each file is read once. With `report`, a file that can't be
   * read (half-written, or invalid) is reported and skipped instead of thrown; the server reads that way (D84).
   * Without it, a bad file still throws, so the CLI stays loud: commands that read every card read through a view,
   * since a card's status reads the others, and reading them afresh each time made a listing quadratic.
   */
  view<T>(fn: () => T, report?: (path: string, error: string) => void): T {
    const outer = this.session;
    if (outer && !report) return fn(); // already inside one: share it
    this.session = { files: new Map(), lists: new Map(), report };
    try {
      return fn();
    } finally {
      this.session = outer;
    }
  }

  /**
   * Read and parse one live file, or undefined if there's none: a file that can't be parsed throws, unless a view is
   * reporting problems instead.
   */
  private read<T>(rel: string, parseText: (text: string) => T): T | undefined {
    if (this.session?.files.has(rel)) return this.session.files.get(rel) as T | undefined;
    let value: T | undefined;
    try {
      const bytes = this.storage.read(rel);
      value = bytes === undefined ? undefined : parseText(decode(bytes));
    } catch (e) {
      if (!this.session?.report) throw e;
      this.session.report(rel, e instanceof Error ? e.message : String(e));
    }
    this.session?.files.set(rel, value);
    return value;
  }

  /** A file's bytes as written, from the layer: a signature covers these, never the parsed fields (P15). */
  bytes(rel: string): Buffer {
    const bytes = this.storage.read(rel);
    if (!bytes) throw Object.assign(new Error(`${rel} isn't in the live layer`), { code: "ENOENT" });
    return asBuffer(bytes);
  }

  /** A file's text, read afresh, or undefined if there's none. */
  private text(rel: string): string | undefined {
    const bytes = this.storage.read(rel);
    return bytes && decode(bytes);
  }

  // ---------------------------------------------------------------- the hosted service's proof (M9a: D138, D139, D142, D158–D160, D163)

  /** CI's pinned keys, read once: from the options, or from CI's settings. A pin that can't be read throws (`BadTrust`). */
  private pinnedRoot(): TrustRoot | undefined {
    if (this.pinCache) return this.pinCache.value;
    const value = this.options.trust.pinned !== undefined ? (this.options.trust.pinned ?? undefined) : pinnedTrust();
    this.pinCache = { value };
    return value;
  }
  private pinCache?: { value: TrustRoot | undefined };

  /** The trust files in this layer, `trust/`: the record's copy of the keys (P16 section 7). */
  trustFiles(): TrustFiles {
    const out: TrustFiles = { service: [], revoked: [], passkeys: [] };
    for (const f of this.list("trust").filter((n) => n.endsWith(".json"))) {
      const rel = `trust/${f}`;
      const t = this.read(rel, (text) => readTrustFile(JSON.parse(text), rel));
      if (!t) continue;
      if (t.type === "service-key") out.service.push({ file: rel, key: t });
      else if (t.type === "service-key-revocation") out.revoked.push({ file: rel, key: t });
      else out.passkeys.push({ file: rel, key: t });
    }
    return out;
  }

  /**
   * Whether this is a hosted repo, and the keys its answers are checked with (D138): CI's pinned keys whenever it pins
   * any (D142, D159), or else the service's keys in this layer, when it has any. The layer's passkey keys count only with
   * the service's signature; revocations count wherever they are, since they only take trust away. Undefined outside a
   * hosted repo, where nothing here changes anything.
   */
  hosted(): Hosted | undefined {
    if (this.session?.hosted) return this.session.hosted.value;
    const pinned = this.pinnedRoot();
    const files = this.trustFiles();
    const revoked = [...(pinned?.revoked ?? []), ...files.revoked.map((r) => r.key)];
    const project = this.config().project;
    let value: Hosted | undefined;
    if (pinned) value = { pinned: true, root: { service: pinned.service, passkeys: pinned.passkeys, revoked }, project };
    else if (files.service.length) {
      const base = { service: files.service.map((s) => s.key), revoked };
      const passkeys = files.passkeys.filter((p) => this.signedBy(p.file, p.key.enrolled, base).ok).map((p) => p.key);
      value = { pinned: false, root: { ...base, passkeys }, project };
    }
    if (this.session) this.session.hosted = { value };
    return value;
  }

  /** Whether a file has its signature, by a key in `root` that was valid at `at` (D160). */
  private signedBy(rel: string, at: string, root: Pick<TrustRoot, "service" | "revoked">): Judgement & { key?: ServiceKey } {
    const sig = this.text(`${rel}.sig`);
    if (sig === undefined) return doesnt("it has no signature, so the service didn't write it (D138)");
    const r = checkSigned(root, this.bytes(rel), sig, at, rel);
    return "problem" in r ? doesnt(r.problem) : { ok: true, key: r.key };
  }

  /**
   * The record at the commit that linked the repo (B-45xz8), found once: in this store's commit's history (HEAD's on your
   * machine), the first whose config names the project. A store with no repo, as the relay's, has none.
   */
  private linking(): BeforeLinking | undefined {
    if (this.linkCache) return this.linkCache.value;
    const project = this.config().project;
    const value = this.local && project ? recordAtLinking(this.local.repo.toplevel, this.options.commit ?? "HEAD", project) : undefined;
    this.linkCache = { value };
    return value;
  }
  private linkCache?: { value: BeforeLinking | undefined };

  /**
   * An unsigned file a person wrote counts as it is when it was in the record, with these bytes, at the commit that linked
   * the repo (B-45xz8): answers from before linking were trusted then (D62). Anything added later needs the service's
   * signature. Undefined when that isn't so, or the file is signed; a judgement that it can't be told, in a shallow clone.
   */
  private fromBeforeLinking(rel: string): Judgement | undefined {
    if (this.storage.read(`${rel}.sig`) !== undefined) return undefined;
    // The relay's store, with no repo: what a machine uploaded as from before linking, while it still could (B-3zjjx).
    if (!this.local) return this.options.beforeLinking?.has(rel) ? COUNTS : undefined;
    const b = this.linking();
    if (!b) return undefined;
    if ("problem" in b) return doesnt(b.problem);
    const blob = b.blobs.get(rel);
    if (!blob) return undefined;
    const bytes = this.storage.read(rel);
    if (!bytes) return undefined;
    const id = createHash(b.objectFormat === "sha256" ? "sha256" : "sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
    return id === blob ? COUNTS : undefined;
  }

  /**
   * The files a person wrote that count here as from before linking (B-45xz8): unsigned, and in the record at the commit
   * that linked the repo, with these bytes. At first link the CLI uploads them (B-3zjjx): rules, then their retirements,
   * topic merges, answers and preference files, each folder in name order.
   */
  answersFromBeforeLinking(): string[] {
    const rules = this.list("rules").filter((f) => RULE_FILE.test(f));
    return [
      ...rules.filter((f) => f.endsWith(".md")).map((f) => `rules/${f}`),
      ...rules.filter((f) => f.endsWith("-retired.json")).map((f) => `rules/${f}`),
      ...this.list("topics").filter((f) => f.startsWith("alias-") && f.endsWith(".json")).map((f) => `topics/${f}`),
      ...this.list("verdicts").filter((f) => verdictFileCard(f)).map((f) => `verdicts/${f}`),
      ...this.list("preferences").filter((f) => PREFERENCE_FILE.test(f)).map((f) => `preferences/${f}`),
    ].filter((rel) => this.fromBeforeLinking(rel)?.ok === true);
  }

  /**
   * Whether a resolved card was decided before the repo was linked (B-3zjjx): the answer its status rests on counts as one
   * from before linking, not by the service's signature. The website says so beside it.
   */
  decidedBeforeLinking(id: string): boolean {
    const card = this.card(id);
    if (!card || this.status(id) !== "resolved") return false;
    const last = this.latestVerdict(card);
    if (!last) return false;
    const prefix = `${compactAt(last.at)}-${id}-r${last.revision}-`;
    return this.verdictFilesOf(id).some((f) => f.startsWith(prefix) && this.fromBeforeLinking(`verdicts/${f}`)?.ok === true);
  }

  /**
   * Whether a file a person writes counts (D138): in a hosted repo, only with the service's signature, and for an answer
   * on a hard card (D139) or a preference change that lets more cards past you (D163), with a passkey proof that checks
   * against a trusted passkey key for the file's account. Outside a hosted repo, everything counts, as before. Files are
   * written once, so a judgement holds for a view.
   */
  judge(rel: string): Judgement {
    const h = this.hosted();
    if (!h) return COUNTS;
    const cached = this.session?.judged?.get(rel);
    if (cached) return cached;
    let j: Judgement;
    try {
      j = this.judgeAfresh(rel, h);
    } catch (e) {
      if (e instanceof NewerFormat) throw e;
      j = doesnt(`it can't be read (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
    }
    if (this.session) (this.session.judged ??= new Map()).set(rel, j);
    return j;
  }

  /**
   * A signature covers a file's bytes, not its name, so each kind counts only where its bytes say it belongs: a copy of a
   * signed answer under another card's name, or a relay's record in another card's folder, would otherwise count there.
   */
  private judgeAfresh(rel: string, h: Hosted): Judgement {
    const [dir, a, b] = rel.split("/");
    if (dir === "preferences") return this.preferenceJudgements(h).get(a!) ?? doesnt("it isn't a preference file");
    // What a person wrote before the repo was linked counts as it is (B-45xz8); the relay's gate records are never from then.
    if (dir !== "cards") {
      const before = this.fromBeforeLinking(rel);
      if (before) return before;
    }
    let claim: Claim;
    const elsewhere = (says: string) => doesnt(`its name or folder doesn't match what it says (${says}), so it was copied or renamed`);
    if (dir === "verdicts" && a && verdictFileCard(a)) {
      const v = this.verdictFile(a);
      if (!v) return doesnt("it can't be read");
      if (!a.startsWith(`${compactAt(v.at)}-${v.card}-r${v.revision}-`)) return elsewhere(`${v.card} r${v.revision}, at ${v.at}`);
      const hard = this.levelOf(v.card, v.revision) === "hard";
      claim = {
        at: v.at,
        account: v.account,
        project: v.project,
        answers: { card: v.card, revision: v.revision, digest: v.card_digest },
        proof: hard ? `it answers ${v.card}, a hard card, so it takes the reviewer's passkey (D139)` : undefined,
      };
    } else if (dir === "rules" && a?.endsWith("-retired.json")) {
      const r = this.retirementFile(a);
      if (!r) return doesnt("it can't be read");
      if (a !== `${r.rule}-retired.json`) return elsewhere(`it retires ${r.rule}`);
      claim = { at: r.at, account: r.account, project: r.project };
    } else if (dir === "rules" && a?.endsWith(".md")) {
      const r = this.ruleFile(a)?.meta;
      if (!r) return doesnt("it can't be read");
      if (a !== `${r.id}.md`) return elsewhere(`it's ${r.id}`);
      claim = { at: r.created, account: r.account, project: r.project };
    } else if (dir === "topics" && a?.endsWith(".json")) {
      const t = this.read(rel, (x) => readAs("topic-alias", TopicAlias, JSON.parse(x), rel));
      if (!t) return doesnt("it can't be read");
      claim = { at: t.at, account: t.account, project: t.project };
    } else if (dir === "cards" && b && RELAY_GATE.test(b)) {
      const g = this.read(rel, (t) => readAs("gate", GateRecord, JSON.parse(t), rel));
      if (!g) return doesnt("it can't be read");
      if (g.by !== "relay") return doesnt("it's named for the relay, but says it ran elsewhere");
      if (g.card !== a || b !== `gate-r${g.revision}-relay.json`) return elsewhere(`it gated ${g.card} r${g.revision}`);
      claim = { at: g.at, project: g.project };
    } else {
      return doesnt("it isn't a kind of file a person writes");
    }
    return this.signedClaim(rel, claim, h);
  }

  /**
   * The checks every signed file takes (P16 section 7): the signature; the project, since one key signs every project's
   * files (B-tf9fc); for an answer, the card's text it answered (B-f571v); and the passkey proof when one is needed.
   */
  private signedClaim(rel: string, claim: Claim, h: Hosted): Judgement {
    const signed = this.signedBy(rel, claim.at, h.root);
    if (!signed.ok) return signed;
    if (claim.project !== h.project) {
      if (!claim.project) return doesnt("it names no project, so it could be another repo's (B-tf9fc)");
      return doesnt(h.project ? `it's for project ${claim.project}, not this repo's (${h.project}), so it was copied from another repo` : `it's for project ${claim.project}, and .baesian/config.json names no project`);
    }
    if (claim.answers) {
      const { card, revision, digest } = claim.answers;
      if (!digest) return doesnt("it doesn't name the digest of the card it answers, so what was answered can't be checked (B-f571v)");
      const cardRel = `cards/${card}/r${revision}.md`;
      const answered = this.storage.read(cardRel);
      if (!answered) return doesnt(`${card} r${revision} isn't here, so what was answered can't be checked`);
      if (createHash("sha256").update(answered).digest("hex") !== digest) return doesnt(`${card} r${revision} has changed since it was answered: it isn't the text the answer names (B-f571v)`);
    }
    if (!claim.proof) return COUNTS;
    const proofRel = proofPath(rel);
    const proofText = this.text(proofRel);
    if (proofText === undefined) return doesnt(`${claim.proof}, and has no passkey proof`);
    let proof: PasskeyProof;
    try {
      proof = readAs("passkey-proof", PasskeyProof, JSON.parse(proofText), proofRel);
    } catch (e) {
      if (e instanceof NewerFormat) throw e;
      return doesnt(`its passkey proof can't be read (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
    }
    if (proof.file !== rel.slice(rel.lastIndexOf("/") + 1)) return doesnt(`its passkey proof is for ${proof.file}`);
    if (!claim.account) return doesnt(`${claim.proof}, but names no account to check its passkey against`);
    const key = h.root.passkeys.find((k) => k.account === claim.account && k.credential === proof.credential);
    if (!key) return doesnt(`${claim.proof}, and its proof was made with a passkey that isn't trusted for account ${claim.account} (D159)`);
    const why = proofProblem(proof, this.bytes(rel), key, signed.key!);
    return why ? doesnt(`its passkey proof doesn't check: ${why}`) : COUNTS;
  }

  /**
   * The preference files' judgements, oldest first (D163): each is compared with the newest one before it that counts, or
   * with "Today" in shadow, so a change that loosens takes the passkey whatever file it says it replaces.
   */
  private preferenceJudgements(h: Hosted): Map<string, Judgement> {
    if (this.session?.preferences) return this.session.preferences;
    const out = new Map<string, Judgement>();
    let before: Settings = TODAY;
    for (const name of this.list("preferences").filter((f) => PREFERENCE_FILE.test(f))) {
      let file: Preferences | undefined;
      try {
        file = this.preferenceRaw(name);
      } catch (e) {
        if (e instanceof NewerFormat) throw e;
        out.set(name, doesnt(`it can't be read (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`));
        continue;
      }
      if (!file) {
        out.set(name, doesnt("it can't be read"));
        continue;
      }
      // Named for its own time, which its signature covers: an old change copied under a newer name can't come back in force.
      if (!name.startsWith(`${compactAt(file.at)}-`)) {
        out.set(name, doesnt(`its name doesn't match its time (${file.at}), so it was copied or renamed`));
        continue;
      }
      const loose = loosening(before, settingsOf(file));
      const j = this.fromBeforeLinking(`preferences/${name}`) ?? this.signedClaim(`preferences/${name}`, { at: file.at, account: file.account, project: file.project, proof: loose.length ? `it lets more cards past you (${loose.join("; ")}), so it takes your passkey (D163)` : undefined }, h);
      out.set(name, j);
      if (j.ok) before = settingsOf(file);
    }
    if (this.session) this.session.preferences = out;
    return out;
  }

  /**
   * The level in force on a card revision (P16 section 3): the card's own, set by the CLI's gate at filing, and in a hosted
   * repo raised by the relay's signed gate record, if that shows it higher. The latest revision's, unless one is named.
   */
  levelOf(id: string, revision?: number): Level | undefined {
    const revs = this.revisions(id);
    const card = revision === undefined ? revs.at(-1) : revs.find((r) => r.meta.revision === revision);
    if (!card) return undefined;
    if (!this.hosted()) return card.meta.level;
    const relay = this.gateRecordBy(id, card.meta.revision, "relay");
    return relay?.outcome === "shown" && relay.level ? higherLevel(card.meta.level, relay.level) : card.meta.level;
  }

  /**
   * In a hosted repo, the files a person writes that don't count (D138), and why: for `baesian verify`'s notes, since a
   * file that doesn't count is ignored, not an error. Passkey keys the service didn't sign are among them.
   */
  uncounted(): { file: string; why: string }[] {
    const h = this.hosted();
    if (!h) return [];
    const rels = [
      ...this.list("verdicts").filter((f) => verdictFileCard(f)).map((f) => `verdicts/${f}`),
      ...this.list("rules").filter((f) => RULE_FILE.test(f)).map((f) => `rules/${f}`),
      ...this.list("topics").filter((f) => f.startsWith("alias-") && f.endsWith(".json")).map((f) => `topics/${f}`),
      ...this.list("preferences").filter((f) => PREFERENCE_FILE.test(f)).map((f) => `preferences/${f}`),
      ...this.cardIds().flatMap((id) => this.list(`cards/${id}`).filter((f) => RELAY_GATE.test(f)).map((f) => `cards/${id}/${f}`)),
    ];
    const out = rels.flatMap((file) => {
      const j = this.judge(file);
      return j.ok ? [] : [{ file, why: j.why }];
    });
    if (!h.pinned) {
      for (const p of this.trustFiles().passkeys) {
        const j = this.signedBy(p.file, p.key.enrolled, h.root);
        if (!j.ok) out.push({ file: p.file, why: j.why });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- cards

  cardIds(): string[] {
    return this.list("cards");
  }

  revisions(id: string): Card[] {
    return this.list(`cards/${id}`)
      .filter((f) => /^r\d+\.md$/.test(f))
      .flatMap((f) => this.read(`cards/${id}/${f}`, (text) => {
        const { meta, body } = parseDoc(text);
        return { meta: readAs("card", CardMeta, meta, `cards/${id}/${f}`), body };
      }) ?? [])
      .sort((a, b) => a.meta.revision - b.meta.revision);
  }

  card(id: string): Card | undefined {
    return this.revisions(id).at(-1);
  }

  cards(): Card[] {
    // In a view, the list is built once: a card's status reads every other card, so a listing asks for it per card.
    if (this.session?.cards) return this.session.cards;
    const all = this.cardIds()
      .map((id) => this.card(id))
      .filter((c): c is Card => c !== undefined);
    if (this.session) this.session.cards = all;
    return all;
  }

  /**
   * Validate and normalise a draft, without writing anything. The body is optional context (D92): the
   * strongest alternative is a field now, and the filing rules check it (D12, D77).
   */
  private prepare(draft: unknown, body = "", agentDraft = false): { draft: CardDraft; nearTopics: string[]; warnings: string[] } {
    const parsed = readAs("card-draft", CardDraft, draft, "the card");
    const problems = [...filingProblems(parsed), ...this.unknownRefs(parsed)];
    if (problems.length) throw new ValidationError(`the card can't be filed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    let near: string[] = [];
    let topic = parsed.topic;
    if (topic) {
      topic = this.canonicalTopic(topic);
      const known = this.topics();
      if (!known.has(topic)) near = nearTopics(topic, known);
    }
    // In a hosted repo a card goes to the service as it's filed, and its first version can't be taken back: a draft an agent
    // files or revises that looks like it holds a secret is refused, before anything is written, unless it says why it's
    // filed anyway (B-jfkv9). Elsewhere, and for the cards Baesian drafts itself, it's a warning (D136).
    if (agentDraft && this.config().project !== undefined && !parsed.secret_reason) {
      const secrets = secretsIn(parsed, body);
      if (secrets.size) throw new LooksLikeSecret(secrets);
    }
    // The draft's `level` is what the agent asks for; the gate sets the level the card is written with (D144, D145).
    return { draft: { ...parsed, topic }, nearTopics: near, warnings: filingWarnings(parsed, body) };
  }

  // ---------------------------------------------------------------- the gate at filing (D144–D148)

  /**
   * Run the gate over a card revision about to be written (D145): the rules over its stated facts, its `reverse` and the
   * level it asks for, under the preferences in force. Returns its record and the level the card is written with. It
   * fails toward the reviewer: if it can't run, the card is shown at the level asked for, or provisional, and never a
   * card with a hard-by-default fact below hard (D144, D146).
   */
  private runGate(id: string, revision: number, draft: CardDraft, source: GateSource): { record: GateRecord; level: Level; warnings: string[] } {
    const asked = draft.level;
    const force = this.inForce();
    const warnings = force.problem ? [`${force.problem}: the gate used "Today", in shadow, which shows every card`] : [];
    const base = {
      type: "gate",
      format: newestFormat("gate"),
      card: id,
      revision,
      by: "cli",
      gate: GATE_VERSION,
      mode: force.settings.mode,
      ...(force.name && force.file ? { preferences: force.name } : {}),
      ...(draft.touches.length ? { touches: draft.touches } : {}),
      reverse: draft.reverse,
      ...(asked ? { asked } : {}),
      source,
      at: now(),
    };
    try {
      const decision = route({ touches: draft.touches, reverse: draft.reverse, asked, source, draw: drawOf(id, revision), heldBefore: (row) => this.heldBefore(row) }, force.settings);
      const record = parse(GateRecord, { ...base, ...decision }, "the gate record");
      return { record, level: levelInForce(decision, force.settings.mode, asked), warnings };
    } catch (e) {
      const floor: Level = draft.touches.some((f) => HARD_BY_DEFAULT.has(f)) ? "hard" : "provisional";
      const level: Level = asked === "hard" || floor === "hard" ? "hard" : (asked ?? "provisional");
      const { row, position } = rowOf(draft.touches, TODAY);
      const record = parse(GateRecord, { ...base, row, position, outcome: "shown", level, reason: "error" }, "the gate record");
      return { record, level, warnings: [...warnings, `the gate failed (${e instanceof Error ? e.message : String(e)}), so the card is shown`] };
    }
  }

  /**
   * How many held cards a row has had, enforcing, as one writer's gate records say, the CLI's or the relay's: the burn-in
   * counts them (B-fgc4y).
   */
  private heldBefore(row: AnyRow, by: GateRecord["by"] = "cli"): number {
    let n = 0;
    for (const id of this.cardIds()) {
      for (const g of this.gateRecords(id)) if (g.by === by && g.mode === "enforce" && g.outcome === "held" && g.row === row) n++;
    }
    return n;
  }

  /**
   * What a card revision is to the gate, as filing it decided (P16 section 3), worked out from the files alone for the
   * relay, which receives revisions rather than files them: Baesian's own card; a revision that follows the reviewer's
   * own answer, or the agent's one reply; or else the agent's.
   */
  private gateSourceOf(card: Card, previous: Card | undefined): GateSource {
    if (!previous) return isOwnCard(card.meta) ? "baesian" : "agent";
    if (card.meta.reply !== undefined && previous.meta.reply === undefined) return "answer";
    const own = this.latestVerdict(previous);
    return this.parentReturns(previous).length === 0 && own !== undefined && RETURNS.has(own.response) ? "answer" : "agent";
  }

  /**
   * The relay's gate record for a card revision it accepts (D158), as the service writes it (`test/service.ts`'s
   * `TestService.gate()`): the rules over the revision's facts, under the preferences in force, with the draw the service
   * took from its own signature over the card (`draw_proof`, kept on a held card), the burn-in counted on the relay's
   * records, and the project it was gated in (B-tf9fc). Written once, beside the CLI's, at
   * `cards/<id>/gate-r<n>-relay.json`; the relay's storage signs it. The store never signs: it's given the draw.
   */
  relayGate(id: string, revision: number, drawn: { draw: number; draw_proof: string }, project: string): GateRecord {
    this.requireInit();
    const revs = this.revisions(id);
    const card = revs.find((r) => r.meta.revision === revision);
    if (!card) throw new NoCard(`${id} r${revision}`);
    const m = card.meta;
    const source = this.gateSourceOf(card, revs.find((r) => r.meta.revision === revision - 1));
    const force = this.inForce();
    const decision = route({ touches: m.touches, reverse: m.reverse, source, draw: drawn.draw, heldBefore: (row) => this.heldBefore(row, "relay") }, force.settings);
    // Built in the stand-in's order, and checked by the schema, but written as built: the bytes are what's signed.
    const record = {
      type: "gate",
      format: newestFormat("gate"),
      card: id,
      revision,
      by: "relay",
      gate: GATE_VERSION,
      mode: force.settings.mode,
      ...(force.name ? { preferences: force.name } : {}),
      ...(m.touches.length ? { touches: m.touches } : {}),
      reverse: m.reverse,
      source,
      ...decision,
      ...(decision.outcome === "held" ? { draw_proof: drawn.draw_proof } : {}),
      project,
      at: now(),
    };
    const parsed = parse(GateRecord, record, "the relay's gate record");
    this.writeOnce(`cards/${id}/gate-r${revision}-relay.json`, `${JSON.stringify(record, null, 2)}\n`);
    return parsed;
  }

  /** A card's gate records, every revision's and every writer's; in a hosted repo, the relay's only once signed (D158). */
  gateRecords(id: string): GateRecord[] {
    return this.list(`cards/${id}`)
      .filter((f) => /^gate-r\d+-(cli|relay)\.json$/.test(f) && (!RELAY_GATE.test(f) || this.judge(`cards/${id}/${f}`).ok))
      .flatMap((f) => this.read(`cards/${id}/${f}`, (t) => readAs("gate", GateRecord, JSON.parse(t), `cards/${id}/${f}`)) ?? []);
  }

  /**
   * The gate record that counts for a revision: the CLI's; in a hosted repo, only the relay's signed one (D158), so a card
   * the relay hasn't gated isn't held, and needs an answer before merge.
   */
  gateRecord(id: string, revision?: number): GateRecord | undefined {
    return this.gateRecordBy(id, revision, this.hosted() ? "relay" : "cli");
  }

  /** One writer's gate record for a revision: the CLI's, or the relay's, once signed (D158). */
  gateRecordBy(id: string, revision: number | undefined, by: GateRecord["by"]): GateRecord | undefined {
    const rev = revision ?? this.card(id)?.meta.revision;
    return this.gateRecords(id).find((g) => g.revision === rev && g.by === by);
  }

  /** The gate's facts that made a card hard above the level its agent asked for (D42, D144): for the message. */
  private hardBecause(draft: CardDraft, level: Level): string[] | undefined {
    if (level !== "hard" || draft.level === "hard") return undefined;
    const facts = draft.touches.filter((f) => HARD_BY_DEFAULT.has(f));
    return facts.length ? facts : undefined;
  }

  /** Write a revision the gate has seen, and its record beside it. */
  private writeGated(id: string, revision: number, draft: CardDraft & OwnFields, body: string, agent: string, source: GateSource): { card: Card; gate: GateRecord; hardBecause?: string[]; warnings: string[] } {
    const gate = this.view(() => this.runGate(id, revision, draft, source));
    const card = this.writeRevision(id, revision, { ...draft, level: gate.level }, body, agent);
    const rel = `cards/${id}/gate-r${revision}-cli.json`;
    this.writeOnce(rel, `${JSON.stringify(gate.record, null, 2)}\n`);
    this.toRecord(rel);
    const hard = this.hardBecause(draft, gate.level);
    return { card, gate: gate.record, ...(hard ? { hardBecause: hard } : {}), warnings: gate.warnings };
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
    // The checks read every card: once, in a view, which ends before anything is written.
    const { prep, matches } = this.view(() => {
      const prep = this.prepare(draft, body, true);
      return { prep, matches: opts.force ? [] : this.matches(prep.draft) };
    });
    if (matches.length > 0) throw new PossibleDuplicate(matches);
    const id = this.freeCardId();
    // Baesian's own cards always reach you; the store files them under its name (conflict cards, D35).
    const { warnings, ...gated } = this.writeGated(id, 1, prep.draft, body, opts.agent, opts.agent === BAESIAN ? "baesian" : "agent");
    return { ...gated, nearTopics: prep.nearTopics, warnings: [...prep.warnings, ...warnings] };
  }

  /**
   * File a card Baesian writes itself, with no model (D65): a convention card (D161) or a slider proposal (B-y6jn6), with
   * the fields only Baesian sets. Its deck is created when it's first used. The gate always shows it.
   */
  fileOwn(draft: Record<string, unknown> & OwnFields, body: string, deck: { id: string; title: string; brief: string }): Card {
    this.requireInit();
    if (!this.deck(deck.id)) {
      try {
        this.createDeck({ id: deck.id, title: deck.title }, deck.brief);
      } catch (e) {
        if (!alreadyExists(e)) throw e;
      }
    }
    const { convention, pref_row, pref_from, pref_to, ...rest } = draft;
    const prep = this.view(() => this.prepare({ ...rest, deck: deck.id }, body));
    const id = this.freeCardId();
    const own = { ...(convention ? { convention } : {}), ...(pref_row ? { pref_row, pref_from, pref_to } : {}) };
    return this.writeGated(id, 1, { ...prep.draft, ...own }, body, BAESIAN, "baesian").card;
  }

  /** File the next revision of a returned card: the agent's reply to a verdict. */
  reviseCard(id: string, draft: unknown, body: string, opts: { agent: string }): FileResult {
    this.requireInit();
    const latest = this.card(id);
    if (!latest) throw new NoCard(id);
    const status = this.status(id);
    if (status !== "returned") throw new NotAllowed(`${id} is ${status}; only a returned card takes a new revision`);
    const prep = this.prepare(draft, body, true);
    // A revision that follows your answer is shown; one returned because a parent went the other way (D80) is a new
    // decision, so it's gated as one (P16 section 3).
    const own = this.latestVerdict(latest);
    const source: GateSource = this.parentReturns(latest).length === 0 && own !== undefined && RETURNS.has(own.response) ? "answer" : "agent";
    const { warnings, ...gated } = this.writeGated(id, latest.meta.revision + 1, prep.draft, body, opts.agent, source);
    return { ...gated, nearTopics: prep.nearTopics, warnings: [...prep.warnings, ...warnings] };
  }

  /**
   * Whether the agent may still reply to this card (D89, D104): its latest answer went against the agent's pick
   * (the alternative, or the reviewer's own answer), and it hasn't had its one reply.
   */
  canReply(id: string): boolean {
    const card = this.card(id);
    // Nobody replies for Baesian: its conflict, convention and slider cards take none.
    if (!card || card.meta.source_agent === BAESIAN || this.revisions(id).some((r) => r.meta.reply !== undefined) || this.status(id) !== "resolved") return false;
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
    if (!latest) throw new NoCard(id);
    if (this.revisions(id).some((r) => r.meta.reply !== undefined)) throw new NotAllowed(`${id} has had its reply: an agent replies once to a card (D89)`);
    if (!this.canReply(id)) {
      throw new NotAllowed(`${id} is ${this.status(id)}; only a card answered against your pick (the alternative, or the reviewer's own answer) takes a reply`);
    }
    const text = reply.trim();
    if (!text) throw new ValidationError("the reply is empty: give the fact or the check, in a line");
    const { type: _t, format: _f, id: _i, revision: _r, source_agent: _a, source_branch: _b, created: _c, ...draft } = latest.meta;
    // A reply follows an answer, so the gate shows it, at least at the level the card had (P16 section 3).
    return this.writeGated(id, latest.meta.revision + 1, { ...draft, reply: text }, latest.body, opts.agent, "answer").card;
  }

  /** The cards that draft a rule from decision `id` (D110), whatever became of them, short of being withdrawn. */
  private ruleDrafts(id: string): Card[] {
    return this.cards().filter((c) => c.meta.rule !== undefined && c.meta.depends_on.includes(id) && this.status(c.meta.id) !== "withdrawn");
  }

  /**
   * Whether the reviewer asked for a rule from this decision (D16's toggle) and none has been drafted yet: the
   * latest verdict on its latest revision carries `make_rule` (D109), or accepts a convention card, whose yes is a
   * request for a rule (D161).
   */
  ruleAsked(id: string): boolean {
    const card = this.card(id);
    if (!card || !this.asksForRule(card)) return false;
    return this.ruleDrafts(id).length === 0;
  }

  private asksForRule(card: Card): boolean {
    const last = this.latestVerdict(card);
    return Boolean(last?.make_rule) || (card.meta.convention !== undefined && last?.response === "accept");
  }

  /**
   * Draft the rule the reviewer asked for (D109, D110): a card built from the decision, which asks them to make
   * `rule` a rule covering `covers`. Accepting it saves the rule. It builds on the decision, in the same topic and
   * deck, so it isn't a duplicate of it.
   */
  draftRule(id: string, rule: string, covers: string[], opts: { agent: string }): Card {
    this.requireInit();
    const from = this.card(id);
    if (!from) throw new NoCard(id);
    if (this.ruleDrafts(id).length) throw new NotAllowed(`a rule from ${id} is already drafted: it's one card per decision`);
    if (!this.asksForRule(from)) throw new NotAllowed(`the reviewer didn't ask for a rule from ${id}: only an answer marked "make this a rule" takes one (D109)`);
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
    const newCard = this.freeCardId();
    // A rule draft is Baesian's own card, filed by an agent: the gate always shows it.
    return this.writeGated(newCard, 1, { ...prep.draft, rule: text, rule_covers: covers }, "", opts.agent, "baesian").card;
  }

  /**
   * Save the rule a draft asked for, once the reviewer accepts it, or answers with their own wording (D110). Rules
   * are immutable, so it's saved once per decision.
   */
  private saveRule(card: Card, v: Verdict): void {
    if (card.meta.rule === undefined || (v.response !== "accept" && v.response !== "correction")) return;
    const from = card.meta.depends_on[0];
    if (from && this.rules().some((r) => r.meta.from_card === from)) return;
    const ruleId = newId("R", (candidate) => this.storage.read(`rules/${candidate}.md`) !== undefined);
    const meta = parse(
      RuleMeta,
      { type: "rule", format: newestFormat("rule"), id: ruleId, topic: this.canonicalTopic(card.meta.topic), covers: card.meta.rule_covers, ...(from ? { from_card: from } : {}), accepted_by: v.reviewer, ...(v.account ? { account: v.account } : {}), ...(v.project ? { project: v.project } : {}), created: v.at },
      "the rule",
    );
    const rel = `rules/${ruleId}.md`;
    this.writeOnce(rel, renderDoc(meta, `${v.response === "correction" ? v.choice : card.meta.rule}\n`));
    this.toRecord(rel);
  }

  private writeRevision(id: string, revision: number, draft: CardDraft & OwnFields, body: string, agent: string): Card {
    const deck = draft.deck ?? this.ensureBranchDeck();
    if (!this.deck(deck)) throw new NoDeck(`no deck "${deck}": create it with \`baesian deck ${deck}\``);
    const meta = parse(
      CardMeta,
      {
        ...draft,
        type: "card",
        format: newestFormat("card"),
        id,
        revision,
        deck,
        source_agent: agent,
        source_branch: this.branch,
        created: now(),
      },
      "the card",
    );
    const rel = `cards/${id}/r${revision}.md`;
    this.writeOnce(rel, renderDoc(meta, body));
    this.toRecord(rel);
    this.toRecord(`decks/${deck}.md`);
    return { meta, body };
  }

  /** The agent withdraws its own card. */
  withdraw(id: string, reason: string, by: string): Withdrawal {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new NoCard(id);
    // Only the agent that filed it, or one attached to it, withdraws a card. Names are what agents say they are, so
    // this guards against mistakes, not against an agent set on it.
    const mine = card.meta.source_agent === by || this.attachments().some((a) => a.card === id && a.agent === by);
    if (!mine) throw new NotAllowed(`${id} was filed by ${byLine(cardAuthor(card.meta))}: only the agent that filed it, or one attached to it, may withdraw it`);
    if (this.storage.read(`cards/${id}/withdrawn.json`) !== undefined) throw new NotAllowed(`${id} is already withdrawn`);
    const w = parse(Withdrawal, { type: "withdrawal", format: newestFormat("withdrawal"), card: id, reason, by, at: now() }, "the withdrawal");
    const rel = `cards/${id}/withdrawn.json`;
    this.writeOnce(rel, `${JSON.stringify(w, null, 2)}\n`);
    this.toRecord(rel);
    return w;
  }

  /** Wait on an existing card instead of filing a duplicate (D36). Copies the card into this worktree's record. */
  attach(id: string, agent: string): Attachment {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new NoCard(id);
    const a = parse(
      Attachment,
      { type: "attachment", format: newestFormat("attachment"), card: id, agent, branch: this.branch, at: now() },
      "the attachment",
    );
    this.writeOnce(`attachments/${id}-${randomSuffix()}.json`, `${JSON.stringify(a, null, 2)}\n`);
    for (const r of this.revisions(id)) this.toRecord(`cards/${id}/r${r.meta.revision}.md`);
    this.toRecord(`decks/${card.meta.deck}.md`);
    return a;
  }

  /** The card's withdrawal by its agent, if it has one. */
  withdrawal(id: string): Withdrawal | undefined {
    return this.read(`cards/${id}/withdrawn.json`, (t) => readAs("withdrawal", Withdrawal, JSON.parse(t), `cards/${id}/withdrawn.json`));
  }

  attachments(id?: string): Attachment[] {
    return this.list("attachments")
      .filter((f) => !id || f.startsWith(`${id}-`))
      .flatMap((f) => this.read(`attachments/${f}`, (t) => readAs("attachment", Attachment, JSON.parse(t), `attachments/${f}`)) ?? []);
  }

  /** How many agents are waiting on a card: its filer plus every attachment (D36). */
  waiting(id: string): number {
    return 1 + this.attachments(id).length;
  }

  /** Record that the agent proceeded on a blocking card without a verdict (D46). */
  recordFallback(id: string, reason: Fallback["reason"], agent: string): Fallback {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new NoCard(id);
    const f = parse(
      Fallback,
      { type: "fallback", format: newestFormat("fallback"), card: id, revision: card.meta.revision, reason, agent, at: now() },
      "the fallback",
    );
    const rel = `cards/${id}/fallback-${randomSuffix()}.json`;
    this.writeOnce(rel, `${JSON.stringify(f, null, 2)}\n`);
    this.toRecord(rel);
    return f;
  }

  fallbacks(id: string): Fallback[] {
    return this.list(`cards/${id}`)
      .filter((f) => f.startsWith("fallback-"))
      .flatMap((f) => this.read(`cards/${id}/${f}`, (t) => readAs("fallback", Fallback, JSON.parse(t), `cards/${id}/${f}`)) ?? []);
  }

  // ---------------------------------------------------------------- ledger and rules

  /** Record that a commit builds on a card (D15). Written by the post-commit hook. */
  writeLedger(id: string, entry: { commit: string; branch?: string }, body: string): string {
    this.requireInit();
    if (!this.card(id)) throw new NoCard(id);
    const meta = parse(
      LedgerMeta,
      { type: "ledger", format: newestFormat("ledger"), card: id, branch: entry.branch ?? this.branch, commit: entry.commit, at: now() },
      "the ledger entry",
    );
    this.writeOnce(`ledger/${id}-${randomSuffix()}.md`, renderDoc(meta, body));
    return id;
  }

  ledger(id: string): { meta: LedgerMeta; body: string }[] {
    return this.list("ledger")
      .filter((f) => f.startsWith(`${id}-`))
      .flatMap((f) => this.read(`ledger/${f}`, (text) => {
        const { meta, body } = parseDoc(text);
        return { meta: readAs("ledger", LedgerMeta, meta, `ledger/${f}`), body };
      }) ?? [])
      .sort((a, b) => a.meta.at.localeCompare(b.meta.at));
  }

  /** Every rule, retired or not: a retired one carries its retirement (D119). In a hosted repo, only those signed (D138). */
  rules(): { meta: RuleMeta; body: string; retired?: RuleRetirement }[] {
    const files = this.list("rules");
    return files
      .filter((f) => f.endsWith(".md") && this.judge(`rules/${f}`).ok)
      .flatMap((f) => {
        const rule = this.ruleFile(f);
        if (!rule) return [];
        const gone = `${rule.meta.id}-retired.json`;
        const retired = files.includes(gone) && this.judge(`rules/${gone}`).ok ? this.retirementFile(gone) : undefined;
        return [{ ...rule, ...(retired ? { retired } : {}) }];
      });
  }

  /** One rule file, read whether or not it counts. A view caches it by path, so it's read the same way everywhere. */
  private ruleFile(name: string): { meta: RuleMeta; body: string } | undefined {
    return this.read(`rules/${name}`, (text) => {
      const { meta, body } = parseDoc(text);
      return { meta: readAs("rule", RuleMeta, meta, `rules/${name}`), body };
    });
  }

  private retirementFile(name: string): RuleRetirement | undefined {
    return this.read(`rules/${name}`, (t) => readAs("rule-retirement", RuleRetirement, JSON.parse(t), `rules/${name}`));
  }

  // ---------------------------------------------------------------- presence

  /** The client's last heartbeat, if it has ever run (D41). */
  presence(): Presence | undefined {
    try {
      const text = this.text("presence.json");
      return text === undefined ? undefined : readAs("presence", Presence, JSON.parse(text), "presence.json");
    } catch {
      return undefined; // a half-written or foreign file, or one in a newer format (D157), means "unknown", never a crash
    }
  }

  /** The client's heartbeat, a mutable file replaced whole (`Storage.replace`), so readers never see half a file. */
  touchPresence(client: string, at: string = now()): Presence {
    this.requireInit();
    const p = parse(Presence, { type: "presence", format: newestFormat("presence"), client, at }, "presence");
    this.storage.replace("presence.json", encode(`${JSON.stringify(p)}\n`));
    return p;
  }

  // ---------------------------------------------------------------- decks

  deck(id: string): Deck | undefined {
    return this.read(`decks/${id}.md`, (text) => {
      const { meta, body } = parseDoc(text);
      return { meta: readAs("deck", DeckMeta, meta, `decks/${id}.md`), body };
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
    // Only a document in the repo is named: a path outside it would show the machine's folders in the record (D105).
    const from = input.from ? relative(this.need("naming the document a deck came from").repo.toplevel, input.from) : undefined;
    const inRepo = from !== undefined && from !== "" && from !== ".." && !from.startsWith(`..${sep}`) && !isAbsolute(from);
    const meta = parse(
      DeckMeta,
      {
        type: "deck",
        format: newestFormat("deck"),
        id: input.id,
        title: input.title,
        branch: this.branch,
        ...(inRepo ? { from } : {}),
        context_notes: input.context_notes ?? [],
        created: now(),
      },
      "the deck",
    );
    try {
      this.writeOnce(`decks/${meta.id}.md`, renderDoc(meta, body));
    } catch (e) {
      if (!alreadyExists(e)) throw e;
      throw Object.assign(new Error(`there's already a deck "${meta.id}"`), { code: "EEXIST" });
    }
    return { meta, body };
  }

  /** The branch's default deck (D29), created on first use. */
  branchDeckId(): string {
    return `branch-${slug(this.branch)}`;
  }

  ensureBranchDeck(): string {
    const id = this.branchDeckId();
    if (!this.deck(id)) {
      try {
        this.createDeck(
          { id, title: `Decisions on ${this.branch}` },
          `Decisions filed while working on the branch \`${this.branch}\`.\n`,
        );
      } catch (e) {
        // Another agent on this branch created it at the same moment: the exclusive create lost the race,
        // and the deck it wanted exists. Found by the server's concurrency test.
        if (!alreadyExists(e)) throw e;
      }
    }
    return id;
  }

  // ---------------------------------------------------------------- verdicts

  /** A card's verdicts, oldest first. In a hosted repo, only those that count: signed, and on a hard card proved (D138, D139). */
  verdicts(id: string): Verdict[] {
    return this.verdictFilesOf(id)
      .flatMap((f) => {
        const v = this.verdictFile(f);
        return v && this.judge(`verdicts/${f}`).ok ? [v] : [];
      })
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /** One verdict file, by name, read whether or not it counts. */
  private verdictFile(name: string): Verdict | undefined {
    return this.read(`verdicts/${name}`, (t) => readAs("verdict", Verdict, JSON.parse(t), `verdicts/${name}`));
  }

  /** A card's verdict files, oldest first by name. In a view, every card's are sorted out once. */
  private verdictFilesOf(id: string): string[] {
    if (!this.session) return this.list("verdicts").filter((f) => verdictFileCard(f) === id);
    if (!this.session.verdictFiles) {
      const byCard = new Map<string, string[]>();
      for (const f of this.list("verdicts")) {
        const card = verdictFileCard(f);
        if (card) (byCard.get(card) ?? byCard.set(card, []).get(card)!).push(f);
      }
      this.session.verdictFiles = byCard;
    }
    return this.session.verdictFiles.get(id) ?? [];
  }

  /** The cards that supersede `id`, or name it in `conflict_of` (D35). In a view, found once for every card. */
  private claimants(id: string): Card[] {
    const build = () => {
      const by = new Map<string, Card[]>();
      for (const c of this.cards()) {
        for (const target of [c.meta.supersedes, ...(c.meta.conflict_of ?? [])]) {
          if (target) (by.get(target) ?? by.set(target, []).get(target)!).push(c);
        }
      }
      return by;
    };
    const by = this.session ? (this.session.claims ??= build()) : build();
    return by.get(id) ?? [];
  }

  /** Record a verdict. Only the client calls this: agents never resolve cards (D32). */
  addVerdict(input: Omit<Verdict, "type" | "format" | "at"> & { at?: string }): Verdict {
    this.requireInit();
    const card = this.card(input.card);
    if (!card) throw new NoCard(input.card);
    if (input.revision !== card.meta.revision) {
      throw new Error(`${input.card} is at revision ${card.meta.revision}; a verdict on r${input.revision} is stale`);
    }
    // A card's verdicts are ordered by `at`, so keep it strictly increasing per card: two verdicts in
    // the same millisecond would otherwise sort arbitrarily, and "the latest verdict" decides the status.
    let at = input.at ?? now();
    const previous = this.verdicts(input.card).at(-1)?.at;
    if (previous && at <= previous) at = new Date(Date.parse(previous) + 1).toISOString();
    const v = parse(Verdict, { ...input, type: "verdict", format: newestFormat("verdict"), at }, "the verdict");
    for (const id of v.retire_rules ?? []) {
      const problem = this.retirementProblem(card, v, id);
      if (problem) throw new ValidationError(problem);
    }
    // "You should have asked me" is for a card the gate held back, or in shadow would have (D151, B-87tkc).
    if (v.should_have_asked !== undefined && this.gateRecord(card.meta.id, card.meta.revision)?.outcome !== "held") {
      throw new ValidationError(`${card.meta.id} wasn't held back: "you should have asked me" is only for a card the gate held, or in shadow would have`);
    }
    const name = `${compactAt(v.at)}-${v.card}-r${v.revision}-${randomSuffix()}.json`;
    this.writeOnce(`verdicts/${name}`, `${JSON.stringify(v, null, 2)}\n`);
    this.saveRule(card, v);
    this.retireRules(card, v);
    this.moveSlider(card, v);
    return v;
  }

  /**
   * Accepting a slider proposal writes a new preference file, moving its row (B-y6jn6), with `from_card` naming it. If
   * the row has moved since the card was filed, the proposal is stale and nothing is written: a person moved it.
   */
  private moveSlider(card: Card, v: Verdict): void {
    const { pref_row: row, pref_from: from, pref_to: to } = card.meta;
    if (!row || !from || !to || v.response !== "accept") return;
    const force = this.inForce();
    if (force.settings.rows[row] !== from) return;
    // At the answer's own time, so an answer written again at that time (the relay's, after the passkey) writes the same bytes.
    this.writePreferences({ replaces: force.name, [`row_${row}`]: to }, { by: v.reviewer, ...(v.account ? { account: v.account } : {}), ...(v.project ? { project: v.project } : {}), client: v.client, from_card: card.meta.id, at: v.at });
  }

  // ---------------------------------------------------------------- preferences (D147)

  /** The preference files, oldest first by name, which is by time (D107). In a hosted repo, only those that count (D138, D163). */
  preferenceNames(): string[] {
    return this.list("preferences").filter((f) => PREFERENCE_FILE.test(f) && this.judge(`preferences/${f}`).ok);
  }

  /** One preference file, by name; in a hosted repo, undefined unless it counts. */
  preferenceFile(name: string): Preferences | undefined {
    const file = this.preferenceRaw(name);
    return file && this.judge(`preferences/${name}`).ok ? file : undefined;
  }

  /** One preference file, read whether or not it counts. */
  private preferenceRaw(name: string): Preferences | undefined {
    if (!PREFERENCE_FILE.test(name)) return undefined;
    return this.read(`preferences/${name}`, (t) => readAs("preferences", Preferences, JSON.parse(t), `preferences/${name}`));
  }

  /**
   * The preferences the gate applies now (P14, D148): the newest file, or with none, "Today" in shadow, which routes as
   * Baesian did before the gate. A newest file that can't be read fails toward the reviewer: "Today" in shadow, saying why.
   */
  inForce(): InForce {
    const name = this.preferenceNames().at(-1);
    if (!name) return { settings: TODAY };
    try {
      const file = this.preferenceFile(name);
      if (!file) return { name, settings: TODAY, problem: `the preference file preferences/${name} can't be read` };
      return { name, file, settings: settingsOf(file) };
    } catch (e) {
      return { name, settings: TODAY, problem: `the preference file preferences/${name} can't be read (${e instanceof Error ? e.message.split("\n")[0] : String(e)})` };
    }
  }

  /**
   * Write a change to the preferences (D147): for the client only, through the local server, and for an accepted slider
   * proposal. The change is made over the file in force (or "Today" in shadow), from a preset if it names one, or the
   * one the setup survey's answers suggest (B-5na1k). `replaces` must name the newest file, or be absent when there's
   * none: a change made from an older view is refused (`StalePreferences`), so two tabs can't undo each other.
   */
  writePreferences(change: PreferenceChange, who: { by: string; account?: string; project?: string; client: string; from_card?: string; at?: string }): { name: string; file: Preferences } {
    this.requireInit();
    const force = this.inForce();
    if ((change.replaces ?? undefined) !== force.name) {
      throw new StalePreferences(force.name ? `the preferences have changed since: preferences/${force.name} is in force now` : "there's no preference file yet: a first one replaces none");
    }
    const { replaces: _r, preset: presetId, ...fields } = change;
    const list = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => (ROWS as readonly unknown[]).includes(r)) : []);
    const survey = fields.survey_see || fields.survey_fine ? suggestPreset({ see: list(fields.survey_see), fine: list(fields.survey_fine) }) : undefined;
    const preset = presetId !== undefined ? PRESETS.find((p) => p.id === presetId) : survey;
    if (presetId !== undefined && !preset) throw new ValidationError(`no preset "${presetId}": the presets are ${PRESETS.map((p) => p.id).join(", ")}`);
    const base = force.file ? settingsOf(force.file) : TODAY;
    const rows = preset ? preset.rows : base.rows;
    let at = who.at ?? now();
    const previous = force.file?.at;
    if (previous && at <= previous) at = new Date(Date.parse(previous) + 1).toISOString();
    const file = parse(
      Preferences,
      {
        type: "preferences",
        format: newestFormat("preferences"),
        mode: base.mode,
        ...Object.fromEntries(ROWS.map((r) => [`row_${r}`, rows[r]])),
        rate_agent_decides: base.rate_agent_decides,
        rate_sample: base.rate_sample,
        burn_in: base.burn_in,
        ...(preset ? { profile: preset.id } : force.file?.profile ? { profile: force.file.profile } : {}),
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))),
        ...(force.name ? { replaces: force.name } : {}),
        ...(who.from_card ? { from_card: who.from_card } : {}),
        by: who.by,
        ...(who.account ? { account: who.account } : {}),
        ...(who.project ? { project: who.project } : {}),
        client: who.client,
        at,
      },
      "the preferences",
    );
    const name = `${compactAt(at)}-${randomSuffix()}.json`;
    const rel = `preferences/${name}`;
    this.writeOnce(rel, `${JSON.stringify(file, null, 2)}\n`);
    this.toRecord(rel);
    return { name, file };
  }

  /** An answer retires only a rule that the option it chose breaks, and a rule is retired once (D119). */
  private retirementProblem(card: Card, v: Verdict, id: string): string | undefined {
    const option = v.response === "accept" ? "proposal" : v.response === "alternative" ? "alternative" : undefined;
    if (!option) return `only choosing one of a card's options can retire a rule, not a ${v.response}`;
    if (!card.meta[`${option}_breaks`].includes(id)) return `${id} isn't a rule that ${card.meta.id}'s ${option} breaks`;
    const rule = this.rules().find((r) => r.meta.id === id);
    if (!rule) return `no rule ${id}`;
    if (rule.retired) return `${id} is already retired`;
    return undefined;
  }

  private retireRules(card: Card, v: Verdict): void {
    for (const id of v.retire_rules ?? []) {
      const r = parse(RuleRetirement, { type: "rule-retirement", format: newestFormat("rule-retirement"), rule: id, card: card.meta.id, by: v.reviewer, ...(v.account ? { account: v.account } : {}), ...(v.project ? { project: v.project } : {}), at: v.at }, "the retirement");
      const rel = `rules/${id}-retired.json`;
      this.writeOnce(rel, `${JSON.stringify(r, null, 2)}\n`);
      this.toRecord(rel);
    }
  }

  // ---------------------------------------------------------------- status

  /** A card's status, computed from its files; nothing is ever edited in place (D34). */
  status(id: string, seen: Set<string> = new Set()): Status {
    const card = this.card(id);
    if (!card) throw new NoCard(id);
    // Listed, not read: in a view, the card's folder is listed once.
    if (this.list(`cards/${id}`).includes("withdrawn.json")) return "withdrawn";
    seen.add(id);
    // Rejecting a parent withdraws the cards that depend on it (D14). `>=`, not `>`: timestamps have
    // millisecond resolution, and a rejection in the same millisecond as the filing still counts.
    for (const parent of card.meta.depends_on) {
      const rejectedAfter = this.verdicts(parent).some((v) => v.response === "reject" && v.at >= card.meta.created);
      if (rejectedAfter) return "withdrawn";
    }
    for (const other of this.claimants(id)) {
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
    // Held back by the gate, enforcing, and not answered yet (D150): any answer on the revision ends it.
    if (!last) return this.isHeld(card) ? "held" : "open";
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

  /** The gate held this revision back, enforcing: a shadow record never holds a card (D148). */
  private isHeld(card: Card): boolean {
    const g = this.gateRecord(card.meta.id, card.meta.revision);
    return g?.mode === "enforce" && g.outcome === "held";
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
      out.push({
        kind: "parent-decided-otherwise",
        card: card.meta.id,
        parent: parentId,
        parentTitle: parent.meta.title,
        parentAgent: parent.meta.source_agent,
        parentBranch: parent.meta.source_branch,
        assumed: parent.meta.proposal,
        decided: pv.choice!,
        reviewer: pv.reviewer,
        at: pv.at,
      });
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
    const g = last && this.gateRecord(card.meta.id, last.revision);
    if (last && !earlier && g?.mode === "enforce" && g.outcome === "held") {
      // Held back, so the agent went ahead with its pick (D150): an answer that overturns it, or a rejection, means
      // rework (D151). A question or a deferral doesn't: the card's status says what to do.
      const now = answerOf(last);
      if (now === undefined ? last.response !== "reject" : normalise(now) === normalise(card.meta.proposal)) return undefined;
      return { kind: "held-answered", card: card.meta.id, assumed: card.meta.proposal, agent: card.meta.source_agent, branch: card.meta.source_branch, now, reviewer: last.reviewer, response: last.response, commits: this.builtOn(card.meta.id, last.at), at: last.at };
    }
    if (!last || !earlier) return undefined;
    const was = answerOf(earlier)!, now = answerOf(last);
    if (now !== undefined && normalise(now) === normalise(was)) return undefined;
    return { kind: "answer-changed", card: card.meta.id, was, wasReviewer: earlier.reviewer, now, reviewer: last.reviewer, response: last.response, commits: this.builtOn(card.meta.id, last.at), at: last.at };
  }

  /**
   * The commits built on a card before `before` (B-9v5xj). First those on a branch whose trailers cite it, found by
   * searching the history, so a rebase, or a squash that keeps the trailer, doesn't lose them; then the ledger's
   * entries whose commit is on no branch now, marked rewritten. A commit in both is named by the branch the ledger
   * says it was made on, unless that was a detached HEAD (as during a rebase).
   */
  private builtOn(id: string, before: string): BriefCommit[] {
    const history = this.history();
    const ledger = this.ledger(id).filter((e) => e.meta.at < before);
    const madeOn = new Map(ledger.flatMap((e) => (e.meta.commit && !e.meta.branch.startsWith("detached-") ? [[e.meta.commit, e.meta.branch] as const] : [])));
    // When the work was done: a rebase keeps the author's date, and a commit made after the change built on the new answer.
    const found = (history.citing.get(id) ?? []).filter((c) => c.authored < Date.parse(before));
    const listed = new Set(found.map((c) => c.commit));
    const out: BriefCommit[] = found.map((c) => ({ commit: c.commit, branch: madeOn.get(c.commit) ?? c.branch }));
    for (const e of ledger) {
      const commit = e.meta.commit;
      if (!commit) {
        out.push({ branch: e.meta.branch });
      } else if (!listed.has(commit)) {
        listed.add(commit);
        out.push({ commit, branch: e.meta.branch, ...(history.onBranch(commit) ? {} : { rewritten: true as const }) });
      }
    }
    return out;
  }

  /** The history's `Baesian-Card` trailers (B-9v5xj): searched once per view, and cached per process while the branches stay put. */
  private history(): History {
    if (this.session?.history) return this.session.history;
    const history = this.local ? readHistory(this.local.repo.toplevel) : NO_HISTORY;
    if (this.session) this.session.history = history;
    return history;
  }

  /** What an agent should be told about a card now, beyond its verdict (D80, D81). */
  briefs(id: string): Brief[] {
    const card = this.card(id);
    if (!card) throw new NoCard(id);
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

  /** Topic merges (D44); in a hosted repo, only those signed (D138). */
  aliases(): TopicAlias[] {
    return this.list("topics")
      .filter((f) => f.startsWith("alias-") && f.endsWith(".json") && this.judge(`topics/${f}`).ok)
      .flatMap((f) => this.read(`topics/${f}`, (t) => readAs("topic-alias", TopicAlias, JSON.parse(t), `topics/${f}`)) ?? []);
  }

  /**
   * Merge two topics that mean the same thing (D44, D111): an alias from `from`'s canonical key to `to`'s. Aliases
   * are immutable, so a merge can't be undone. Each always points at a canonical key, so no cycle can form. On the
   * relay, `who` names the account and the project it was made in (P16 section 7, B-tf9fc).
   */
  mergeTopics(from: string, to: string, by: string, who: { account?: string; project?: string } = {}): TopicAlias {
    this.requireInit();
    const source = this.canonicalTopic(from), target = this.canonicalTopic(to);
    if (source === target) throw new ValidationError(`"${from}" and "${to}" are already the same topic`);
    if (!this.topics().has(target)) throw new ValidationError(`no card uses the topic "${to}": merge into a topic that's in use`);
    const alias = parse(
      TopicAlias,
      { type: "topic-alias", format: newestFormat("topic-alias"), from: source, to: target, by, ...(who.account ? { account: who.account } : {}), ...(who.project ? { project: who.project } : {}), at: now() },
      "the alias",
    );
    const rel = `topics/alias-${randomSuffix()}.json`;
    this.writeOnce(rel, `${JSON.stringify(alias, null, 2)}\n`);
    this.toRecord(rel);
    return alias;
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
  branchCards(branch: string = this.branch): Card[] {
    const attached = new Set(this.attachments().filter((a) => a.branch === branch).map((a) => a.card));
    return this.cards().filter((c) => c.meta.source_branch === branch || attached.has(c.meta.id));
  }

  /**
   * Verdicts on this branch's cards newer than its inbox cursor, less those `baesian wait` has already delivered.
   * The cursor is local state, not a record.
   *
   * With a `session` (a harness's session id, which the plugin's hooks pass), the session keeps a cursor of its own, so
   * every session on the branch hears each verdict once (B-ghhym). A new session starts from the branch's cursor, the
   * newest any session has read, so it isn't handed old verdicts. What `wait` delivered stays delivered for all.
   */
  inbox(opts: { advance: boolean; session?: string }): InboxItem[] {
    this.requireInit();
    const branch = this.readCursor();
    const saved = opts.session ? this.readCursor(opts.session) : branch;
    const own = saved ?? { at: branch.at, delivered: [] };
    const all = this.inboxSince(own.at);
    const delivered = new Set([...own.delivered, ...branch.delivered]);
    const latest = all.at(-1)?.verdict.at;
    if (opts.advance && !opts.session && latest) {
      // Once everything newer than the cursor has been seen, here or through `wait`, the cursor moves past all of it.
      this.writeCursor({ at: latest });
    } else if (opts.advance && opts.session) {
      // A session's first read keeps its place even with nothing new, so another session reading first can't move it.
      if (latest || !saved) this.writeCursor({ at: latest ?? own.at }, opts.session);
      // The branch's cursor keeps up with the newest any session has read; what `wait` delivered stays listed, for
      // sessions still behind it.
      if (latest && latest > branch.at) this.writeCursor({ at: latest, ...(branch.delivered.length ? { delivered: branch.delivered } : {}) });
    }
    return all.filter((i) => !delivered.has(inboxKey(i)));
  }

  /**
   * Mark as seen what `baesian wait` just told the agent about `id`, its verdict and its briefs, so that `inbox`, and
   * the harness hooks that run it (D116), don't deliver them again. The cursor stays where it is, so verdicts on the
   * branch's other cards that the agent hasn't seen stay in the inbox; the delivered ones are listed beside it.
   */
  markDelivered(id: string, shown: { verdict?: Verdict; briefs: Brief[] }): void {
    this.requireInit();
    const cursor = this.readCursor();
    const ats = new Set([shown.verdict?.at, ...shown.briefs.map((b) => b.at)]);
    const keys = this.inboxSince(cursor.at)
      .filter((i) => i.card === id && ats.has(i.verdict.at))
      .map(inboxKey);
    if (keys.every((k) => cursor.delivered.includes(k))) return;
    this.writeCursor({ at: cursor.at, delivered: [...new Set([...cursor.delivered, ...keys])] });
  }

  /** The branch's cursor, or a session's own: `cursors/<branch>.json`, `cursors/<branch>/<session>.json`. */
  private cursorPath(session?: string): string {
    const branch = slug(this.branch);
    return session ? `cursors/${branch}/${slug(session)}.json` : `cursors/${branch}.json`;
  }

  private readCursor(): { at: string; delivered: string[] };
  private readCursor(session: string): { at: string; delivered: string[] } | undefined;
  private readCursor(session?: string): { at: string; delivered: string[] } | undefined {
    const rel = this.cursorPath(session);
    const text = this.text(rel);
    if (text === undefined) return session ? undefined : { at: "", delivered: [] };
    const c = readAs("cursor", Cursor, JSON.parse(text), rel);
    return { at: c.at, delivered: c.delivered ?? [] };
  }

  /** A cursor is mutable: it's replaced whole (`Storage.replace`), in the newest format (D156). */
  private writeCursor(c: { at: string; delivered?: string[] }, session?: string): void {
    const rel = this.cursorPath(session);
    const cursor = parse(Cursor, { type: "cursor", format: newestFormat("cursor"), at: c.at, ...(c.delivered?.length ? { delivered: c.delivered } : {}) }, "the cursor");
    this.storage.replace(rel, encode(`${JSON.stringify(cursor)}\n`));
  }

  /** Every inbox item newer than `since`, delivered or not, oldest first. */
  private inboxSince(since: string): InboxItem[] {
    const items: InboxItem[] = [];
    // Baesian's own proposals are the reviewer's business, not an agent's: a slider proposal never reaches an inbox, and
    // a convention card reaches every branch's only with a yes, which asks any agent for a rule (P16 section 6).
    const mine = this.branchCards().filter((c) => c.meta.pref_row === undefined && c.meta.convention === undefined);
    for (const c of this.cards().filter((k) => k.meta.convention !== undefined)) {
      for (const v of this.verdicts(c.meta.id)) {
        if (v.at > since && (v.make_rule || v.response === "accept")) items.push({ card: c.meta.id, verdict: v });
      }
    }
    for (const c of mine) {
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
    return items;
  }

  // ---------------------------------------------------------------- waiting (D90)

  /**
   * Mark an agent as waiting on a card (D90). `baesian wait` refreshes the marker every `WAITING_BEAT_MS`, and stops
   * it when the wait ends. A wait that runs in short slices (D101) picks up its own fresh marker again, so `since`
   * is when it first started waiting. An agent killed mid-wait leaves its marker behind, to go stale.
   */
  startWaiting(id: string, agent: string, at: string = now()): { since: string; path: string; refresh(at?: string): void; stop(): void } {
    this.requireInit();
    const card = this.card(id);
    if (!card) throw new NoCard(id);
    const atMs = Date.parse(at);
    const mine = this.list("waiting")
      .filter((f) => f.startsWith(`${id}-`) && f.endsWith(".json"))
      .flatMap((f) => {
        try {
          const text = this.text(`waiting/${f}`);
          return text === undefined ? [] : [{ f, w: readAs("waiting", Waiting, JSON.parse(text), `waiting/${f}`) }];
        } catch {
          return [];
        }
      })
      .find(({ w }) => w.agent === agent && w.revision === card.meta.revision && atMs - Date.parse(w.at) <= WAITING_STALE_MS);
    const rel = `waiting/${mine ? mine.f : `${id}-${randomSuffix()}.json`}`;
    const since = mine ? mine.w.since : at;
    const write = (beat: string) => {
      const w = parse(Waiting, { type: "waiting", format: newestFormat("waiting"), card: id, revision: card.meta.revision, agent, since, at: beat }, "the waiting marker");
      this.storage.replace(rel, encode(`${JSON.stringify(w)}\n`));
    };
    write(at);
    return { since, path: rel, refresh: (beat = now()) => write(beat), stop: () => this.storage.remove(rel) };
  }

  /** The agents waiting on a card, and whether each has gone quiet: stopped waiting without returning (D90). */
  waitingOn(id: string, nowMs: number = Date.now()): { marker: Waiting; stale: boolean }[] {
    return this.list("waiting")
      .filter((f) => f.startsWith(`${id}-`) && f.endsWith(".json"))
      .flatMap((f) => this.read(`waiting/${f}`, (t) => readAs("waiting", Waiting, JSON.parse(t), `waiting/${f}`)) ?? [])
      .map((marker) => ({ marker, stale: nowMs - Date.parse(marker.at) > WAITING_STALE_MS }));
  }

  // ---------------------------------------------------------------- record

  /**
   * Copy verdicts and ledger entries for the cards this worktree's record holds (D37), and every rule, retirement,
   * topic alias and preference file, which apply to the whole repo. Run by `baesian sync`, and by the pre-commit hook. Returns the
   * files it added.
   */
  syncRecord(): string[] {
    this.requireInit();
    const recordCards = join(this.need("syncing the record").record, "cards");
    const held = existsSync(recordCards) ? readdirSync(recordCards) : [];
    const added: string[] = [];
    const copy = (rel: string) => {
      if (this.toRecord(rel)) added.push(rel);
    };
    // A file a person writes goes with its signature and passkey proof, if it has them; in a hosted repo, only once it
    // counts, so an answer written on the machine never reaches the record (D138, P15).
    const hosted = this.hosted() !== undefined;
    const signed = (rel: string) => {
      if (hosted && !this.judge(rel).ok) return;
      for (const extra of [`${rel}.sig`, proofPath(rel)]) if (extra !== rel && this.storage.read(extra) !== undefined) copy(extra);
      copy(rel);
    };
    // The service's keys, revocations and passkey keys: every branch's record keeps the copy that checks on your machine
    // use, and that CI compares with its pinned keys (D142, D159).
    for (const f of this.list("trust")) copy(`trust/${f}`);
    // The client saves a rule into the record of the worktree it runs in. The local gate reads every rule from the
    // live layer, but CI reads each commit's own record, so every branch's record must hold them too.
    // Preference files too: CI rechecks a gate record against the file it names, in the commit's own record (P16).
    for (const kind of ["rules", "topics", "preferences"] as const) {
      for (const f of this.list(kind)) if (!isCompanion(f)) signed(`${kind}/${f}`);
    }
    for (const id of held) {
      // Everything in the card's directory: revisions, gate records, a withdrawal, fallbacks; the relay's gate record as signed.
      for (const f of this.list(`cards/${id}`)) {
        if (RELAY_GATE.test(f)) signed(`cards/${id}/${f}`);
        else if (!isCompanion(f)) copy(`cards/${id}/${f}`);
      }
      for (const f of this.list("verdicts").filter((name) => verdictFileCard(name) === id)) signed(`verdicts/${f}`);
      for (const f of this.list("ledger").filter((name) => name.startsWith(`${id}-`))) copy(`ledger/${f}`);
    }
    return added;
  }
}
