import { Buffer } from "node:buffer";
import { createHash, createPublicKey, randomBytes } from "node:crypto";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { RP_ID, TestPasskey } from "../../test/service.js";

// A browser's passkey, for the relay's tests: M9a's `TestPasskey` (test/service.ts), whose assertions `baesian verify`
// already checks, plus what registration needs, an attestation object built here, with attestation "none". What it
// returns is what @simplewebauthn/browser's startRegistration() and startAuthentication() send.

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** The passkey's public key as COSE, the form an authenticator gives it at registration. */
export function coseKey(p: TestPasskey): Uint8Array {
  const jwk = createPublicKey({ key: p.spki, format: "der", type: "spki" }).export({ format: "jwk" }) as Record<string, string>;
  const b = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
  const map = new Map<number, number | Uint8Array>();
  if (p.alg === -7) [[1, 2], [3, -7], [-1, 1], [-2, b(jwk.x!)], [-3, b(jwk.y!)]].forEach(([k, v]) => map.set(k as number, v as number | Uint8Array));
  else if (p.alg === -8) [[1, 1], [3, -8], [-1, 6], [-2, b(jwk.x!)]].forEach(([k, v]) => map.set(k as number, v as number | Uint8Array));
  else [[1, 3], [3, -257], [-1, b(jwk.n!)], [-2, b(jwk.e!)]].forEach(([k, v]) => map.set(k as number, v as number | Uint8Array));
  return isoCBOR.encode(map);
}

export interface Ceremony {
  origin?: string;
  rpId?: string;
  /** The authenticator data's flags: user present (1), user verified (4), attested credential data (0x40). */
  flags?: number;
  type?: string;
  crossOrigin?: boolean;
}

/** A browser's passkey: a `TestPasskey` that can also be registered. */
export class WebPasskey extends TestPasskey {
  /** The passkey's ID as the browser gives it: base64url, as `TestPasskey.credential` is. */
  get id(): string {
    return this.credential;
  }

  /**
   * What the browser sends after `navigator.credentials.create()` with the relay's options: client data of type
   * `webauthn.create` with the challenge, and an attestation object, format "none", whose authenticator data carries the
   * credential's ID and public key.
   */
  register(challenge: string, over: Ceremony = {}): RegistrationResponseJSON {
    const clientData = Buffer.from(JSON.stringify({ type: over.type ?? "webauthn.create", challenge, origin: over.origin ?? "https://baesian.test", crossOrigin: over.crossOrigin ?? false }));
    const credId = Buffer.from(this.credential, "base64url");
    const len = Buffer.alloc(2);
    len.writeUInt16BE(credId.length);
    const authData = Buffer.concat([sha256(over.rpId ?? RP_ID), Buffer.from([over.flags ?? 0x45]), Buffer.alloc(4), Buffer.alloc(16), len, credId, Buffer.from(coseKey(this))]);
    const attestationObject = isoCBOR.encode(new Map<string, Uint8Array | string | Map<string, never>>([["fmt", "none"], ["attStmt", new Map<string, never>()], ["authData", new Uint8Array(authData)]]));
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      clientExtensionResults: {},
      response: { clientDataJSON: clientData.toString("base64url"), attestationObject: Buffer.from(attestationObject).toString("base64url"), transports: ["internal"] },
    };
  }

  /**
   * What the browser sends after `navigator.credentials.get()`: `TestPasskey.prove`'s assertion, over `bytes` (a file's,
   * whose digest is the challenge) or with the challenge given.
   */
  sign(challenge: string, over: Ceremony = {}): AuthenticationResponseJSON {
    const p = this.prove("-", Buffer.alloc(0), { challenge, ...(over.origin ? { origin: over.origin } : {}), ...(over.rpId ? { rpId: over.rpId } : {}), ...(over.flags !== undefined ? { flags: over.flags } : {}), ...(over.type ? { type: over.type } : {}), ...(over.crossOrigin !== undefined ? { crossOrigin: over.crossOrigin } : {}) });
    return { id: this.id, rawId: this.id, type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: p.client_data, authenticatorData: p.authenticator_data, signature: p.signature } };
  }
}

/** A random challenge, as the relay makes one. */
export const randomChallenge = () => randomBytes(32).toString("base64url");
