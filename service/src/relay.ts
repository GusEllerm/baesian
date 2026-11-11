import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { PREFERENCE_FIELDS, VERDICT_FIELDS, WAITING_STALE_MS } from "../../src/api.js";
import { unmark } from "../../src/cite.js";
import { parseDoc } from "../../src/frontmatter.js";
import { afterVerdict } from "../../src/proposals.js";
import { BAESIAN, type Settings, higherLevel, loosening } from "../../src/routing.js";
import { CARD_ID, MergeEvent, type PasskeyKey, type PasskeyProof, Preferences, type RelayEntry, type Verdict, asWritten, newestFormat, upgradeFile } from "../../src/schema.js";
import { presets, snapshot } from "../../src/state.js";
import { checkPath } from "../../src/storage.js";
import { type InForce, NoCard, NotAllowed, type PreferenceChange, StalePreferences, Store, ValidationError, normalise, proofPath, settingsOf, verdictFileCard } from "../../src/store.js";
import type { ApiCard, ApiRemovedCard, ApiState } from "../../src/api.js";
import { batchChallenge } from "../../src/passkey.js";
import { type TrustRoot, checkSigned, readTrustFile } from "../../src/trust.js";
import { VERSION } from "../../src/version.js";
import { PRESENCE_STALE_MS } from "../../src/wait.js";
import type { Role } from "./accounts.js";
import type { Built, BuiltTable } from "./built.js";
import type { Waiting } from "./notify.js";
import { RETENTION, type Retention, type RetentionLedger, cardOfPath, delivered, due, isLedgerPath } from "./retention.js";
import { harnessOf } from "./usage.js";
import type { ServiceSigner } from "./signer.js";
import { NoKey } from "./signer.js";
import type { SqlFileStorage } from "./sql-storage.js";
import { agentKind, beforeLinkingKind, notAgentWritten, uploadProblem } from "./uploads.js";

// One project's relay (M9b): Baesian's own store over the project's files in its Durable Object (B-0ag7h, B-17wn9), and
// what each address does with it (B-7z97x). The Durable Object and the Worker around it are in index.ts; who may call
// what is decided there, before anything here runs. An answer that takes the reviewer's passkey (D139, D163) is
// composed first and waits for the passkey's assertion over its bytes (M9c); answers waiting together are confirmed by
// one assertion over the list of their digests (B-a6xpc). docs/vault/Modules/service.md describes it.

/** What an address answers: a status and a JSON body, which the Worker sends. */
export interface Reply {
  status: number;
  body?: unknown;
  /** The body as JSON text made already (the state, kept as built, B-evrec): sent as it is, in place of `body`. */
  text?: string;
}

/** The branch the relay's own store files on: Baesian's own cards, filed after an answer, name it as their source. */
export const RELAY_BRANCH = "relay";

/** The largest file a machine may upload. */
export const MAX_FILE = 1024 * 1024;

/** The most entries one read of the log gives. */
export const MAX_ENTRIES = 1000;

/** The hosted clients a person answers from (D130). */
export const CLIENTS = ["hosted-desktop", "hosted-phone"] as const;

/**
 * How long a composed answer waits for the reviewer's passkey: long enough for a sitting, since answers wait on the desk
 * until one tap confirms them together (B-a6xpc).
 */
export const PENDING_MS = 30 * 60_000;

/** The most waiting answers one tap confirms (B-a6xpc). */
export const MAX_BATCH = 50;

/**
 * A person signed in, as the Worker found them: their account and handle (P16 section 7), and their role in the project
 * (P20, B-rxbss): any member answers its cards; only an owner changes its settings and rules.
 */
export interface Person {
  account: string;
  handle: string;
  role: Role;
}

/** An answer, as the store writes it: a verdict, or a change to the preferences. */
type Answer =
  | { kind: "verdict"; fields: Omit<Parameters<Store["addVerdict"]>[0], "at"> }
  | { kind: "preferences"; change: PreferenceChange; who: { by: string; account: string; project: string; client: string } };

/** A file an answer writes that takes the reviewer's passkey (D139, D163), by what it is and its bytes' digest. */
export interface Needed {
  kind: "verdict" | "preferences";
  /** SHA-256 of its bytes, hex; the passkey's challenge is the same digest in base64url (P16 section 7). */
  digest: string;
}

/** An answer composed and waiting for the passkey: what to write again, at the same time, and what needs proving. */
export interface Pending {
  kind: "answer";
  account: string;
  answer: Answer;
  at: string;
  need: Needed[];
  /** When it stops waiting, by the relay's clock. */
  expires: string;
}

/**
 * Waiting answers asked for together (B-a6xpc): what one tap of the passkey confirms. The passkey signs the list of the
 * digests of every file they write that takes it (`batchChallenge()`), or, for one file alone, that file's digest.
 */
export interface Batch {
  kind: "batch";
  account: string;
  /** The waiting answers it confirms, in the order they were answered. */
  answers: string[];
  /** Every file those answers write that takes the passkey, in order: the list the passkey signs. */
  digests: string[];
}

/** The challenge a batch's passkey signs: one file's digest alone, as before (P16 section 7), or its list's (B-a6xpc). */
export const challengeFor = (digests: readonly string[]) => (digests.length === 1 ? Buffer.from(digests[0]!, "hex").toString("base64url") : batchChallenge(digests));

/** The assertion's parts a proof keeps (P16 section 7), as the Worker checked them. */
export type Assertion = Omit<PasskeyProof, "type" | "format" | "file" | "batch">;

/** What became of one answer a tap confirmed (B-a6xpc): written, as its own address would have answered, or why not. */
export interface Outcome {
  pending: string;
  /** What it answered, when it was still waiting. */
  kind?: Answer["kind"];
  status: number;
  body: unknown;
}

/** What's written needs passkey proofs that weren't given: nothing is kept. */
class NeedsProof extends Error {
  constructor(
    readonly need: Needed[],
    readonly at: string,
  ) {
    super("this answer takes your passkey");
  }
}

/** The project changed between composing an answer and its proof: written again, its bytes are other bytes. */
export class Changed extends Error {}

/** Removing a card's text would change another card: nothing is kept. */
class WouldChange extends Error {}

