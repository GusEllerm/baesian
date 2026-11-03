import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { z } from "zod";
import { BadSignature, DRAW_NAMESPACE, NAMESPACE, parseSignature, publicKeyBlob, signatureMatches } from "./sshsig.js";
import { type FileKindName, NewerFormat, PasskeyKey, ServiceKey, ServiceKeyRevocation, describeError, upgradeFile } from "./schema.js";

// The keys `baesian verify` and the commit gate trust in a hosted repo (D138, D142, D159), and the checks made with them.
// In CI, the keys are pinned in CI's own settings, outside the repo, where a commit can't change them; the record keeps a
// copy for checks on your machine, and the two must agree. docs/vault/Modules/src-trust.md describes it.

/** CI's pinned keys: the trust files' JSON, one per line (D142, D159). */
export const TRUST_ENV = "BAESIAN_TRUST";
/** Or a path to a file of the same lines, for a protected file on a CI runner. */
export const TRUST_FILE_ENV = "BAESIAN_TRUST_FILE";

export interface TrustRoot {
  service: ServiceKey[];
  revoked: ServiceKeyRevocation[];
  passkeys: PasskeyKey[];
}

/** The pinned keys are unreadable: CI is misconfigured, and that must stop the check, never switch it off. */
export class BadTrust extends Error {}

const KINDS: Record<string, { kind: FileKindName; schema: z.ZodType }> = {
  "service-key": { kind: "service-key", schema: ServiceKey },
  "service-key-revocation": { kind: "service-key-revocation", schema: ServiceKeyRevocation },
  "passkey-key": { kind: "passkey-key", schema: PasskeyKey },
};

/** One trust file's fields, read as its kind (D156), or why not. A newer format throws `NewerFormat` (D157). */
export function readTrustFile(fields: unknown, where: string): ServiceKey | ServiceKeyRevocation | PasskeyKey {
  const type = typeof fields === "object" && fields !== null ? (fields as { type?: unknown }).type : undefined;
  const k = typeof type === "string" ? KINDS[type] : undefined;
  if (!k) throw new BadTrust(`${where} isn't a service key, a revocation or a passkey key`);
  const parsed = k.schema.safeParse(upgradeFile(k.kind, fields, where));
  if (!parsed.success) throw new BadTrust(`${where} is not valid:\n${describeError(parsed.error)}`);
  return parsed.data as ServiceKey | ServiceKeyRevocation | PasskeyKey;
}

/** Add a trust file to a root, by its kind. */
export function addTo(root: TrustRoot, f: ServiceKey | ServiceKeyRevocation | PasskeyKey): void {
  if (f.type === "service-key") root.service.push(f);
  else if (f.type === "service-key-revocation") root.revoked.push(f);
  else root.passkeys.push(f);
}

/** Pinned keys from text: one trust file's JSON per line; blank lines and lines starting with `#` are skipped. */
export function parseTrust(text: string, where: string): TrustRoot {
  const root: TrustRoot = { service: [], revoked: [], passkeys: [] };
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    let fields: unknown;
    try {
      fields = JSON.parse(l);
    } catch {
      throw new BadTrust(`${where}, line ${i + 1}, isn't JSON: each line is one trust file's JSON`);
    }
    addTo(root, readTrustFile(fields, `${where}, line ${i + 1}`));
  });
  return root;
}

/** A pin must hold the service's key: one with only passkeys would check nothing the service signs. */
function needsServiceKey(root: TrustRoot, where: string): TrustRoot {
  if (!root.service.length) throw new BadTrust(`${where} pins no service key: give at least the service's key (D142)`);
  return root;
}

/**
 * The keys CI pins (D142, D159), from `BAESIAN_TRUST` or the file `BAESIAN_TRUST_FILE` names, or both; undefined when
 * neither is set. Set but empty or unreadable throws: a misconfigured pin must fail the check, not quietly turn it off.
 */
export function pinnedTrust(env: NodeJS.ProcessEnv = process.env): TrustRoot | undefined {
  const inline = env[TRUST_ENV];
  const path = env[TRUST_FILE_ENV];
  if (inline === undefined && path === undefined) return undefined;
  const parts: TrustRoot[] = [];
  if (inline !== undefined) {
    if (!inline.trim()) throw new BadTrust(`${TRUST_ENV} is set but empty: pin the service's keys, or unset it`);
    parts.push(parseTrust(inline, TRUST_ENV));
  }
  if (path !== undefined) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (e) {
      throw new BadTrust(`${TRUST_FILE_ENV} names ${path}, which can't be read (${e instanceof Error ? e.message : String(e)})`);
    }
    parts.push(parseTrust(text, path));
  }
  const root = { service: parts.flatMap((p) => p.service), revoked: parts.flatMap((p) => p.revoked), passkeys: parts.flatMap((p) => p.passkeys) };
  return needsServiceKey(root, [inline !== undefined ? TRUST_ENV : "", path ?? ""].filter(Boolean).join(" and "));
}

