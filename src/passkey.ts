import { createHash, createPublicKey, verify } from "node:crypto";
import type { PasskeyKey, PasskeyProof } from "./schema.js";

// Passkey proofs (D139, D163): a WebAuthn assertion whose challenge is the SHA-256 digest of the file it proves (P16
// section 7), so the reviewer's own passkey signed that file's bytes. Checked offline against a key pinned in CI (D159).
// Checking an assertion needs no CBOR: only registration does, and that's the service's (M9c).

/** User present and user verified: the face, fingerprint or PIN the proof stands for (D139). */
const UP = 0x01;
const UV = 0x04;

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** The challenge a proof of `file` must carry: its bytes' SHA-256 digest, in base64url, as WebAuthn encodes a challenge. */
export function challengeOf(file: Buffer): string {
  return sha256(file).toString("base64url");
}

/**
 * Why a passkey proof doesn't prove `file`, or undefined if it does. The proof must be an assertion (`webauthn.get`) for
 * the service's origin and relying party, made with user verification, whose challenge is the file's digest, signed by
 * `key`. A proof made in a frame of another site doesn't count.
 */
export function proofProblem(proof: PasskeyProof, file: Buffer, key: PasskeyKey, service: { origin: string; rp_id: string }): string | undefined {
  if (proof.credential !== key.credential) return "it was made with another passkey";
  const clientDataJson = Buffer.from(proof.client_data, "base64url");
  let client: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(clientDataJson.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return "its client data isn't an object";
    client = parsed as Record<string, unknown>;
  } catch {
    return "its client data isn't JSON";
  }
  if (client.type !== "webauthn.get") return `it's a ${String(client.type)}, not an assertion (webauthn.get)`;
  if (client.challenge !== challengeOf(file)) return "its challenge isn't the file's digest";
  if (client.origin !== service.origin) return `it was made on ${String(client.origin)}, not ${service.origin}`;
  if (client.crossOrigin === true) return "it was made in a frame of another site";
  const auth = Buffer.from(proof.authenticator_data, "base64url");
  if (auth.length < 37) return "its authenticator data is too short";
  if (!auth.subarray(0, 32).equals(sha256(service.rp_id))) return `it's for another relying party than ${service.rp_id}`;
  const flags = auth[32]!;
  if (!(flags & UP)) return "the passkey didn't see the reviewer present";
  if (!(flags & UV)) return "the passkey didn't verify the reviewer (no face, fingerprint or PIN)";
  const signed = Buffer.concat([auth, sha256(clientDataJson)]);
  const signature = Buffer.from(proof.signature, "base64url");
  try {
    const pub = createPublicKey({ key: Buffer.from(key.public_key, "base64url"), format: "der", type: "spki" });
    const ok =
      key.alg === -7
        ? // WebAuthn's ECDSA signatures are DER, Node's default; workerd takes no key object inside an options object.
          pub.asymmetricKeyType === "ec" && pub.asymmetricKeyDetails?.namedCurve === "prime256v1" && verify("sha256", signed, pub, signature)
        : key.alg === -8
          ? pub.asymmetricKeyType === "ed25519" && verify(null, signed, pub, signature)
          : pub.asymmetricKeyType === "rsa" && verify("sha256", signed, pub, signature);
    return ok ? undefined : "its signature doesn't match the passkey's key";
  } catch (e) {
    return `its signature can't be checked (${e instanceof Error ? e.message : String(e)})`;
  }
}
