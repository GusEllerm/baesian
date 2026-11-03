import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { PREFERENCE_FIELDS, VERDICT_FIELDS } from "../../src/api.js";
import { afterVerdict } from "../../src/proposals.js";
import { loosening } from "../../src/routing.js";
import { CARD_ID, Preferences, type RelayEntry, upgradeFile } from "../../src/schema.js";
import { presets, snapshot } from "../../src/state.js";
import { checkPath } from "../../src/storage.js";
import { type InForce, NoCard, NotAllowed, StalePreferences, Store, ValidationError, settingsOf } from "../../src/store.js";
import type { ServiceSigner } from "./signer.js";
import { NoKey } from "./signer.js";
import type { SqlFileStorage } from "./sql-storage.js";
import { agentKind, notAgentWritten, uploadProblem } from "./uploads.js";

// One project's relay (M9b): Baesian's own store over the project's files in its Durable Object (B-0ag7h, B-17wn9), and
// what each address does with it (B-7z97x). The Durable Object and the Worker around it are in index.ts; who may call
// what is decided there, before anything here runs. docs/vault/Modules/service.md describes it.

/** The branch the relay's own store files on: Baesian's own cards, filed after an answer, name it as their source. */
export const RELAY_BRANCH = "relay";

/** The largest file a machine may upload. */
export const MAX_FILE = 1024 * 1024;

/** The most entries one read of the log gives. */
export const MAX_ENTRIES = 1000;

/** The hosted clients a person answers from (D130). */
export const CLIENTS = ["hosted-desktop", "hosted-phone"] as const;

/** What an address answers: a status and a JSON body, which the Worker sends. */
export interface Reply {
  status: number;
  body?: unknown;
}

/** A person signed in, as the Worker found them: their account, handle and client (P16 section 7). */
export interface Person {
  account: string;
  handle: string;
}

/** What's asked needs the reviewer's passkey (D139, D163), and passkeys come with sign-in (M9c). */
export class NeedsPasskey extends Error {}

const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const json = (x: object) => `${JSON.stringify(x, null, 2)}\n`;
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && Buffer.from(a).equals(Buffer.from(b));
const REVISION = new RegExp(`^cards/(${CARD_ID.source.replace(/^\^|\$$/g, "")})/r(\\d+)\\.md$`);

/** An entry as an upload's reply gives it: everything but the bytes, which the machine has. */
const receipt = (e: RelayEntry | undefined) => e && { seq: e.seq, path: e.path, format: e.format, size: e.size, digest: e.digest, ...(e.machine ? { machine: e.machine } : {}), at: e.at };

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

  /** The project's store (B-0ag7h): over its files, hosted by the service's own key, pinned (D142). */
  store(): Store {
    return Store.over(this.files, { branch: RELAY_BRANCH, config: { service: this.origin, project: this.project }, trust: { pinned: this.signer?.trust() ?? null } });
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
    if (!found) return fail(403, notAgentWritten(path));
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
   * and signed by the relay's storage as it's written (D138, D160). An answer on a hard card takes the reviewer's
   * passkey (D139), which comes with sign-in, so it's refused for now. Baesian's own proposals follow, as the local
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
    if (store.levelOf(rest.card, card.meta.revision) === "hard") {
      return fail(403, `${rest.card} is a hard card: an answer on it takes your passkey (D139), and passkeys come with sign-in (M9c), so the relay can't take it yet`);
    }
    const card_digest = createHash("sha256").update(store.bytes(`cards/${rest.card}/r${card.meta.revision}.md`)).digest("hex");
    let verdict;
    try {
      verdict = this.write((s, mark) => {
        const before = s.inForce();
        const v = s.addVerdict({ ...(rest as Parameters<Store["addVerdict"]>[0]), reviewer: who.handle, account: who.account, project: this.project, card_digest, client: asClient });
        // Accepting a slider proposal writes a preference file: one that lets more past you takes the passkey too (D163).
        for (const path of this.files.writtenSince(mark).filter((p) => p.startsWith("preferences/"))) this.refuseLoosening(before, path);
        return v;
      });
    } catch (e) {
      return answerFailed(e);
    }
    let filed: string[] = [];
    try {
      filed = this.write((s) => afterVerdict(s, verdict).map((c) => c.meta.id));
    } catch (e) {
      console.error(`the relay's proposals failed after an answer on ${verdict.card}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { status: 201, body: { verdict, status: this.store().status(verdict.card), ...(filed.length ? { filed } : {}) } };
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
   * more cards past you takes the passkey (D163), so it's refused for now; a change made from an older view is 409.
   */
  preferences(input: unknown, who: Person): Reply {
    if (!isObject(input)) return fail(400, "send a preference change as a JSON object");
    const { client, ...change } = input;
    const unknown = Object.keys(change).filter((k) => !PREFERENCE_FIELDS.has(k));
    if (unknown.length) return fail(400, `unexpected fields: ${unknown.join(", ")}`);
    const asClient = clientOf(client);
    if (!asClient) return fail(400, `client is one of ${CLIENTS.join(", ")}`);
    try {
      const written = this.write((s) => {
        const before = s.inForce();
        const w = s.writePreferences(change, { by: who.handle, account: who.account, project: this.project, client: asClient });
        this.refuseLoosening(before, `preferences/${w.name}`);
        return w;
      });
      return { status: 201, body: written };
    } catch (e) {
      return answerFailed(e);
    }
  }

  /** The reviewer's heartbeat (D41): `POST /v1/projects/{project}/presence`. Mutable state, never signed or logged. */
  presence(input: unknown): Reply {
    const asClient = clientOf(isObject(input) ? input.client : undefined);
    if (!asClient) return fail(400, `client is one of ${CLIENTS.join(", ")}`);
    this.store().touchPresence(asClient);
    return { status: 204 };
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

  /** Refuse a preference file that lets more cards past you than `before` (D163): it takes the passkey. */
  private refuseLoosening(before: InForce, path: string): void {
    const file = Preferences.parse(upgradeFile("preferences", JSON.parse(new TextDecoder().decode(this.files.read(path)!)), path));
    const loose = loosening(before.settings, settingsOf(file));
    if (loose.length) throw new NeedsPasskey(`this change lets more cards past you (${loose.join("; ")}), so it takes your passkey (D163), and passkeys come with sign-in (M9c), so the relay can't take it yet`);
  }
}

/** The hosted client an answer names (D130): `hosted-desktop` unless it says `hosted-phone`. */
function clientOf(client: unknown): (typeof CLIENTS)[number] | undefined {
  if (client === undefined) return "hosted-desktop";
  return (CLIENTS as readonly unknown[]).includes(client) ? (client as (typeof CLIENTS)[number]) : undefined;
}

/** An answer the store refused, as the local server says it (src/server.ts). */
function answerFailed(e: unknown): Reply {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof NeedsPasskey) return fail(403, message);
  if (e instanceof NoKey) return fail(503, message);
  if (e instanceof ValidationError) return fail(400, message);
  if (e instanceof StalePreferences || e instanceof NotAllowed || /stale/.test(message)) return fail(409, message);
  if (e instanceof NoCard) return fail(404, message);
  throw e;
}