/** Why `key` couldn't sign at `at`: before it was valid, after it expired, or once it was revoked. */
function invalidAt(root: Pick<TrustRoot, "revoked">, key: ServiceKey, at: string): string | undefined {
  const t = Date.parse(at);
  if (t < Date.parse(key.valid_after)) return `before key ${key.key} was valid`;
  if (key.valid_before && t >= Date.parse(key.valid_before)) return `after key ${key.key} expired`;
  const gone = root.revoked.find((r) => r.key === key.key && Date.parse(r.at) <= t);
  if (gone) return `after key ${key.key} was revoked`;
  return undefined;
}

/**
 * Whether a file counts as the service's word (D138, D160): `sigText` is an OpenSSH signature over `bytes` in the
 * `baesian` namespace, by a trusted service key that was valid at `at`, the file's own time, and not revoked by then.
 * Returns the key, for a passkey proof's origin, or why not. A signature in a newer format throws `NewerFormat` (D157).
 */
export function checkSigned(root: Pick<TrustRoot, "service" | "revoked">, bytes: Buffer, sigText: string, at: string, file: string): { key: ServiceKey } | { problem: string } {
  let sig;
  try {
    sig = parseSignature(sigText, `${file}.sig`);
  } catch (e) {
    if (e instanceof NewerFormat) throw e;
    return { problem: `its signature can't be read (${e instanceof Error ? e.message : String(e)})` };
  }
  if (sig.namespace !== NAMESPACE) return { problem: `it's signed for ${JSON.stringify(sig.namespace)}, not ${JSON.stringify(NAMESPACE)}` };
  const keys = root.service.filter((k) => sameKey(k.public_key, sig.publicKey));
  if (!keys.length) return { problem: "it's signed by a key that isn't trusted" };
  if (!signatureMatches(sig, bytes, NAMESPACE)) return { problem: "its signature doesn't match its bytes" };
  const valid = keys.find((k) => !invalidAt(root, k, at));
  return valid ? { key: valid } : { problem: `it was signed ${invalidAt(root, keys[0]!, at)}` };
}

function sameKey(openssh: string, blob: Buffer): boolean {
  try {
    return publicKeyBlob(openssh).equals(blob);
  } catch (e) {
    if (e instanceof BadSignature) return false;
    throw e;
  }
}

/** A file's fields in one order, so two copies of a trust file compare by content. */
const canonical = (f: object) => JSON.stringify(Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))));

/**
 * The record's keys that CI doesn't pin, or pins differently (D142, D159). A key in the record that CI doesn't pin fails
 * the run: the commit gate on your machine trusts the record's copy, so an added key could pass forged answers there.
 * Revocations only take trust away, so the record's apply whether or not CI pins them.
 */
export function pinProblems(pinned: TrustRoot, record: { file: string; key: ServiceKey | PasskeyKey }[]): string[] {
  const pins = new Set([...pinned.service, ...pinned.passkeys].map(canonical));
  return record
    .filter(({ key }) => !pins.has(canonical(key)))
    .map(({ file, key }) =>
      key.type === "service-key"
        ? `${file} isn't pinned in CI, or differs from the pinned copy (D142). If the service rotated its key, add its line to ${TRUST_ENV}; if not, someone else added it: remove it and find out how. Its line: ${JSON.stringify(key)}`
        : `${file}, ${key.handle}'s passkey, isn't pinned in CI, or differs from the pinned copy (D159). If you enrolled it, add its line to ${TRUST_ENV}; if not, someone else added it: remove it and find out how. Its line: ${JSON.stringify(key)}`,
    );
}

/** What the relay signs for a card revision's draw (P16 section 3): its ID, revision and file digest. */
export function drawMessage(id: string, revision: number, card: Buffer): Buffer {
  return Buffer.from(`${id} r${revision} ${createHash("sha256").update(card).digest("hex")}\n`);
}

/**
 * A relay's draw for audit, from its proof (D158): the proof must be a trusted service key's signature, in the
 * `baesian-draw` namespace, over the card revision's ID, revision and file digest, made while the key was valid at
 * `at`. Ed25519 signatures are deterministic, so the relay can't redraw, and nobody without its key can predict one.
 * The draw is the signature's SHA-256 digest, its first six bytes read as a number from 0 to 1, as the CLI's is.
 */
export function drawOfProof(root: Pick<TrustRoot, "service" | "revoked">, proof: string, id: string, revision: number, card: Buffer, at: string): { draw: number } | { problem: string } {
  let sig;
  try {
    sig = parseSignature(proof, `${id}'s draw proof`);
  } catch (e) {
    if (e instanceof NewerFormat) throw e;
    return { problem: `its draw proof can't be read (${e instanceof Error ? e.message : String(e)})` };
  }
  const keys = root.service.filter((k) => sameKey(k.public_key, sig.publicKey));
  if (!keys.length) return { problem: "its draw proof is signed by a key that isn't trusted" };
  if (!signatureMatches(sig, drawMessage(id, revision, card), DRAW_NAMESPACE)) return { problem: "its draw proof isn't the service's signature over this card revision" };
  if (!keys.some((k) => !invalidAt(root, k, at))) return { problem: `its draw proof was signed ${invalidAt(root, keys[0]!, at)}` };
  return { draw: createHash("sha256").update(sig.signature).digest().readUIntBE(0, 6) / 2 ** 48 };
}
