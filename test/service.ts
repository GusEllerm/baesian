import { type KeyObject, createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderDoc } from "../src/frontmatter.js";
import { randomSuffix } from "../src/ids.js";
import { GATE_VERSION, type GateSource, TODAY, route } from "../src/routing.js";
import type { GateRecord, PasskeyKey, PasskeyProof, Preferences, ServiceKey, Verdict } from "../src/schema.js";
import { DRAW_NAMESPACE, NAMESPACE, opensshPublicKey, parseSignature, signMessage } from "../src/sshsig.js";
import { type Store, proofPath, settingsOf } from "../src/store.js";
import { type TrustRoot, drawMessage, parseTrust } from "../src/trust.js";

// A stand-in for the hosted service (M9a): it signs what a person writes with a test Ed25519 key, as the relay will
// (D138, D160), and a test passkey makes WebAuthn assertions as a browser would (D139). Each file is written into the
// live layer as the CLI will write what it pulls from the relay (M9d), so everything is tested end to end without a
// service. What it writes is what M9b's relay must write.

export const ORIGIN = "https://baesian.test";
export const RP_ID = "baesian.test";

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();
const json = (x: object) => `${JSON.stringify(x, null, 2)}\n`;
const compact = (at: string) => at.replace(/[-:]/g, "");

/** Write a file into the live layer once, as a pull from the relay would. */
export function put(store: Store, rel: string, text: string | Buffer): void {
  const path = join(store.live, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { flag: "wx" });
}

/** A reviewer's passkey: a key pair the authenticator holds, and the assertions it makes (D139). */
export class TestPasskey {
  readonly privateKey: KeyObject;
  readonly spki: Buffer;
  readonly credential = randomBytes(16).toString("base64url");

  constructor(
    readonly account = "acct-gus",
    readonly handle = "gus",
    readonly alg: -7 | -8 | -257 = -7,
  ) {
    const pair = alg === -7 ? generateKeyPairSync("ec", { namedCurve: "P-256" }) : alg === -8 ? generateKeyPairSync("ed25519") : generateKeyPairSync("rsa", { modulusLength: 2048 });
    this.privateKey = pair.privateKey;
    this.spki = pair.publicKey.export({ format: "der", type: "spki" });
  }

  /** Its key file, as the service writes it at enrolment (P16 section 7). */
  keyFile(enrolled = "2026-01-01T00:00:00.000Z"): PasskeyKey {
    return { type: "passkey-key", format: 1, account: this.account, handle: this.handle, credential: this.credential, public_key: this.spki.toString("base64url"), alg: this.alg, enrolled };
  }

  /**
   * The assertion a browser returns when the reviewer verifies and this passkey signs `bytes`: the challenge is their
   * SHA-256 digest (P16 section 7). Each override makes one thing wrong.
   */
  prove(file: string, bytes: Buffer, over: { type?: string; challenge?: string; origin?: string; rpId?: string; flags?: number; crossOrigin?: boolean } = {}): PasskeyProof {
    const clientData = Buffer.from(JSON.stringify({ type: over.type ?? "webauthn.get", challenge: over.challenge ?? sha256(bytes).toString("base64url"), origin: over.origin ?? ORIGIN, crossOrigin: over.crossOrigin ?? false }));
    // The relying party's hash, the flags (user present and verified), and a zero sign counter, as a synced passkey has.
    const auth = Buffer.concat([sha256(over.rpId ?? RP_ID), Buffer.from([over.flags ?? 0x05]), Buffer.alloc(4)]);
    const data = Buffer.concat([auth, sha256(clientData)]);
    const signature = this.alg === -8 ? sign(null, data, this.privateKey) : sign("sha256", data, this.privateKey);
    return { type: "passkey-proof", format: 1, file, credential: this.credential, authenticator_data: auth.toString("base64url"), client_data: clientData.toString("base64url"), signature: signature.toString("base64url") };
  }
}

