import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { PREFERENCE_FIELDS, VERDICT_FIELDS } from "../../src/api.js";
import { afterVerdict } from "../../src/proposals.js";
import { loosening } from "../../src/routing.js";
import { CARD_ID, type PasskeyKey, type PasskeyProof, Preferences, type RelayEntry, type Verdict, newestFormat, upgradeFile } from "../../src/schema.js";
import { presets, snapshot } from "../../src/state.js";
import { checkPath } from "../../src/storage.js";
import { type InForce, NoCard, NotAllowed, type PreferenceChange, StalePreferences, Store, ValidationError, proofPath, settingsOf, verdictFileCard } from "../../src/store.js";
import { checkSigned, readTrustFile } from "../../src/trust.js";
import type { ServiceSigner } from "./signer.js";
import { NoKey } from "./signer.js";
import type { SqlFileStorage } from "./sql-storage.js";
import { agentKind, beforeLinkingKind, notAgentWritten, uploadProblem } from "./uploads.js";

// One project's relay (M9b): Baesian's own store over the project's files in its Durable Object (B-0ag7h, B-17wn9), and
// what each address does with it (B-7z97x). The Durable Object and the Worker around it are in index.ts; who may call
// what is decided there, before anything here runs. An answer that takes the reviewer's passkey (D139, D163) is
// composed first and waits for the passkey's assertion over its bytes (M9c). docs/vault/Modules/service.md describes it.

/** What an address answers: a status and a JSON body, which the Worker sends. */
export interface Reply {
  status: number;
  body?: unknown;
}

/** The branch the relay's own store files on: Baesian's own cards, filed after an answer, name it as their source. */
export const RELAY_BRANCH = "relay";

/** The largest file a machine may upload. */
export const MAX_FILE = 1024 * 1024;

/** The most entries one read of the log gives. */
export const MAX_ENTRIES = 1000;

/** The hosted clients a person answers from (D130). */
export const CLIENTS = ["hosted-desktop", "hosted-phone"] as const;

/** How long a composed answer waits for the reviewer's passkey. */
export const PENDING_MS = 5 * 60_000;