/** A card whose text goes, with what stays of it, its logged paths, and its held gate records for the burn-in. */
interface Removal {
  row: Parameters<RetentionLedger["removed"]>[0];
  paths: string[];
  held: { by: "cli" | "relay"; row: Parameters<RetentionLedger["heldGone"]>[1] }[];
}

/** At most this many cards are tried one at a time in a sweep, when removing them together would change another card. */
const SWEEP_ONE_BY_ONE = 50;

const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const json = (x: object) => `${JSON.stringify(x, null, 2)}\n`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && Buffer.from(a).equals(Buffer.from(b));
/** A card revision's path: its card and revision. */
export const REVISION = new RegExp(`^cards/(${CARD_ID.source.replace(/^\^|\$$/g, "")})/r(\\d+)\\.md$`);

/** A passkey key file's name in a project's `trust/`, the same in every project: from its credential (P16 section 7). */
export const keyFileName = (credential: string) => `trust/passkey-${createHash("sha256").update(credential).digest("hex").slice(0, 12)}.json`;

/** An entry as an upload's reply gives it: everything but the bytes, which the machine has. */
const receipt = (e: RelayEntry | undefined) => e && { seq: e.seq, path: e.path, format: e.format, size: e.size, digest: e.digest, ...(e.machine ? { machine: e.machine } : {}), ...(e.before_linking ? { before_linking: true } : {}), at: e.at };

/**
 * The cards waiting for the reviewer among a state's cards, as the desk's queue has them: open cards, and audits (held,
 * drawn, unanswered), each at its level in force, as `Store.levelOf` gives it: the card's own, raised in a hosted repo by
 * the relay's gate record, which is the gate record a state carries there.
 */
export function waitingOf(cards: readonly ApiCard[], hosted: boolean): Waiting[] {
  return cards.flatMap((c) =>
    c.status === "open" || c.audit
      ? [{ card: c.meta.id, revision: c.meta.revision, level: hosted && c.gate?.outcome === "shown" && c.gate.level ? higherLevel(c.meta.level, c.gate.level) : c.meta.level }]
      : [],
  );
}

export class Relay {
  constructor(
    private readonly files: SqlFileStorage,
    private readonly signer: ServiceSigner | undefined,
    /** Why there's no signer, if there isn't. */
    private readonly keyProblem: string | undefined,
    readonly project: string,
    private readonly origin: string,
    /** When this instance of the object started: the state's `server.started`. */
    private readonly started: string,
    /** Retention's own tables (M9f): what each machine was sent, and the cards whose text went. */
    private readonly retention?: RetentionLedger,
    /** Where the state is kept once built (B-evrec); without it, every read builds it. */
    private readonly kept?: BuiltTable,
  ) {}

  /**
   * The project's store (B-0ag7h): over its files, hosted by the service's own key, pinned (D142), with the passkey keys
   * the relay itself put in the project's `trust/` and signed, as CI pins them by hand (D159), so what it shows counts
   * what a machine with the pin counts; and the answers from before linking it took from a machine (B-3zjjx), which it
   * counts as B-45xz8 counts the record at the linking commit on a machine.
   */
  store(): Store {
    const pinned = this.signer ? { ...this.root(), passkeys: this.passkeys() } : null;
    const retention = this.retention;
    return Store.over(this.files, {
      branch: RELAY_BRANCH,
      config: { service: this.origin, project: this.project },
      trust: { pinned },
      beforeLinking: this.files.beforeLinking(),
      // The held cards whose gate records retention removed still count in the burn-in (M9f).
      ...(retention ? { heldEarlier: (row, by) => retention.heldEarlier(row, by) } : {}),
    });
  }

  /**
   * The service keys the relay's own store trusts (D142): the one it signs with, and each earlier one in the project's
   * `trust/`, which only the relay writes (a machine's upload of a trust file is refused, `notAgentWritten()`), with the
   * revocations there. So what it signed before it switched to its spare key (B-x47ek) still counts, as it does in CI,
   * whose pin holds both.
   */
  private root(): Pick<TrustRoot, "service" | "revoked"> {
    const own = this.signer!.trust();
    const service = [...own.service];
    const revoked = [...own.revoked];
    for (const name of this.files.list("trust").filter((n) => n.startsWith("service-") && n.endsWith(".json"))) {
      const rel = `trust/${name}`;
      try {
        const f = readTrustFile(JSON.parse(new TextDecoder().decode(this.files.read(rel)!)), rel);
        if (f.type === "service-key" && !service.some((k) => k.key === f.key)) service.push(f);
        else if (f.type === "service-key-revocation") revoked.push(f);
      } catch {
        // not a key file the relay wrote: skipped
      }
    }
    return { service, revoked };
  }