export interface Deliver {
  /** Leave the signature off, as an answer written on the machine has none. */
  unsigned?: boolean;
  /** Signed by another service, whose key isn't trusted. */
  signer?: TestService;
  /** The reviewer's passkey proof, beside it. */
  passkey?: TestPasskey;
  proof?: Parameters<TestPasskey["prove"]>[2];
}

/** The service: an Ed25519 key it signs with (D160), and the files it writes for a person (P16 section 7). */
export class TestService {
  readonly privateKey: KeyObject;
  readonly publicKey: string;
  private tick = 0;

  constructor(
    readonly keyId = "test-1",
    readonly validity: { after?: string; before?: string } = {},
  ) {
    this.privateKey = generateKeyPairSync("ed25519").privateKey;
    this.publicKey = opensshPublicKey(this.privateKey);
  }

  serviceKey(): ServiceKey {
    return {
      type: "service-key",
      format: 1,
      key: this.keyId,
      public_key: this.publicKey,
      origin: ORIGIN,
      rp_id: RP_ID,
      valid_after: this.validity.after ?? "2026-01-01T00:00:00.000Z",
      ...(this.validity.before ? { valid_before: this.validity.before } : {}),
    };
  }

  /** CI's pinned keys, as its protected settings hold them (`BAESIAN_TRUST`): one trust file's JSON per line. */
  pin(...passkeys: TestPasskey[]): string {
    return [this.serviceKey(), ...passkeys.map((p) => p.keyFile())].map((x) => JSON.stringify(x)).join("\n");
  }

  pinned(...passkeys: TestPasskey[]): TrustRoot {
    return parseTrust(this.pin(...passkeys), "the test pin");
  }

  /** Link a repo: the service's key in the live layer, as the CLI will write it at sign-in (M9d). */
  link(store: Store): void {
    put(store, `trust/service-${this.keyId}.json`, json(this.serviceKey()));
  }

  /** Enrol a passkey: its key file, signed, in the live layer (D159: CI pins it by hand). */
  enrol(store: Store, passkey: TestPasskey, opts: Deliver = {}): string {
    const rel = `trust/passkey-${randomSuffix()}.json`;
    this.deliver(store, rel, json(passkey.keyFile()), opts);
    return rel;
  }

  revoke(store: Store, at: string, reason = "rotated"): void {
    put(store, `trust/service-${this.keyId}-revoked.json`, json({ type: "service-key-revocation", format: 1, key: this.keyId, reason, at }));
  }

  /** The relay's clock: strictly increasing, so a card's answers keep their order. */
  now(): string {
    return new Date(Date.now() + this.tick++).toISOString();
  }

  /** An OpenSSH signature over `bytes`, namespace `baesian` (D160). */
  signature(bytes: Buffer | string): string {
    return signMessage(this.privateKey, Buffer.from(bytes), NAMESPACE);
  }

  /** A file a person wrote, as the relay delivers it: the bytes, the signature beside them, and the passkey's proof. */
  deliver(store: Store, rel: string, text: string, opts: Deliver = {}): string {
    const bytes = Buffer.from(text);
    if (!opts.unsigned) put(store, `${rel}.sig`, (opts.signer ?? this).signature(bytes));
    if (opts.passkey) put(store, proofPath(rel), json(opts.passkey.prove(rel.split("/").at(-1)!, bytes, opts.proof)));
    put(store, rel, bytes);
    return rel;
  }

  /** An answer given on the website: a verdict with the account's handle and ID, signed. Returns its path in the layer. */
  answer(store: Store, v: Partial<Omit<Verdict, "type" | "format">> & { card: string; response: Verdict["response"] }, opts: Deliver = {}): string {
    const revision = v.revision ?? store.card(v.card)!.meta.revision;
    const at = v.at ?? this.now();
    const verdict = { type: "verdict", format: 1, ...v, revision, reviewer: v.reviewer ?? "gus", account: v.account ?? "acct-gus", client: v.client ?? "hosted-desktop", at };
    return this.deliver(store, `verdicts/${compact(at)}-${v.card}-r${revision}-${randomSuffix()}.json`, json(verdict), opts);
  }