/** A person signed in, as the Worker found them: their account, handle and client (P16 section 7). */
export interface Person {
  account: string;
  handle: string;
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

/** An answer composed and waiting for the passkey: what to write again, at the same time, and the proofs given so far. */
export interface Pending {
  account: string;
  answer: Answer;
  at: string;
  need: Needed[];
  proofs: Omit<PasskeyProof, "type" | "format" | "file">[];
  keys: PasskeyKey[];
}

/** The assertion's parts a proof keeps (P16 section 7), as the Worker checked them. */
export type Assertion = Omit<PasskeyProof, "type" | "format" | "file">;

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

const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const json = (x: object) => `${JSON.stringify(x, null, 2)}\n`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && Buffer.from(a).equals(Buffer.from(b));
const REVISION = new RegExp(`^cards/(${CARD_ID.source.replace(/^\^|\$$/g, "")})/r(\\d+)\\.md$`);

/** A passkey key file's name in a project's `trust/`, the same in every project: from its credential (P16 section 7). */
export const keyFileName = (credential: string) => `trust/passkey-${createHash("sha256").update(credential).digest("hex").slice(0, 12)}.json`;

/** An entry as an upload's reply gives it: everything but the bytes, which the machine has. */
const receipt = (e: RelayEntry | undefined) => e && { seq: e.seq, path: e.path, format: e.format, size: e.size, digest: e.digest, ...(e.machine ? { machine: e.machine } : {}), ...(e.before_linking ? { before_linking: true } : {}), at: e.at };

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
  ) {}

  /**
   * The project's store (B-0ag7h): over its files, hosted by the service's own key, pinned (D142), with the passkey keys
   * the relay itself put in the project's `trust/` and signed, as CI pins them by hand (D159), so what it shows counts
   * what a machine with the pin counts; and the answers from before linking it took from a machine (B-3zjjx), which it
   * counts as B-45xz8 counts the record at the linking commit on a machine.
   */
  store(): Store {
    const pinned = this.signer ? { ...this.signer.trust(), passkeys: this.passkeys() } : null;
    return Store.over(this.files, { branch: RELAY_BRANCH, config: { service: this.origin, project: this.project }, trust: { pinned }, beforeLinking: this.files.beforeLinking() });
  }

  /** The passkey key files in the project's `trust/`, each signed by the service's key. */
  private passkeys(): PasskeyKey[] {
    const root = this.signer!.trust();
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

  /** The log after a sequence number (P16 section 8): `GET /v1/projects/{project}/log?after={seq}`. */
  log(after: number, limit: number): Reply {
    const entries = this.files.after(after, Math.min(Math.max(limit, 1), MAX_ENTRIES));
    const head = this.files.head();
    return { status: 200, body: { entries, head, more: (entries.at(-1)?.seq ?? head) < head } };
  }

  /** The state, as `baesian serve`'s `/api/state` gives it (B-17wn9), built by `snapshot()` over the project's store. */
  state(): Reply {
    return {
      status: 200,
      body: snapshot(this.store(), { version: this.files.version(), server: { started: this.started, watch: "events" }, project: { name: this.project, branch: RELAY_BRANCH } }),
    };
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
    }
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

  /** A waiting marker stops: `DELETE /v1/projects/{project}/files/waiting/{name}` (D90). Nothing else is ever removed. */
  stopWaiting(path: string): Reply {
    const found = agentKind(path);
    if (!found?.kind.mutable) return fail(403, `${path}: only a waiting marker is removed; everything else is written once`);
    this.files.remove(path);
    return { status: 204 };
  }

  // ---------------------------------------------------------------- what a person writes (P15 section 4)

  /**
   * An answer: `POST /v1/projects/{project}/verdicts`, from a person's session only. Written through the store, as the
   * local client's is (B-0ag7h), naming the account, the project (B-tf9fc) and the card revision's digest (B-f571v),
   * and signed by the relay's storage as it's written (D138, D160). An answer on a hard card (D139), or one that writes a
   * preference file letting more cards past you (D163), takes the reviewer's passkey: it's composed, nothing is kept,
   * and it waits (202) for the passkey to sign its bytes (`Relay.prove`). Baesian's own proposals follow, as the local
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
      out = this.attempt(a, {});
    } catch (e) {
      return answerFailed(e);
    }
    if ("need" in out) {
      const id = randomBytes(18).toString("base64url");
      const pending: Pending = { account: who.account, answer: a, at: out.at, need: out.need, proofs: [], keys: [] };
      this.files.putPending(id, JSON.stringify(pending), new Date(Date.now() + PENDING_MS).toISOString());
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
   * a verdict on a hard revision, a preference file that lets more cards past you. With no proofs given, those mean
   * nothing is kept (`NeedsProof`). With proofs, the answer is written again at the time it was composed: its bytes must
   * be the ones the passkey signed, or the project changed meanwhile (`Changed`), and each proof must count, by the
   * same checks `baesian verify` makes, before anything is kept.
   */
  private attempt(a: Answer, given: { at?: string; proofs?: Assertion[]; keys?: PasskeyKey[]; need?: Needed[] }): { done: unknown } | { need: Needed[]; at: string } {
    try {
      const done = this.write((s, mark) => {
        for (const k of given.keys ?? []) this.putKey(k);
        const before = s.inForce();
        const { result, at } = runAnswer(a, s, given.at);
        const written = this.files.writtenSince(mark);
        const need = this.needed(s, before, written);
        if (!given.proofs) {
          if (need.length) throw new NeedsProof(need.map((n) => ({ kind: n.kind, digest: n.digest })), at);
          return result;
        }
        if (need.length !== given.need?.length || need.some((n, i) => n.digest !== given.need![i]!.digest)) {
          throw new Changed("the project changed while your passkey was asked (the card was answered again, or the preferences moved): answer again");
        }
        need.forEach((n, i) => {
          const proof: PasskeyProof = { type: "passkey-proof", format: newestFormat("passkey-proof"), file: n.path.slice(n.path.lastIndexOf("/") + 1), ...given.proofs![i]! };
          this.files.create(proofPath(n.path), new TextEncoder().encode(json(proof)));
        });
        const check = this.store();
        for (const n of need) {
          const j = check.judge(n.path);
          if (!j.ok) throw new Changed(`the passkey's proof doesn't count: ${j.why}`);
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

  /** A composed answer waiting for the passkey, if it's still waiting and it's this account's. */
  pending(id: string, account: string): Pending | undefined {
    const raw = this.files.pending(id);
    const p = raw ? (JSON.parse(raw) as Pending) : undefined;
    return p?.account === account ? p : undefined;
  }

  /**
   * The passkey's assertion over the next file a composed answer needs proved, as the Worker checked it against the
   * account's passkey (B-jp22m), with that passkey's key file. When every file is proved, the answer is written, with
   * each proof beside its file and the key file in `trust/`, so the relay and every pinned machine count it.
   */
  prove(id: string, account: string, assertion: Assertion, key: PasskeyKey): Reply {
    const p = this.pending(id, account);
    if (!p) return fail(404, "no answer of yours is waiting for a passkey with that ID, or it expired: answer again");
    p.proofs.push(assertion);
    if (!p.keys.some((k) => k.credential === key.credential)) p.keys.push(key);
    if (p.proofs.length < p.need.length) {
      this.files.putPending(id, JSON.stringify(p), new Date(Date.now() + PENDING_MS).toISOString());
      return awaiting(id, p);
    }
    let out;
    try {
      out = this.attempt(p.answer, { at: p.at, proofs: p.proofs, keys: p.keys, need: p.need });
    } catch (e) {
      this.files.dropPending(id);
      if (e instanceof Changed) return fail(409, e.message);
      return answerFailed(e);
    }
    this.files.dropPending(id);
    if ("need" in out) return fail(500, "the answer still needs a passkey after every proof was given");
    return this.answered(p.answer, out.done);
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
    if (!this.files.read(path)) this.files.create(path, new TextEncoder().encode(json(key)));
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
    const bytes = new TextEncoder().encode(json(key));
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
 * What a composed answer replies while it waits for the passkey (202): its ID, and the next file to prove, whose digest
 * is the passkey's challenge, base64url (P16 section 7). The Worker adds the browser's options.
 */
function awaiting(id: string, p: Pending): Reply {
  const next = p.need[p.proofs.length]!;
  return { status: 202, body: { passkey: { pending: id, proving: next.kind, step: p.proofs.length + 1, of: p.need.length, challenge: Buffer.from(next.digest, "hex").toString("base64url") } } };
}

/** The hosted client an answer names (D130): `hosted-desktop` unless it says `hosted-phone`. */
function clientOf(client: unknown): (typeof CLIENTS)[number] | undefined {
  if (client === undefined) return "hosted-desktop";
  return (CLIENTS as readonly unknown[]).includes(client) ? (client as (typeof CLIENTS)[number]) : undefined;
}

/** An answer the store refused, as the local server says it (src/server.ts). */
function answerFailed(e: unknown): Reply {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof NoKey) return fail(503, message);
  if (e instanceof ValidationError) return fail(400, message);
  if (e instanceof StalePreferences || e instanceof NotAllowed || /stale/.test(message)) return fail(409, message);
  if (e instanceof NoCard) return fail(404, message);
  throw e;
}
