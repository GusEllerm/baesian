import { type KeyObject, createHash, createPublicKey, sign, verify } from "node:crypto";
import { NewerFormat, newestFormat } from "./schema.js";

// OpenSSH signatures (D160): the hosted service signs each file a person writes with Ed25519, in OpenSSH's own format
// (PROTOCOL.sshsig), so `ssh-keygen -Y verify -n baesian` can check one by hand. Node's crypto does the Ed25519; this
// module reads and writes the format around it. docs/vault/Modules/src-trust.md describes it.

/** The namespace every signature on a file carries (D160): a signature made for anything else never counts here. */
export const NAMESPACE = "baesian";

/** The namespace of the relay's draw proofs (P16 section 3), kept apart so a draw can never pass for a file's signature. */
export const DRAW_NAMESPACE = "baesian-draw";

const MAGIC = Buffer.from("SSHSIG");
const BEGIN = "-----BEGIN SSH SIGNATURE-----";
const END = "-----END SSH SIGNATURE-----";
const ED25519 = "ssh-ed25519";
type HashAlgorithm = "sha256" | "sha512";

/** A signature file that isn't one: unreadable, or not what this namespace and key type allow. */
export class BadSignature extends Error {}

export interface SshSignature {
  /** The signer's public key, in SSH's wire form. */
  publicKey: Buffer;
  namespace: string;
  hashAlgorithm: HashAlgorithm;
  /** The raw Ed25519 signature, 64 bytes. */
  signature: Buffer;
}