  /** A rule saved on the website (D110). */
  rule(store: Store, r: { covers: string[]; text?: string; from_card?: string; topic?: string }, opts: Deliver = {}): string {
    const id = `R-${randomSuffix()}`;
    const meta = { type: "rule", format: 1, id, ...(r.topic ? { topic: r.topic } : {}), covers: r.covers, ...(r.from_card ? { from_card: r.from_card } : {}), accepted_by: "gus", account: "acct-gus", created: this.now() };
    return this.deliver(store, `rules/${id}.md`, renderDoc(meta, `${r.text ?? "Small dev dependencies need no card."}\n`), opts);
  }

  /** A topic merge made on the website (D44). */
  alias(store: Store, from: string, to: string, opts: Deliver = {}): string {
    return this.deliver(store, `topics/alias-${randomSuffix()}.json`, json({ type: "topic-alias", format: 1, from, to, by: "gus", account: "acct-gus", at: this.now() }), opts);
  }

  /** A preference change made on the website (D147): every row, over the file in force or "Today" in shadow. */
  preferences(store: Store, change: Partial<Preferences>, opts: Deliver = {}): { rel: string; name: string } {
    const force = store.inForce();
    const base = force.file ? settingsOf(force.file) : TODAY;
    const at = this.now();
    const file = {
      type: "preferences",
      format: 1,
      mode: base.mode,
      ...Object.fromEntries(Object.entries(base.rows).map(([r, p]) => [`row_${r}`, p])),
      rate_agent_decides: base.rate_agent_decides,
      rate_sample: base.rate_sample,
      burn_in: base.burn_in,
      ...change,
      ...(force.name ? { replaces: force.name } : {}),
      by: "gus",
      account: "acct-gus",
      client: "hosted-desktop",
      at,
    };
    const name = `${compact(at)}-${randomSuffix()}.json`;
    return { rel: this.deliver(store, `preferences/${name}`, json(file), opts), name };
  }

  /**
   * The relay's gate record for a card revision (D158), as M9b's relay must write it: the rules over the card's facts,
   * under the preferences in force, with a draw from its own signature over the card (`draw_proof`), signed.
   */
  gate(store: Store, id: string, opts: Deliver & { revision?: number; source?: GateSource; heldBefore?: number; tamper?: Partial<GateRecord> } = {}): { rel: string; record: GateRecord } {
    const card = store.revisions(id).find((r) => r.meta.revision === (opts.revision ?? store.card(id)!.meta.revision))!;
    const m = card.meta;
    const bytes = store.bytes(`cards/${id}/r${m.revision}.md`);
    const draw_proof = signMessage(this.privateKey, drawMessage(id, m.revision, bytes), DRAW_NAMESPACE, { bare: true });
    const draw = createHash("sha256").update(parseSignature(draw_proof).signature).digest().readUIntBE(0, 6) / 2 ** 48;
    const force = store.inForce();
    const decision = route({ touches: m.touches, reverse: m.reverse, source: opts.source ?? "agent", draw, heldBefore: () => opts.heldBefore ?? 99 }, force.settings);
    const record = {
      type: "gate",
      format: 1,
      card: id,
      revision: m.revision,
      by: "relay",
      gate: GATE_VERSION,
      mode: force.settings.mode,
      ...(force.name ? { preferences: force.name } : {}),
      ...(m.touches.length ? { touches: m.touches } : {}),
      reverse: m.reverse,
      source: opts.source ?? "agent",
      ...decision,
      ...(decision.outcome === "held" ? { draw_proof } : {}),
      at: this.now(),
      ...opts.tamper,
    } as GateRecord;
    return { rel: this.deliver(store, `cards/${id}/gate-r${m.revision}-relay.json`, json(record), opts), record };
  }
}
