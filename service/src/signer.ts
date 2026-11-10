import { Buffer } from "node:buffer";
import { type KeyObject, createHash, createPrivateKey } from "node:crypto";
import { ServiceKey, describeError, newestFormat } from "../../src/schema.js";
import { DRAW_NAMESPACE, NAMESPACE, opensshPublicKey, parseSignature, publicKeyBlob, signMessage } from "../../src/sshsig.js";
import { signedFile } from "../../src/store.js";
import { type TrustRoot, drawMessage } from "../../src/trust.js";

// The service's signing key (D138, D160): an Ed25519 key from a Worker secret, which signs every file a person writes
// and every gate record the relay makes, in OpenSSH's format, and draws held cards for audit with its signature over the
// card (D158). What it writes matches test/service.ts, the stand-in the CLI's own checks were built against.

/** What the relay's environment says about its key, beside the secret itself (wrangler.jsonc's `vars`). */
export interface KeyEnv {
  /** The private key, PKCS #8 in PEM, as `openssl genpkey -algorithm ed25519` writes it: a secret, never in the repo. */
  SERVICE_SIGNING_KEY?: string;
  SERVICE_KEY_ID: string;
  SERVICE_ORIGIN: string;
  SERVICE_RP_ID: string;
  SERVICE_KEY_VALID_AFTER: string;
  SERVICE_KEY_VALID_BEFORE?: string;
  /**
   * The spare key (B-x47ek): its ID, its public half in OpenSSH's form (`ssh-ed25519 AAAA…`), and when it's valid from, as
   * `service/scripts/spare-key.mjs` prints them. Worker variables in wrangler.jsonc's `vars`, not secrets: the private half
   * is kept offline, and the service never signs with it. All three, or none.
   */
  SERVICE_SPARE_KEY_ID?: string;
  SERVICE_SPARE_PUBLIC_KEY?: string;
  SERVICE_SPARE_KEY_VALID_AFTER?: string;
}

/**
 * The spare service key the environment names (B-x47ek), as the service key file it would write once it signed with
 * it, or nothing; or why it can't be read. It names the service's origin and relying party, as the key in use does, so
 * the line CI pins now is the file the relay writes the day it switches.
 */
export function spareKey(env: KeyEnv): { key: ServiceKey } | { problem: string } | undefined {
  const { SERVICE_SPARE_KEY_ID: id, SERVICE_SPARE_PUBLIC_KEY: pub, SERVICE_SPARE_KEY_VALID_AFTER: after } = env;
  if (!id && !pub && !after) return undefined;
  if (!id || !pub || !after) return { problem: "the spare key takes all three of SERVICE_SPARE_KEY_ID, SERVICE_SPARE_PUBLIC_KEY and SERVICE_SPARE_KEY_VALID_AFTER" };
  if (id === env.SERVICE_KEY_ID) return { problem: `the spare key's ID, ${id}, is the key in use's: a spare takes a new key ID` };
  const parsed = ServiceKey.safeParse({ type: "service-key", format: newestFormat("service-key"), key: id, public_key: pub.trim(), origin: env.SERVICE_ORIGIN, rp_id: env.SERVICE_RP_ID, valid_after: after });
  if (!parsed.success) return { problem: `the spare key isn't a service key: ${describeError(parsed.error)}` };
  try {
    publicKeyBlob(parsed.data.public_key);
  } catch (e) {
    return { problem: `the spare key's public half can't be read (${e instanceof Error ? e.message : String(e)})` };
  }
  return { key: parsed.data };
}

/** The relay's key is missing or isn't an Ed25519 key: it can serve what it holds, but write nothing. */
export class NoKey extends Error {}

export class ServiceSigner {
  /** The public key, `ssh-ed25519 AAAA…`, as the service key file and an allowed-signers line give it. */
  readonly publicKey: string;

  private constructor(
    private readonly key: KeyObject,
    private readonly env: KeyEnv,
  ) {
    this.publicKey = opensshPublicKey(key);
  }

  /** The key from the environment. Without the secret, or with one that isn't an Ed25519 key, throws `NoKey`. */
  static fromEnv(env: KeyEnv): ServiceSigner {
    if (!env.SERVICE_SIGNING_KEY) throw new NoKey("the relay has no signing key (the secret SERVICE_SIGNING_KEY), so it can't sign what it writes");
    let key: KeyObject;
    try {
      key = createPrivateKey(env.SERVICE_SIGNING_KEY);
    } catch (e) {
      throw new NoKey(`SERVICE_SIGNING_KEY can't be read (${e instanceof Error ? e.message : String(e)}): give an Ed25519 key, PKCS #8 in PEM`);
    }
    if (key.asymmetricKeyType !== "ed25519") throw new NoKey(`SERVICE_SIGNING_KEY is an ${key.asymmetricKeyType ?? "unknown"} key, not Ed25519 (D160)`);
    return new ServiceSigner(key, env);
  }

  /** The service key file, `trust/service-<key>.json` (P16 section 7), which the relay puts in each project's log. */
  serviceKey(): ServiceKey {
    return {
      type: "service-key",
      format: newestFormat("service-key"),
      key: this.env.SERVICE_KEY_ID,
      public_key: this.publicKey,
      origin: this.env.SERVICE_ORIGIN,
      rp_id: this.env.SERVICE_RP_ID,
      valid_after: this.env.SERVICE_KEY_VALID_AFTER,
      ...(this.env.SERVICE_KEY_VALID_BEFORE ? { valid_before: this.env.SERVICE_KEY_VALID_BEFORE } : {}),
    };
  }

  /** The keys the relay's own store trusts: its own, pinned, as CI pins it (D142). Passkeys come with M9c. */
  trust(): TrustRoot {
    return { service: [this.serviceKey()], revoked: [], passkeys: [] };
  }

  /** The `.sig` for a file the store writes, if its kind is one the service signs (`signedFile()`): OpenSSH's, armored. */
  readonly sign = (path: string, bytes: Uint8Array): string | undefined => (signedFile(path) ? signMessage(this.key, Buffer.from(bytes), NAMESPACE) : undefined);

  /**
   * A card revision's draw for audit (D158): the service's signature over its ID, revision and digest, in its own
   * namespace, bare; the draw is that signature's SHA-256, its first six bytes read as a number from 0 to 1.
   */
  draw(id: string, revision: number, card: Uint8Array): { draw: number; draw_proof: string } {
    const draw_proof = signMessage(this.key, drawMessage(id, revision, Buffer.from(card)), DRAW_NAMESPACE, { bare: true });
    const draw = createHash("sha256").update(parseSignature(draw_proof).signature).digest().readUIntBE(0, 6) / 2 ** 48;
    return { draw, draw_proof };
  }
}
