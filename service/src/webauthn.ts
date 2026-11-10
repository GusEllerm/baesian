import { Buffer } from "node:buffer";
import { createPublicKey } from "node:crypto";
import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { cose, isoCBOR } from "@simplewebauthn/server/helpers";
import { PASSKEY_ALGS, type PasskeyKey, asWritten, newestFormat } from "../../src/schema.js";

// Passkeys on the service (D153, D139), through SimpleWebAuthn (B-jp22m): registration with attestation "none", and
// assertions, each with user verification required. A passkey's key also goes into each of its account's projects as a
// key file (P16 section 7), which `baesian verify` checks proofs against once it's pinned in CI by hand (D159).

/** The relying party: the website's origin and its WebAuthn ID (wrangler.jsonc's `SERVICE_ORIGIN`, `SERVICE_RP_ID`). */
export interface RelyingParty {
  origin: string;
  rpID: string;
}

/** How long the browser has for a ceremony. */
export const CEREMONY_MS = 5 * 60_000;

/** A passkey as the database keeps it. */
export interface StoredPasskey {
  credential: string;
  account: string;
  /** COSE, base64url: what assertions are checked with. */
  cose: string;
  /** SubjectPublicKeyInfo, base64url: what the key file says. */
  spki: string;
  alg: number;
  counter: number;
  transports: string | null;
  name: string;
  enrolled: string;
  last_used: string | null;
}

/** Registration options for an account's new passkey: discoverable, user verification required, no attestation. */
export function registrationOptions(rp: RelyingParty, user: { account: string; handle: string }, exclude: { credential: string; transports: string | null }[] = []): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: "Baesian",
    rpID: rp.rpID,
    userName: user.handle,
    userID: new Uint8Array(new TextEncoder().encode(user.account)),
    attestationType: "none",
    excludeCredentials: exclude.map((p) => ({ id: p.credential, ...(p.transports ? { transports: JSON.parse(p.transports) } : {}) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    supportedAlgorithmIDs: [...PASSKEY_ALGS],
    timeout: CEREMONY_MS,
  });
}

/** A new passkey, checked: its credential ID, its key in both forms, its algorithm, counter and transports. */
export interface NewPasskey {
  credential: string;
  cose: string;
  spki: string;
  alg: (typeof PASSKEY_ALGS)[number];
  counter: number;
  transports: string[] | undefined;
}

/** A registration the browser returned, checked against the challenge given; throws with why if it doesn't hold. */
export async function verifyRegistration(rp: RelyingParty, response: RegistrationResponseJSON, challenge: string): Promise<NewPasskey> {
  const v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true, supportedAlgorithmIDs: [...PASSKEY_ALGS] });
  if (!v.verified) throw new Error("the passkey's registration doesn't check");
  const c = v.registrationInfo.credential;
  const { spki, alg } = spkiOf(c.publicKey);
  return { credential: c.id, cose: Buffer.from(c.publicKey).toString("base64url"), spki, alg, counter: c.counter, transports: c.transports };
}

/** A COSE public key as SubjectPublicKeyInfo and its algorithm, for the key file (P16 section 7). */
export function spkiOf(coseKey: Uint8Array): { spki: string; alg: (typeof PASSKEY_ALGS)[number] } {
  const key = isoCBOR.decodeFirst<cose.COSEPublicKey>(new Uint8Array(coseKey));
  const alg = key.get(cose.COSEKEYS.alg);
  const b64 = (b: Uint8Array | undefined) => Buffer.from(b ?? new Uint8Array()).toString("base64url");
  let jwk: Record<string, string>;
  if (alg === -7 && cose.isCOSEPublicKeyEC2(key) && key.get(cose.COSEKEYS.crv) === cose.COSECRV.P256) jwk = { kty: "EC", crv: "P-256", x: b64(key.get(cose.COSEKEYS.x)), y: b64(key.get(cose.COSEKEYS.y)) };
  else if (alg === -8 && cose.isCOSEPublicKeyOKP(key) && key.get(cose.COSEKEYS.crv) === cose.COSECRV.ED25519) jwk = { kty: "OKP", crv: "Ed25519", x: b64(key.get(cose.COSEKEYS.x)) };
  else if (alg === -257 && cose.isCOSEPublicKeyRSA(key)) jwk = { kty: "RSA", n: b64(key.get(cose.COSEKEYS.n)), e: b64(key.get(cose.COSEKEYS.e)) };
  else throw new Error(`a passkey with COSE algorithm ${String(alg)}: Baesian's proofs take ES256, EdDSA or RS256`);
  const spki = createPublicKey({ key: jwk, format: "jwk" }).export({ format: "der", type: "spki" });
  return { spki: Buffer.from(spki).toString("base64url"), alg };
}

/**
 * Options for an assertion: for signing in, any of the site's passkeys (`allow` empty); for an answer or a fresh check,
 * the account's own. A challenge given is used as it is, as a passkey proof's is a file's digest (P16 section 7).
 */
export function authenticationOptions(rp: RelyingParty, allow: { credential: string; transports: string | null }[], challenge?: Uint8Array): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: allow.map((p) => ({ id: p.credential, ...(p.transports ? { transports: JSON.parse(p.transports) } : {}) })),
    userVerification: "required",
    timeout: CEREMONY_MS,
    ...(challenge ? { challenge: new Uint8Array(challenge) } : {}),
  });
}

/** An assertion, checked against the challenge and the passkey's key; returns its new counter, or throws with why. */
export async function verifyAssertion(rp: RelyingParty, response: AuthenticationResponseJSON, challenge: string, passkey: StoredPasskey): Promise<number> {
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: { id: passkey.credential, publicKey: new Uint8Array(Buffer.from(passkey.cose, "base64url")), counter: passkey.counter, ...(passkey.transports ? { transports: JSON.parse(passkey.transports) } : {}) },
    requireUserVerification: true,
  });
  if (!v.verified) throw new Error("the passkey's signature doesn't check");
  return v.authenticationInfo.newCounter;
}

/** A passkey's key file (P16 section 7, `PasskeyKey`), the same bytes in every project, and the line CI pins (D159). */
export function keyFile(passkey: Pick<StoredPasskey, "credential" | "spki" | "alg" | "enrolled">, account: string, handle: string): PasskeyKey {
  return { type: "passkey-key", format: newestFormat("passkey-key"), account, handle, credential: passkey.credential, public_key: passkey.spki, alg: passkey.alg as PasskeyKey["alg"], enrolled: passkey.enrolled };
}

/** The line to add to `BAESIAN_TRUST` in CI's settings, so `baesian verify` trusts this passkey's proofs (D159). */
export const pinLine = (key: PasskeyKey): string => JSON.stringify(asWritten("passkey-key", key));

/** A short name for a passkey, from its transports: "a passkey on this device", "a security key". */
export function passkeyName(transports: string[] | undefined): string {
  if (transports?.includes("internal")) return "a passkey on a device";
  if (transports?.includes("hybrid")) return "a passkey on a phone";
  if (transports?.some((t) => t === "usb" || t === "nfc" || t === "ble")) return "a security key";
  return "a passkey";
}