/** Reads SSH's wire format: big-endian lengths before strings. */
class Reader {
  private at = 0;
  constructor(private readonly buf: Buffer) {}
  bytes(n: number): Buffer {
    if (this.at + n > this.buf.length) throw new BadSignature("it ends too soon");
    const out = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  uint32(): number {
    return this.bytes(4).readUInt32BE(0);
  }
  string(): Buffer {
    return this.bytes(this.uint32());
  }
  done(): boolean {
    return this.at === this.buf.length;
  }
}

const uint32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const sshString = (b: Buffer | string) => {
  const buf = typeof b === "string" ? Buffer.from(b) : b;
  return Buffer.concat([uint32(buf.length), buf]);
};

/** An `ssh-ed25519 AAAA…` key's wire form: the base64 part, checked to be an Ed25519 key. */
export function publicKeyBlob(openssh: string): Buffer {
  const [type, b64] = openssh.trim().split(/\s+/);
  if (type !== ED25519 || !b64) throw new BadSignature(`not an Ed25519 key in OpenSSH's form: ${type ?? "nothing"}`);
  const blob = Buffer.from(b64, "base64");
  const r = new Reader(blob);
  if (r.string().toString() !== ED25519 || r.string().length !== 32 || !r.done()) throw new BadSignature("the key's bytes aren't an Ed25519 key");
  return blob;
}

/** An Ed25519 public key in OpenSSH's form, `ssh-ed25519 AAAA…`, from Node's key object. */
export function opensshPublicKey(key: KeyObject): string {
  const x = createPublicKey(key).export({ format: "jwk" }).x;
  if (!x) throw new BadSignature("not an Ed25519 key");
  return `${ED25519} ${Buffer.concat([sshString(ED25519), sshString(Buffer.from(x, "base64url"))]).toString("base64")}`;
}

/** Node's key object for a wire-form Ed25519 public key. */
function keyOf(blob: Buffer): KeyObject {
  const r = new Reader(blob);
  if (r.string().toString() !== ED25519) throw new BadSignature("only Ed25519 keys sign Baesian's files");
  const raw = r.string();
  if (raw.length !== 32) throw new BadSignature("the key isn't 32 bytes");
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}

/**
 * Read a signature: armored, as `ssh-keygen -Y sign` writes it, or its base64 alone, as a draw proof is kept. A newer
 * SSHSIG version than this Baesian reads throws `NewerFormat` (D157), naming `file`; anything else unreadable throws
 * `BadSignature`.
 */
export function parseSignature(text: string, file = "the signature"): SshSignature {
  const trimmed = text.trim();
  let b64 = trimmed;
  if (trimmed.startsWith(BEGIN)) {
    if (!trimmed.endsWith(END)) throw new BadSignature("it has no end line");
    b64 = trimmed.slice(BEGIN.length, -END.length);
  }
  b64 = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new BadSignature("it isn't base64");
  const r = new Reader(Buffer.from(b64, "base64"));
  if (!r.bytes(6).equals(MAGIC)) throw new BadSignature("it isn't an SSH signature");
  const version = r.uint32();
  if (version > newestFormat("signature")) throw new NewerFormat(file, "signature", version);
  if (version < 1) throw new BadSignature(`it has version ${version}`);
  const publicKey = r.string();
  const namespace = r.string().toString();
  r.string(); // reserved
  const hashAlgorithm = r.string().toString();
  if (hashAlgorithm !== "sha256" && hashAlgorithm !== "sha512") throw new BadSignature(`it uses ${hashAlgorithm}, not sha256 or sha512`);
  const sig = new Reader(r.string());
  if (!r.done()) throw new BadSignature("it has bytes after the signature");
  const keyType = sig.string().toString();
  if (keyType !== ED25519) throw new BadSignature(`it's a ${keyType} signature; only Ed25519 signs Baesian's files`);
  const signature = sig.string();
  if (signature.length !== 64 || !sig.done()) throw new BadSignature("the Ed25519 signature isn't 64 bytes");
  return { publicKey, namespace, hashAlgorithm, signature };
}

/** The bytes an SSH signature signs (PROTOCOL.sshsig): the namespace, and the message's hash, never the message itself. */
function toBeSigned(namespace: string, hashAlgorithm: HashAlgorithm, message: Buffer): Buffer {
  const digest = createHash(hashAlgorithm).update(message).digest();
  return Buffer.concat([MAGIC, sshString(namespace), sshString(""), sshString(hashAlgorithm), sshString(digest)]);
}

/** Whether `sig` is its own key's signature over `message`, in `namespace`. Which keys to trust is the caller's question. */
export function signatureMatches(sig: SshSignature, message: Buffer, namespace: string): boolean {
  if (sig.namespace !== namespace) return false;
  try {
    return verify(null, toBeSigned(namespace, sig.hashAlgorithm, message), keyOf(sig.publicKey), sig.signature);
  } catch {
    return false;
  }
}

/** The signature's blob, armored as `ssh-keygen` writes it: lines of 70 characters. */
function armor(blob: Buffer): string {
  const b64 = blob.toString("base64");
  const lines = b64.match(/.{1,70}/g) ?? [];
  return `${BEGIN}\n${lines.join("\n")}\n${END}\n`;
}

/**
 * Sign `message` with an Ed25519 private key, as `ssh-keygen -Y sign -n <namespace>` does (SHA-512 by default). The
 * relay signs this way, as do the tests' stand-in for it; `bare` gives the base64 alone, for a draw proof.
 */
export function signMessage(privateKey: KeyObject, message: Buffer, namespace: string, opts: { hashAlgorithm?: HashAlgorithm; bare?: boolean } = {}): string {
  const hashAlgorithm = opts.hashAlgorithm ?? "sha512";
  const signature = sign(null, toBeSigned(namespace, hashAlgorithm, message), privateKey);
  const blob = Buffer.concat([
    MAGIC,
    uint32(1),
    sshString(publicKeyBlob(opensshPublicKey(privateKey))),
    sshString(namespace),
    sshString(""),
    sshString(hashAlgorithm),
    sshString(Buffer.concat([sshString(ED25519), sshString(signature)])),
  ]);
  return opts.bare ? blob.toString("base64") : armor(blob);
}