  /** The passkey key files in the project's `trust/`, each signed by one of the service's keys (`Relay.root`). */
  private passkeys(): PasskeyKey[] {
    const root = this.root();
    const out: PasskeyKey[] = [];
    for (const name of this.files.list("trust").filter((n) => n.startsWith("passkey-") && n.endsWith(".json"))) {
      const rel = `trust/${name}`;
      const bytes = this.files.read(rel);
      const sig = this.files.read(`${rel}.sig`);
      if (!bytes || !sig) continue;
      try {
        const key = readTrustFile(JSON.parse(new TextDecoder().decode(bytes)), rel);
        if (key.type === "passkey-key" && !("problem" in checkSigned(root, Buffer.from(bytes), new TextDecoder().decode(sig), key.enrolled, rel))) out.push(key);
      } catch {
        // not a key file the relay wrote: skipped
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- reading

  /**
   * The log after a sequence number (P16 section 8): `GET /v1/projects/{project}/log?after={seq}`. A machine's read notes
   * how far it has been sent the log, for retention (B-9jqt4): an entry sent to every machine is delivered.
   */
  log(after: number, limit: number, machine?: string): Reply {
    const entries = this.files.after(after, Math.min(Math.max(limit, 1), MAX_ENTRIES));
    const head = this.files.head();
    if (machine !== undefined) this.retention?.sent(machine, Math.min(Math.max(after, entries.at(-1)?.seq ?? 0), head), new Date().toISOString());
    return { status: 200, body: { entries, head, more: (entries.at(-1)?.seq ?? head) < head } };
  }

  /**
   * The state, as `baesian serve`'s `/api/state` gives it (B-17wn9): what `snapshot()` builds over the project's store,
   * kept as built until the project changes (B-evrec, `Relay.built`), with the clock, when this object started and the
   * reviewer's presence added as it's sent, since none of them moves the project's version.
   */
  state(now: number = Date.now()): Reply {
    const { rest } = this.built(now);
    const server: ApiState["server"] = { started: this.started, now: new Date(now).toISOString(), watch: "events" };
    // The heartbeat is read as it is now, through a store that checks nothing: it's the reviewer's own, never signed.
    const presence = Store.over(this.files, { branch: RELAY_BRANCH }).presence();
    return { status: 200, text: `{"server":${JSON.stringify(server)},${presence ? `"presence":${JSON.stringify(presence)},` : ""}${rest.slice(1)}` };
  }

  /**
   * The cards waiting for the reviewer, as the desk's queue has them (open cards, and audits: held, drawn, unanswered), at
   * their level in force: what a notification counts (M9e step 2, B-mjf3g), and the projects page (B-wgbdh). Kept with the
   * state as built (`Relay.built`), so asking costs a build only when the project has changed since the last one.
   */
  waiting(now: number = Date.now()): Waiting[] {
    return this.kept?.waiting(this.files.version(), this.stamp(), now) ?? this.built(now).waiting;
  }

  /** Build the state and keep it, unless it's kept already: after a change, so the next read finds it (B-evrec). */
  build(now: number = Date.now()): void {
    this.waiting(now);
  }

  /**
   * What `snapshot()` makes of the project as it is now, and the cards waiting in it: kept in the project's database
   * (B-evrec) and used again until a write empties it (`SqlFileStorage`'s version moving), a waiting marker that was fresh
   * in it would have gone stale, or the release or the service's key changes (`Relay.stamp`). With nothing kept, or
   * nowhere to keep it, it's built.
   */
  private built(now: number): Built {
    const version = this.files.version();
    const stamp = this.stamp();
    const kept = this.kept?.get(version, stamp, now);
    if (kept) return kept;
    const store = this.store();
    const state = snapshot(store, { version, server: { started: this.started, watch: "events" }, project: { name: this.project, branch: RELAY_BRANCH }, now });
    // Left out, and added as the state is sent: the clock, this object's start, and the heartbeat, which moves no version.
    const { server: _server, presence: _presence, ...rest } = state;
    // The cards whose text retention removed: listed without it (B-ec3kj), and never answerable.
    const removed = this.retention?.removedCards() ?? [];
    // A marker goes stale by the clock alone (D90): what's built says "waiting" only until the first fresh one would.
    const fresh = state.cards.flatMap((c) => c.waiting.filter((w) => !w.stale).map((w) => Date.parse(w.at) + WAITING_STALE_MS)).filter(Number.isFinite);
    const built: Built = {
      rest: JSON.stringify(removed.length ? { ...rest, removed } : rest),
      waiting: waitingOf(state.cards, store.hosted() !== undefined),
      ...(fresh.length ? { until: Math.min(...fresh) } : {}),
    };
    try {
      this.kept?.keep(version, stamp, built);
    } catch (e) {
      // Not kept (the database is full, say): this read is answered all the same, and the next builds it again.
      console.error(`keeping project ${this.project}'s state failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return built;
  }

  /**
   * What a kept state was built by: this release's code, at this address, with the service's key as it is. A deploy that
   * changes any of them finds nothing kept under its own stamp, and builds afresh.
   */
  private stamp(): string {
    return createHash("sha256").update(JSON.stringify([VERSION, this.origin, this.signer?.trust() ?? this.keyProblem ?? null])).digest("hex").slice(0, 32);
  }

  // ---------------------------------------------------------------- what's counted (D141, B-7nq85)

  /** The preferences in force: what a change is counted against. */
  settings(): Settings {
    return this.store().inForce().settings;
  }

  /** A card revision that arrived, as counted: its level, the gate's outcome, its facts, its harness; never its text. */
  filedUsage(id: string, revision: number): Record<string, unknown> | undefined {
    const store = this.store();
    const card = store.revisions(id).find((r) => r.meta.revision === revision);
    if (!card) return undefined;
    const g = store.gateRecord(id, revision);
    return {
      revision,
      level: store.levelOf(id, revision) ?? card.meta.level,
      gate: g?.outcome === "held" ? (g.mode === "enforce" ? "held" : "shadow") : "shown",
      touches: [...new Set(card.meta.touches)],
      reverse: card.meta.reverse,
      harness: harnessOf(card.meta.source_agent),
      by_baesian: card.meta.source_agent === BAESIAN,
    };
  }

  /** An answer, as counted: its response, the screen, the card's level, how long it waited, and the blind choice. */
  answeredUsage(v: Verdict): Record<string, unknown> | undefined {
    const store = this.store();
    const card = store.revisions(v.card).find((r) => r.meta.revision === v.revision);
    if (!card) return undefined;
    const g = store.gateRecord(v.card, v.revision);
    const final = v.response === "accept" ? "proposal" : v.response === "alternative" ? "alternative" : undefined;
    return {
      response: v.response,
      client: v.client === "hosted-phone" ? "phone" : "desktop",
      level: store.levelOf(v.card, v.revision) ?? card.meta.level,
      minutes_waiting: Math.max(0, Math.round((Date.parse(v.at) - Date.parse(card.meta.created)) / 60_000)),
      // A card answered in chat first had no blind choice, so there is nothing to match: left out, not counted a miss (B-nxhtx).
      ...(v.seen ? {} : { blind_match: v.first_choice === "proposal" }),
      switched: v.first_choice !== undefined && final !== undefined && v.first_choice !== final,
      was_held: g?.mode === "enforce" && g.outcome === "held",
      made_rule: v.make_rule === true,
    };
  }

  /** A change to the preferences, as counted against those before it: the mode, whether it loosens, how many rows moved. */
  preferencesUsage(before: Settings): Record<string, unknown> {
    const after = this.settings();
    return {
      mode: after.mode === "enforce" ? "on" : "shadow",
      loosening: loosening(before, after).length > 0,
      rows_changed: Object.keys(after.rows).filter((r) => after.rows[r as keyof typeof after.rows] !== before.rows[r as keyof typeof before.rows]).length,
    };
  }

  /** Whether the reviewer is present in a client: a heartbeat in the last 90 seconds (D41). */
  present(now: number): boolean {
    const p = this.store().presence();
    return !!p && now - Date.parse(p.at) <= PRESENCE_STALE_MS;
  }

  /** The presets and the setup survey, as `/api/presets` gives them. */
  presets(): Reply {
    return { status: 200, body: presets(this.store()) };
  }

  // ---------------------------------------------------------------- what a machine uploads (P15 sections 1 and 3)

  /**
   * A machine uploads a file an agent writes: `PUT /v1/projects/{project}/files/{path}`. Only those kinds, each checked
   * against the store's schema and its path. The same bytes again do nothing (200); other bytes at a path are refused
   * (409), as the store's exclusive create refuses them. A new card revision is gated by the relay (D158). A waiting
   * marker is mutable state: replaced, never in the log.
   */
  upload(path: string, bytes: Uint8Array, machine: string): Reply {
    try {
      checkPath(path);
    } catch (e) {
      return fail(400, e instanceof Error ? e.message : String(e));
    }
    if (bytes.byteLength > MAX_FILE) return fail(413, `${path} is ${bytes.byteLength} bytes; the relay takes files up to ${MAX_FILE}`);
    const found = agentKind(path);
    if (!found) {
      const early = beforeLinkingKind(path);
      return early ? this.uploadBeforeLinking(early, path, bytes, machine) : fail(403, notAgentWritten(path));
    }
    if (!found.kind.mutable) {
      const there = this.files.read(path);
      if (there) {
        return sameBytes(there, bytes)
          ? { status: 200, body: { entry: receipt(this.files.entryOf(path)), unchanged: true } }
          : fail(409, `${path} is already here, with other bytes: a file is written once, so it can't change (another machine may have written it first)`);
      }
      // Logged, with its bytes removed by retention (M9f): its entry still says which bytes were here, and they never come back.
      const kept = this.files.entryOf(path);
      if (kept) {
        return kept.digest === sha256(bytes).toString("hex")
          ? { status: 200, body: { entry: receipt(kept), unchanged: true } }
          : fail(409, `${path} was here, with other bytes: a file is written once, so it can't change`);
      }
    }
    const gone = this.removedCard(path);
    if (gone) return gone;
    const problem = uploadProblem(found.kind, found.parts, path, bytes, this.store());
    if (problem) return fail(problem.status, problem.error);
    if (found.kind.mutable) {
      this.files.replace(path, bytes);
      return { status: 200, body: { path } };
    }
    try {
      this.write(() => this.files.asMachine(machine, () => this.files.create(path, bytes)));
    } catch (e) {
      if (e instanceof NoKey) return fail(503, e.message);
      throw e;
    }
    return { status: 201, body: { entry: receipt(this.files.entryOf(path)) } };
  }

  /**
   * An answer, rule, topic merge or preference file from before the repo was linked (B-3zjjx), which a machine uploads at
   * first link: taken only while nobody has answered on the website (`SqlFileStorage.answered`), checked as an upload is,
   * and kept unsigned and apart (`SqlFileStorage.asBeforeLinking`). The relay's store counts it as B-45xz8 counts the
   * record at the linking commit, so its card shows as decided; every other machine counts it only where its own record
   * at the linking commit holds it.
   */
  private uploadBeforeLinking(found: { kind: Parameters<typeof uploadProblem>[0]; parts: string[] }, path: string, bytes: Uint8Array, machine: string): Reply {
    const there = this.files.read(path);
    if (there) {
      return sameBytes(there, bytes)
        ? { status: 200, body: { entry: receipt(this.files.entryOf(path)), unchanged: true } }
        : fail(409, `${path} is already here, with other bytes: a file is written once, so it can't change`);
    }
    if (this.files.answered()) {
      return { status: 403, body: { error: `${path} is from before linking, and someone has answered on the website since: the answers from before linking go up only before the first answer there (B-3zjjx). It stays in git, where it counts (B-45xz8).`, before_linking: "closed" } };
    }
    const problem = uploadProblem(found.kind, found.parts, path, bytes, this.store());
    if (problem) return fail(problem.status, problem.error);
    try {
      this.write(() => this.files.asMachine(machine, () => this.files.asBeforeLinking(() => this.files.create(path, bytes))));
    } catch (e) {
      if (e instanceof NoKey) return fail(503, e.message);
      throw e;
    }
    return { status: 201, body: { entry: receipt(this.files.entryOf(path)) } };
  }

  /**
   * An upload for a card whose text retention removed (M9f): refused with 410, since the relay keeps nothing more of it.
   * The CLI then stops offering it (`src/sync.ts`); the repo's record still has it.
   */
  private removedCard(path: string): Reply | undefined {
    const card = cardOfPath(path);
    const gone: ApiRemovedCard | undefined = card === undefined ? undefined : this.retention?.isRemoved(card);
    if (!gone) return undefined;
    return { status: 410, body: { error: `${gone.id}'s text was removed from the relay on ${gone.removed.slice(0, 10)}, as retention has it (B-9jqt4, B-ec3kj): the relay takes nothing more for it, and the repo's record keeps it`, removed: true } };
  }

  // ---------------------------------------------------------------- retention (M9f)

  /**
   * Remove the text of every card whose time has come (`due()`), keeping its log entries and what `RetentionLedger`
   * notes of it: an answered card 30 days after it was delivered to every machine signed in to the project (B-9jqt4), a
   * held card nobody answered 90 days after its latest revision arrived (B-ec3kj), a withdrawn card as B-dsqyd says. A
   * card whose removal would change another card's status or level (a card that builds on it, one it supersedes or
   * conflicts with) waits until that one goes too. `live` is the machines whose grants for the project are live. Returns
   * the cards removed. Then the merges whose every card's text has gone go too, with the cards their commits cite (D181,
   * B-w41p7).
   */
  sweep(now: number, live: ReadonlySet<string>, r: Retention = RETENTION): string[] {
    const removed = this.sweepCards(now, live, r);
    this.dropMerges();
    return removed;
  }

  /** The commit a ledger entry here names, if it's here and names one. */
  private ledgerCommit(path: string): string | undefined {
    const bytes = this.files.read(path);
    if (!bytes) return undefined;
    try {
      const commit = (parseDoc(new TextDecoder().decode(bytes)).meta as { commit?: unknown }).commit;
      return typeof commit === "string" ? commit : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * A merge (D181) names its branches, commit and time, the cards it brought, and since B-w41p7 the commits citing cards
   * it brought: once every one of those cards' text has gone, and every one of those commits' ledger entries was here and
   * went with its card's (so every card they cite has gone too), so do its bytes, its log entry kept, as a card's are.
   * B-15v62 ("Keep it, and say so"): a commit whose ledger entries never came here (made on a machine that isn't signed
   * in to the project, or before ledger entries left their machine) hasn't gone, so a merge listing one stays while the
   * project does, as one that names no card and no commit, a branch's deck alone, does: the relay can't tie it to any
   * card's text. Returns the paths removed.
   */
  private dropMerges(): string[] {
    const ledger = this.retention;
    if (!ledger) return [];
    // The commits whose ledger entries are still here, and those whose entries were here and went with their cards' text.
    let cited: Set<string> | undefined;
    const stillCited = () => (cited ??= new Set(this.files.list("ledger").flatMap((name) => this.ledgerCommit(`ledger/${name}`) ?? [])));
    let went: Set<string> | undefined;
    const gone = (c: string) => !stillCited().has(c) && (went ??= ledger.goneCommits()).has(c);
    const dropped: string[] = [];
    for (const name of this.files.list("merges")) {
      const path = `merges/${name}`;
      const bytes = this.files.read(path);
      if (!bytes) continue;
      try {
        const { cards, commits } = MergeEvent.parse(upgradeFile("merge", JSON.parse(new TextDecoder().decode(bytes)), path));
        if (!cards.length && !commits.length) continue;
        if (cards.every((c) => ledger.isRemoved(c)) && commits.every(gone)) dropped.push(path);
      } catch {
        // not a merge the relay took: left as it is
      }
    }
    this.files.dropFiles(dropped);
    return dropped;
  }

  private sweepCards(now: number, live: ReadonlySet<string>, r: Retention): string[] {
    const ledger = this.retention;
    if (!ledger) return [];
    const log = this.files.cardsInLog();
    const sent = ledger.sentTo();
    const store = this.store();
    const ready: Removal[] = [];
    store.view(() => {
      for (const id of store.cardIds()) {
        const card = store.card(id);
        const inLog = log.get(id);
        if (!card || !inLog) continue;
        const status = store.status(id);
        const rev = card.meta.revision;
        const ended =
          status === "resolved" || status === "superseded" ? "answered" : status === "withdrawn" ? "withdrawn" : status === "held" && !store.gateRecord(id, rev)?.drawn ? "held" : undefined;
        if (ended === undefined || ended === "held") ledger.forgetDelivered(id);
        const isDelivered = delivered(inLog.last, live, sent);
        let at = ledger.deliveredAt(id, inLog.last);
        if (ended !== undefined && ended !== "held" && isDelivered && at === undefined) {
          ledger.setDelivered(id, inLog.last, now);
          at = now;
        }
        const arrived = Date.parse(inLog.revisionAt ?? inLog.lastAt);
        if (!due({ ended, delivered: isDelivered, deliveredAt: at, arrived }, now, r)) continue;
        ready.push({
          row: {
            id,
            revision: rev,
            level: store.levelOf(id) ?? card.meta.level,
            ended: ended!,
            filed: inLog.firstAt ?? card.meta.created,
            settled: ended === "held" ? (inLog.revisionAt ?? inLog.lastAt) : inLog.lastAt,
            removed: new Date(now).toISOString(),
            size: inLog.size,
          },
          paths: inLog.paths,
          held: store.gateRecords(id).filter((g) => g.mode === "enforce" && g.outcome === "held").map((g) => ({ by: g.by, row: g.row })),
        });
      }
    });
    if (!ready.length) return [];
    if (this.remove(ready)) return ready.map((x) => x.row.id);
    // Some removal would change another card: each alone, oldest first, keeping those that change nothing.
    return ready
      .sort((a, b) => a.row.settled.localeCompare(b.row.settled))
      .slice(0, SWEEP_ONE_BY_ONE)
      .filter((x) => this.remove([x]))
      .map((x) => x.row.id);
  }

  /** Remove these cards' text in one transaction, unless that changes any other card's status or level: then nothing. */
  private remove(batch: Removal[]): boolean {
    const ledger = this.retention!;
    const ids = new Set(batch.map((x) => x.row.id));
    const before = this.fingerprint(ids);
    try {
      this.files.transaction(() => {
        for (const x of batch) {
          for (const h of x.held) ledger.heldGone(h.by, h.row);
          // The commits its ledger entries named, read before they go: a merge listing them goes once they all have (B-15v62).
          const commits = x.paths.filter(isLedgerPath).flatMap((p) => this.ledgerCommit(p) ?? []);
          this.files.dropCard(x.row.id, x.paths);
          ledger.removed(x.row);
          ledger.commitsGone(commits);
        }
        const after = this.fingerprint(ids);
        if (after.size !== before.size || [...before].some(([id, f]) => after.get(id) !== f)) throw new WouldChange();
      });
      return true;
    } catch (e) {
      if (e instanceof WouldChange) return false;
      throw e;
    }
  }

  /** Every other card's status and level in force, as the relay's store computes them now. */
  private fingerprint(skip: ReadonlySet<string>): Map<string, string> {
    const store = this.store();
    return store.view(() => {
      const out = new Map<string, string>();
      for (const id of store.cardIds()) {
        if (skip.has(id) || !store.card(id)) continue;
        out.set(id, `${store.status(id)}:${store.levelOf(id) ?? ""}`);
      }
      return out;
    });
  }

  /** A waiting marker stops: `DELETE /v1/projects/{project}/files/waiting/{name}` (D90). Nothing else is ever removed. */
  stopWaiting(path: string): Reply {
    const found = agentKind(path);
    // The default branch (B-jr8mk) is mutable too, but replaced, never removed.
    if (!found?.kind.mutable || found.kind.kind !== "waiting") return fail(403, `${path}: only a waiting marker is removed; everything else is written once, or replaced`);
    this.files.remove(path);
    return { status: 204 };
  }

  // ---------------------------------------------------------------- what a person writes (P15 section 4)

  /**
   * An answer: `POST /v1/projects/{project}/verdicts`, from a person's session only. Written through the store, as the
   * local client's is (B-0ag7h), naming the account, the project (B-tf9fc) and the card revision's digest (B-f571v),
   * and signed by the relay's storage as it's written (D138, D160). An answer on a hard card (D139), or one that writes a
   * preference file letting more cards past you (D163), takes the reviewer's passkey: it's composed, nothing is kept,
   * and it waits (202) until the passkey signs its bytes, alone or with other answers (`Relay.batch`, `Relay.proveBatch`,
   * B-a6xpc). Baesian's own proposals follow, as the local
   * server files them (D161, B-y6jn6); their failure never fails the answer.
   */
  verdict(input: unknown, who: Person): Reply {
    if (!isObject(input)) return fail(400, "send a verdict as a JSON object");
    const { client, ...rest } = input;
    const unknown = Object.keys(rest).filter((k) => !VERDICT_FIELDS.has(k));
    if (unknown.length) return fail(400, `unexpected fields: ${unknown.join(", ")}`);
    const asClient = clientOf(client);
    if (!asClient) return fail(400, `client is one of ${CLIENTS.join(", ")}`);
    if (typeof rest.card !== "string" || !CARD_ID.test(rest.card)) return fail(400, "name the card: a card ID looks like B-7f3kq");
    const store = this.store();
    const card = store.card(rest.card);
    if (!card) return fail(404, `no card ${rest.card}`);
    if (rest.revision !== card.meta.revision) return fail(409, `${rest.card} is at revision ${card.meta.revision}; a verdict on r${String(rest.revision)} is stale`);
    // What Baesian proposes that changes the project for everyone is its owners' to answer (P20, B-rxbss): a rule's
    // draft, a pattern to make a rule of, and a move of one of the gate's settings. Any member answers the rest (B-r51ts).
    if (who.role !== "owner" && (card.meta.rule !== undefined || card.meta.convention !== undefined || card.meta.pref_row !== undefined)) {
      return fail(403, "this card changes the project's rules or settings, which only its owners do: ask one of them");
    }
    const card_digest = createHash("sha256").update(store.bytes(`cards/${rest.card}/r${card.meta.revision}.md`)).digest("hex");
    const fields = { ...(rest as Parameters<Store["addVerdict"]>[0]), reviewer: who.handle, account: who.account, project: this.project, card_digest, client: asClient };
    return this.answer({ kind: "verdict", fields }, who);
  }

  /** A topic merge (D44, D111): `POST /v1/projects/{project}/aliases`, `{ from, to }`, signed as an answer is. */
  alias(input: unknown, who: Person): Reply {
    if (!isObject(input) || typeof input.from !== "string" || typeof input.to !== "string" || Object.keys(input).some((k) => k !== "from" && k !== "to")) {
      return fail(400, "send { from, to }: the two topics");
    }
    const { from, to } = input;
    try {
      return { status: 201, body: { alias: this.write((s) => s.mergeTopics(from, to, who.handle, { account: who.account, project: this.project })) } };
    } catch (e) {
      return answerFailed(e);
    }
  }

  /**
   * A change to the preferences (D147): `POST /v1/projects/{project}/preferences`, signed as an answer is. One that lets
   * more cards past you takes the passkey (D163), so it's composed and waits for it, as a hard card's answer does; a
   * change made from an older view is 409.
   */
  preferences(input: unknown, who: Person): Reply {
    if (!isObject(input)) return fail(400, "send a preference change as a JSON object");
    const { client, ...change } = input;
    const unknown = Object.keys(change).filter((k) => !PREFERENCE_FIELDS.has(k));
    if (unknown.length) return fail(400, `unexpected fields: ${unknown.join(", ")}`);
    const asClient = clientOf(client);
    if (!asClient) return fail(400, `client is one of ${CLIENTS.join(", ")}`);
    return this.answer({ kind: "preferences", change: change as PreferenceChange, who: { by: who.handle, account: who.account, project: this.project, client: asClient } }, who);
  }

  /** The reviewer's heartbeat (D41): `POST /v1/projects/{project}/presence`. Mutable state, never signed or logged. */
  presence(input: unknown): Reply {
    const asClient = clientOf(isObject(input) ? input.client : undefined);
    if (!asClient) return fail(400, `client is one of ${CLIENTS.join(", ")}`);
    this.store().touchPresence(asClient);
    return { status: 204 };
  }

  // ---------------------------------------------------------------- answers that take the passkey (D139, D163, M9c)

  /** Write an answer, or compose it and wait for the passkey when what it writes needs one. */
  private answer(a: Answer, who: Person): Reply {
    let out;
    try {
      out = this.attempt(a, { role: who.role });
    } catch (e) {
      return answerFailed(e);
    }
    if ("need" in out) {
      const id = randomBytes(18).toString("base64url");
      const pending: Pending = { kind: "answer", account: who.account, answer: a, at: out.at, need: out.need, expires: new Date(Date.now() + PENDING_MS).toISOString() };
      this.files.putPending(id, JSON.stringify(pending), pending.expires);
      return awaiting(id, pending);
    }
    return this.answered(a, out.done);
  }

  /** What an answer replies once written: the verdict and its card's status, or the preference file. */
  private answered(a: Answer, done: unknown): Reply {
    if (a.kind === "preferences") return { status: 201, body: done };
    const verdict = done as Verdict;
    let filed: string[] = [];
    try {
      filed = this.write((s) => afterVerdict(s, verdict).map((c) => c.meta.id));
    } catch (e) {
      console.error(`the relay's proposals failed after an answer on ${verdict.card}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { status: 201, body: { verdict, status: this.store().status(verdict.card), ...(filed.length ? { filed } : {}) } };
  }

  /**
   * Run an answer through the store, in one transaction. What it writes that takes the passkey is found as it's written:
   * a verdict on a hard revision, a preference file that lets more cards past you. With no assertion given, those mean
   * nothing is kept (`NeedsProof`). With one, the answer is written again at the time it was composed: its bytes must be
   * the ones the passkey signed, or the project changed meanwhile (`Changed`); each gets its proof beside it, naming the
   * batch's list when the tap confirmed more than one file (B-a6xpc); and each proof must count, by the same checks
   * `baesian verify` makes, before anything is kept.
   */
  private attempt(a: Answer, given: { at?: string; assertion?: Assertion; key?: PasskeyKey; need?: Needed[]; batch?: string[]; role?: Role }): { done: unknown } | { need: Needed[]; at: string } {
    try {
      const done = this.write((s, mark) => {
        if (given.key) this.putKey(given.key);
        // Checked as it's written, so an answer that waited for the passkey is checked again when the tap comes.
        if (a.kind === "verdict") notAnothers(s, a.fields, given.role);
        const before = s.inForce();
        const { result, at } = runAnswer(a, s, given.at);
        const written = this.files.writtenSince(mark);
        const need = this.needed(s, before, written);
        if (!given.assertion) {
          if (need.length) throw new NeedsProof(need.map((n) => ({ kind: n.kind, digest: n.digest })), at);
          return result;
        }
        if (need.length !== given.need?.length || need.some((n, i) => n.digest !== given.need![i]!.digest)) {
          throw new Changed("the project changed while your passkey was asked (the card was answered again, or the preferences moved): answer again");
        }
        for (const n of need) {
          const file = n.path.slice(n.path.lastIndexOf("/") + 1);
          const proof: PasskeyProof = { type: "passkey-proof", format: newestFormat("passkey-proof"), file, ...(given.batch ? { batch: given.batch } : {}), ...given.assertion };
          this.files.create(proofPath(n.path), new TextEncoder().encode(json(asWritten("passkey-proof", proof))));
        }
        const check = this.store();
        for (const n of need) {
          const j = check.judge(n.path);
          if (!j.ok) throw new Changed(`the passkey's proof doesn't count: ${unmark(j.why)}`);
        }
        return result;
      });
      return { done };
    } catch (e) {
      if (e instanceof NeedsProof) return { need: e.need, at: e.at };
      throw e;
    }
  }

  /** The files just written that take the passkey, in the order written (D139, D163). */
  private needed(s: Store, before: InForce, written: string[]): (Needed & { path: string })[] {
    const out: (Needed & { path: string })[] = [];
    for (const path of written) {
      const [dir, name] = path.split("/");
      const bytes = this.files.read(path)!;
      const digest = sha256(bytes).toString("hex");
      if (dir === "verdicts" && name && verdictFileCard(name)) {
        const v = JSON.parse(new TextDecoder().decode(bytes)) as Verdict;
        if (s.levelOf(v.card, v.revision) === "hard") out.push({ kind: "verdict", digest, path });
      } else if (dir === "preferences" && name && !name.endsWith(".sig")) {
        const file = Preferences.parse(upgradeFile("preferences", JSON.parse(new TextDecoder().decode(bytes)), path));
        if (loosening(before.settings, settingsOf(file)).length) out.push({ kind: "preferences", digest, path });
      }
    }
    return out;
  }

  /** What waits under an ID, if it's still waiting and it's this account's: a composed answer, or a batch of them. */
  private waitingFor<K extends "answer" | "batch">(id: string, account: string, kind: K): (K extends "answer" ? Pending : Batch) | undefined {
    const raw = this.files.pending(id);
    const p = raw ? (JSON.parse(raw) as Pending | Batch) : undefined;
    // An answer composed before batches named no kind.
    return p?.account === account && (p.kind ?? "answer") === kind ? (p as K extends "answer" ? Pending : Batch) : undefined;
  }

  /** A composed answer waiting for the passkey, if it's still waiting and it's this account's. */
  pending(id: string, account: string): Pending | undefined {
    return this.waitingFor(id, account, "answer");
  }

  /** Answers asked for together, waiting for the passkey's one tap, if they're still waiting and this account's (B-a6xpc). */
  batchOf(id: string, account: string): Batch | undefined {
    return this.waitingFor(id, account, "batch");
  }

  /**
   * Answers waiting for the passkey, asked for together (B-a6xpc): `POST batches`, `{ pending: [ids] }`, in the order they
   * were answered. Replies 202 with the batch's ID and the challenge one tap signs: the digest of the list of every file
   * they write that takes the passkey (`batchChallenge()`), or one file's own digest. Answers no longer waiting are named
   * in `expired`; if none is waiting, 404. The batch waits as long as its last answer does.
   */
  batch(input: unknown, account: string): Reply {
    const ids = isObject(input) && Array.isArray(input.pending) ? input.pending : undefined;
    if (!ids?.length || ids.length > MAX_BATCH || ids.some((x) => typeof x !== "string") || new Set(ids).size !== ids.length) {
      return fail(400, `send { pending: [ids] }: from 1 to ${MAX_BATCH} different answers waiting for your passkey`);
    }
    const alive: [string, Pending][] = [];
    const expired: string[] = [];
    for (const id of ids as string[]) {
      const p = this.pending(id, account);
      if (p) alive.push([id, p]);
      else expired.push(id);
    }
    if (!alive.length) return { status: 404, body: { error: "none of these answers is waiting for your passkey any more: they expired, or were confirmed already", expired } };
    const batch: Batch = { kind: "batch", account, answers: alive.map(([id]) => id), digests: alive.flatMap(([, p]) => p.need.map((n) => n.digest)) };
    const expires = alive.map(([, p]) => p.expires).sort().at(-1)!;
    const id = randomBytes(18).toString("base64url");
    this.files.putPending(id, JSON.stringify(batch), expires);
    return { status: 202, body: { passkey: { batch: id, answers: batch.answers, expired, files: batch.digests.length, challenge: challengeFor(batch.digests), expires } } };
  }

  /**
   * The passkey's one assertion over a batch (B-a6xpc), as the Worker checked it against the account's passkey (B-jp22m)
   * and the batch's challenge, with that passkey's key file. Each answer is then written in turn, as its own address would
   * have written it, in a transaction of its own, with its proofs beside its files, each naming the batch's list when it
   * holds more than one; and the key file in `trust/`, so the relay and every pinned machine count them. An answer that
   * expired meanwhile (410), or whose card changed (409), isn't written; the rest are. Replies 200 with each one's outcome.
   */
  proveBatch(id: string, account: string, assertion: Assertion, key: PasskeyKey): Reply {
    const b = this.batchOf(id, account);
    if (!b) return fail(404, "no answers of yours are waiting for your passkey under that ID, or they expired: confirm them again");
    this.files.dropPending(id);
    const answers: Outcome[] = b.answers.map((pending) => {
      const p = this.pending(pending, account);
      if (!p) return { pending, status: 410, body: { error: "it waited too long for your passkey, so it wasn't recorded: answer again" } };
      let r: Reply;
      try {
        const out = this.attempt(p.answer, { at: p.at, assertion, key, need: p.need, ...(b.digests.length > 1 ? { batch: b.digests } : {}) });
        r = "need" in out ? fail(500, "the answer still needs a passkey after the tap") : this.answered(p.answer, out.done);
      } catch (e) {
        r = e instanceof Changed ? fail(409, e.message) : outcomeOf(e);
      }
      this.files.dropPending(pending);
      return { pending, kind: p.answer.kind, status: r.status, body: r.body };
    });
    return { status: 200, body: { answers } };
  }

  /** Put passkey key files in the project's `trust/`, signed (P16 section 7, D159): `Relay.putKey` for each. */
  putKeys(keys: PasskeyKey[]): Reply {
    try {
      this.write(() => keys.forEach((k) => this.putKey(k)));
    } catch (e) {
      if (e instanceof NoKey) return fail(503, e.message);
      throw e;
    }
    return { status: 204 };
  }

  /** A passkey's key file, once per credential, named for it, so every project holds the same bytes at the same path. */
  private putKey(key: PasskeyKey): void {
    const path = keyFileName(key.credential);
    if (!this.files.read(path)) this.files.create(path, new TextEncoder().encode(json(asWritten("passkey-key", key))));
  }

  // ---------------------------------------------------------------- writing

  /**
   * Write through the store in one transaction: if anything throws, nothing is kept, log entries included. The project's
   * copy of the service's key goes first, so a machine's first pull has it before anything it signed; and each card
   * revision written is gated by the relay (D158), with its record signed.
   */
  private write<T>(fn: (store: Store, mark: number) => T): T {
    const signer = this.signer;
    if (!signer) throw new NoKey(this.keyProblem ?? "the relay has no signing key");
    return this.files.transaction(() => {
      this.ensureKey(signer);
      const mark = this.files.mark();
      const store = this.store();
      const out = fn(store, mark);
      for (const path of this.files.writtenSince(mark)) {
        const m = REVISION.exec(path);
        if (m) store.relayGate(m[1]!, Number(m[2]), signer.draw(m[1]!, Number(m[2]), this.files.read(path)!), this.project);
      }
      return out;
    });
  }

  /** The service's key in the project's layer, `trust/service-<key>.json`, as the CLI pulls it (P16 section 7). */
  private ensureKey(signer: ServiceSigner): void {
    const key = signer.serviceKey();
    const path = `trust/service-${key.key}.json`;
    const bytes = new TextEncoder().encode(json(asWritten("service-key", key)));
    const there = this.files.read(path);
    if (!there) this.files.create(path, bytes);
    else if (!sameBytes(there, bytes)) throw new Error(`${path} in project ${this.project} isn't this relay's key ${key.key}: a new key takes a new key ID`);
  }
}

/** Run an answer through the store, at a time given or now; returns what it wrote and its time. */
function runAnswer(a: Answer, s: Store, at: string | undefined): { result: unknown; at: string } {
  if (a.kind === "verdict") {
    const v = s.addVerdict({ ...a.fields, ...(at ? { at } : {}) });
    return { result: v, at: v.at };
  }
  const w = s.writePreferences(a.change, { ...a.who, ...(at ? { at } : {}) });
  return { result: w, at: w.file.at };
}

/**
 * What a composed answer replies while it waits for the passkey (202): its ID, what it writes that takes the passkey, and
 * until when it waits. It's confirmed with others or alone, through a batch (`Relay.batch`, B-a6xpc).
 */
function awaiting(id: string, p: Pending): Reply {
  return { status: 202, body: { passkey: { pending: id, proving: p.need.map((n) => n.kind), expires: p.expires } } };
}

/** The hosted client an answer names (D130): `hosted-desktop` unless it says `hosted-phone`. */
function clientOf(client: unknown): (typeof CLIENTS)[number] | undefined {
  if (client === undefined) return "hosted-desktop";
  return (CLIENTS as readonly unknown[]).includes(client) ? (client as (typeof CLIENTS)[number]) : undefined;
}

/** An answer the store refused, as the local server says it (src/server.ts). */
/**
 * A card another member has decided already (P20, B-v43z8, "Someone settles it"): a second person's answer never
 * replaces the first, so it isn't written. It says who decided, and whether this answer would have been the same.
 */
export class DecidedByAnother extends Error {
  constructor(readonly decided: { by: string; at: string; decision: string | undefined; same: boolean }) {
    super(`${decided.by} decided this card already${decided.same ? ", as you would have" : ""}: a second person's answer doesn't replace the first`);
  }
}

/**
 * Refuse a verdict on a card someone else has decided (`DecidedByAnother`). The member who decided it may change their
 * own answer, as before, and the agent is told of the change (D81). An answer from before linking names no account
 * (B-3zjjx): it's the project's owners' to change. `role` is absent when an answer that waited for the passkey is
 * written at last: it was checked when it was composed.
 */
function notAnothers(s: Store, v: { card: string; revision: number; response: Verdict["response"]; choice?: string | undefined; account?: string | undefined }, role: Role | undefined): void {
  if (s.status(v.card) !== "resolved") return;
  const last = s.verdicts(v.card).filter((x) => x.revision === v.revision).at(-1);
  if (!last) return;
  if (last.account ? last.account === v.account : role !== "member") return;
  const card = s.card(v.card);
  const decision = s.decision(v.card);
  const would = v.response === "accept" ? card?.meta.proposal : v.response === "alternative" || v.response === "correction" ? v.choice : undefined;
  throw new DecidedByAnother({ by: last.reviewer, at: last.at, decision, same: would !== undefined && decision !== undefined && normalise(would) === normalise(decision) });
}

function answerFailed(e: unknown): Reply {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof DecidedByAnother) return { status: 409, body: { error: message, decided: e.decided } };
  if (e instanceof NoKey) return fail(503, message);
  if (e instanceof ValidationError) return fail(400, message);
  if (e instanceof StalePreferences || e instanceof NotAllowed || /stale/.test(message)) return fail(409, message);
  if (e instanceof NoCard) return fail(404, message);
  throw e;
}

/** Why one answer of a batch wasn't written (B-a6xpc): as its own address would say, or, for the unforeseen, 500. */
function outcomeOf(e: unknown): Reply {
  try {
    return answerFailed(e);
  } catch {
    console.error(`an answer a passkey confirmed wasn't written: ${e instanceof Error ? e.message : String(e)}`);
    return fail(500, `it couldn't be written (${e instanceof Error ? e.message : String(e)})`);
  }
}
