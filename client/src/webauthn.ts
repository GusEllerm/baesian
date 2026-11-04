// Passkeys in the browser (M9e): the service sends WebAuthn's options as JSON, as SimpleWebAuthn makes them (B-jp22m),
// with every binary field in base64url, and takes the browser's answer back the same way. This turns one into the other
// around `navigator.credentials`, with no dependency, and says in words what went wrong.

/** A credential the options name: by its ID, base64url. */
interface CredentialJSON {
  id: string;
  type: "public-key";
  transports?: string[];
}

/** What the service sends to make a passkey (`registrationOptions()`). */
export interface CreationOptionsJSON {
  challenge: string;
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout?: number;
  excludeCredentials?: CredentialJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputs;
}

/** What the service sends to use one (`authenticationOptions()`). */
export interface RequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: CredentialJSON[];
  userVerification?: UserVerificationRequirement;
  extensions?: AuthenticationExtensionsClientInputs;
}

const toBytes = (b64url: string): ArrayBuffer => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const toText = (buf: ArrayBuffer | ArrayBufferView): string => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const descriptor = (c: CredentialJSON): PublicKeyCredentialDescriptor => ({ id: toBytes(c.id), type: c.type, ...(c.transports ? { transports: c.transports as AuthenticatorTransport[] } : {}) });

/** Why a passkey ceremony failed, in words for the person, with what to do. */
export class PasskeyFailed extends Error {}

function words(e: unknown, making: boolean): PasskeyFailed {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return new PasskeyFailed("the passkey wasn't used: it was cancelled, or took too long. Try again");
  if (name === "InvalidStateError" && making) return new PasskeyFailed("this device already holds a passkey for your account. Use another device or security key, or sign in with the one you have");
  if (name === "SecurityError") return new PasskeyFailed("this page's address doesn't match the site's passkeys. Open the site at its own address and try again");
  if (name === "NotSupportedError") return new PasskeyFailed("this browser or device can't make a passkey of a kind the site takes. Try another browser, or a security key");
  if (typeof PublicKeyCredential === "undefined") return new PasskeyFailed("this browser doesn't support passkeys. Use a recent Safari, Chrome, Edge or Firefox");
  return new PasskeyFailed(`the passkey didn't work (${e instanceof Error ? e.message : String(e)}). Try again`);
}

/** Make a passkey with the service's options; the browser's answer, as the service reads it. */
export async function makePasskey(o: CreationOptionsJSON): Promise<unknown> {
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        challenge: toBytes(o.challenge),
        rp: o.rp,
        user: { id: toBytes(o.user.id), name: o.user.name, displayName: o.user.displayName },
        pubKeyCredParams: o.pubKeyCredParams,
        ...(o.timeout ? { timeout: o.timeout } : {}),
        ...(o.excludeCredentials ? { excludeCredentials: o.excludeCredentials.map(descriptor) } : {}),
        ...(o.authenticatorSelection ? { authenticatorSelection: o.authenticatorSelection } : {}),
        ...(o.attestation ? { attestation: o.attestation } : {}),
        ...(o.extensions ? { extensions: o.extensions } : {}),
      },
    })) as PublicKeyCredential;
  } catch (e) {
    throw words(e, true);
  }
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toText(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toText(r.clientDataJSON),
      attestationObject: toText(r.attestationObject),
      ...(typeof r.getTransports === "function" ? { transports: r.getTransports() } : {}),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
    ...(cred.authenticatorAttachment ? { authenticatorAttachment: cred.authenticatorAttachment } : {}),
  };
}

/** Use a passkey with the service's options; the browser's assertion, as the service reads it. */
export async function signWithPasskey(o: RequestOptionsJSON): Promise<unknown> {
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: toBytes(o.challenge),
        ...(o.timeout ? { timeout: o.timeout } : {}),
        ...(o.rpId ? { rpId: o.rpId } : {}),
        ...(o.allowCredentials ? { allowCredentials: o.allowCredentials.map(descriptor) } : {}),
        ...(o.userVerification ? { userVerification: o.userVerification } : {}),
        ...(o.extensions ? { extensions: o.extensions } : {}),
      },
    })) as PublicKeyCredential;
  } catch (e) {
    throw words(e, false);
  }
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toText(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toText(r.clientDataJSON),
      authenticatorData: toText(r.authenticatorData),
      signature: toText(r.signature),
      ...(r.userHandle ? { userHandle: toText(r.userHandle) } : {}),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
    ...(cred.authenticatorAttachment ? { authenticatorAttachment: cred.authenticatorAttachment } : {}),
  };
}
