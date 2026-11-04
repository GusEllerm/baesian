import { Buffer } from "node:buffer";

// Web push, built by Baesian's own code on Web Crypto (B-nk97q), with no dependency: each message encrypted to its
// browser as RFC 8291 says (aes128gcm: ECDH on P-256, HKDF and AES-128-GCM, in one record), and a VAPID token naming the
// service (RFC 8292: an ES256 JWT, sent as `Authorization: vapid t=…, k=…`), within Apple's limits: an expiry at most a
// day ahead, a token reused for up to an hour, and a subject that's a URL or `mailto:`. docs/vault/Modules/service.md
// describes it; test/push.test.ts checks it against RFC 8291's own example.

const enc = new TextEncoder();
export const b64url = (b: Uint8Array | ArrayBuffer): string => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("base64url");
export const fromB64url = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64url"));

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

/** A browser's subscription, as `PushSubscription.toJSON()` gives it: where to send, and the keys to encrypt to. */
export interface Subscription {
  endpoint: string;
  /** The browser's P-256 public key, uncompressed (65 bytes), base64url. */
  p256dh: string;
  /** The browser's 16-byte authentication secret, base64url. */
  auth: string;
}

/** RFC 8291's record size: one record, of up to 4,096 octets, which every push service takes. */
export const RECORD_SIZE = 4096;

/** Plaintext is padded to this many octets, so a message's length doesn't say how long a project's name is. */
export const PADDED = 512;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** ECDH's parameters with the other side's public key. Workers' types name the field `$public`; the runtime reads `public`. */
export const ecdh = (other: CryptoKey) => ({ name: "ECDH", public: other }) as unknown as SubtleCryptoDeriveKeyAlgorithm;

/** A P-256 point, uncompressed (0x04, x, y), as a JWK's coordinates. */
const coordinates = (point: Uint8Array) => {
  if (point.byteLength !== 65 || point[0] !== 4) throw new Error("a P-256 public key is 65 bytes, uncompressed, starting 0x04");
  return { x: b64url(point.slice(1, 33)), y: b64url(point.slice(33)) };
};

/** An application server's ECDH key pair, for one message: `generate()` makes a new one each time; a test gives RFC 8291's. */
export interface ServerKeys {
  privateKey: CryptoKey;
  /** Uncompressed, 65 bytes. */
  publicKey: Uint8Array;
}

/** A new ephemeral ECDH key pair, as RFC 8291 has the application server make for every message. */
export async function ephemeralKeys(): Promise<ServerKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicKey: new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer) };
}

/** An ECDH key pair from its private scalar and public point, both base64url (RFC 8291's example gives them so). */
export async function keysFrom(privateB64: string, publicB64: string): Promise<ServerKeys> {
  const publicKey = fromB64url(publicB64);
  const privateKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: privateB64, ...coordinates(publicKey), ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { privateKey, publicKey };
}

/** What `encrypt()` worked out on the way, for a test to compare with RFC 8291's Appendix A. */
export interface Steps {
  ecdhSecret: Uint8Array;
  keyInfo: Uint8Array;
  ikm: Uint8Array;
  prk: Uint8Array;
  cek: Uint8Array;
  nonce: Uint8Array;
  header: Uint8Array;
}

/**
 * Encrypt a message to a browser (RFC 8291 section 3 and 4, `aes128gcm`, RFC 8188): the body of a push, one record, its
 * header carrying the salt, the record size and the server's ephemeral public key. The plaintext is followed by the
 * delimiter 0x02 and padded with zeros to `pad` octets (none, for RFC 8291's example).
 */
export async function encrypt(
  plaintext: Uint8Array,
  to: Pick<Subscription, "p256dh" | "auth">,
  opts: { server?: ServerKeys; salt?: Uint8Array; pad?: number; steps?: (s: Steps) => void } = {},
): Promise<Uint8Array> {
  const uaPublic = fromB64url(to.p256dh);
  const authSecret = fromB64url(to.auth);
  if (authSecret.byteLength !== 16) throw new Error("a subscription's auth secret is 16 bytes");
  const server = opts.server ?? (await ephemeralKeys());
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", ...coordinates(uaPublic), ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh(uaKey), server.privateKey, 256));
  // RFC 8291 section 3.3: key_info = "WebPush: info" || 0x00 || ua_public || as_public; IKM = HKDF(auth_secret, ecdh_secret, key_info, 32).
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, server.publicKey);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  // RFC 8188 section 2.2: PRK = HMAC-SHA-256(salt, IKM); CEK and NONCE from it, with their info strings.
  const prkKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, ikm));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const padTo = Math.max(opts.pad ?? 0, plaintext.byteLength + 1);
  const record = new Uint8Array(padTo);
  record.set(plaintext);
  record[plaintext.byteLength] = 2; // the last (only) record's delimiter; zeros after it are padding
  if (record.byteLength + 16 > RECORD_SIZE - 86) throw new Error(`a push carries at most ${RECORD_SIZE - 86 - 17} octets of text`);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aes, record));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);
  const header = concat(salt, rs, new Uint8Array([server.publicKey.byteLength]), server.publicKey);
  opts.steps?.({ ecdhSecret, keyInfo, ikm, prk, cek, nonce, header });
  return concat(header, cipher);
}

/** The service's VAPID key (RFC 8292), from its secret: a P-256 private key as a JWK, with its public point. */
export interface VapidKey {
  privateKey: CryptoKey;
  /** Uncompressed, base64url: what browsers subscribe with (`applicationServerKey`) and `k=` names. */
  publicKey: string;
}

/** The VAPID key from the secret `VAPID_KEY` (a JWK, as `crypto.subtle.exportKey("jwk", …)` writes a P-256 private key). */
export async function vapidKey(secret: string): Promise<VapidKey> {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(secret) as JsonWebKey;
  } catch {
    throw new Error("VAPID_KEY isn't JSON: it's a P-256 private key as a JWK");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y) throw new Error("VAPID_KEY isn't a P-256 private key as a JWK (kty EC, crv P-256, with d, x and y)");
  const privateKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { privateKey, publicKey: b64url(concat(new Uint8Array([4]), fromB64url(jwk.x), fromB64url(jwk.y))) };
}

/** How long a token says it lasts: 12 hours, under Apple's limit of a day ahead. */
export const TOKEN_LIFE_S = 12 * 3600;
/** How long one token is used before a new one is signed: an hour, as Apple asks ("Don't refresh your JWT more frequently than once per hour"). */
export const TOKEN_REUSE_MS = 3600_000;

/**
 * VAPID tokens (RFC 8292) for one key and subject, one per push service (its origin is the token's audience), each
 * reused for an hour. The subject is the website's address or a `mailto:`, as Apple requires.
 */
export class Vapid {
  private readonly tokens = new Map<string, { token: string; made: number }>();

  constructor(
    readonly key: VapidKey,
    readonly subject: string,
    private readonly clock: () => number = Date.now,
  ) {
    if (!/^(https:\/\/|mailto:)/.test(subject) && !/^http:\/\/localhost(:\d+)?$/.test(subject)) throw new Error(`a VAPID subject is an https: URL or a mailto: address, not ${subject}`);
  }

  /** The `Authorization` header for a push to `endpoint`. */
  async authorization(endpoint: string): Promise<string> {
    return `vapid t=${await this.token(new URL(endpoint).origin)}, k=${this.key.publicKey}`;
  }

  /** A token for a push service's origin: the one made in the last hour, or a new one. */
  async token(audience: string): Promise<string> {
    const now = this.clock();
    const had = this.tokens.get(audience);
    if (had && now - had.made < TOKEN_REUSE_MS) return had.token;
    const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const claims = b64url(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + TOKEN_LIFE_S, sub: this.subject })));
    // Web Crypto's ECDSA signature is r and s, 32 bytes each: JWS's own form for ES256 (RFC 7518 section 3.4).
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.key.privateKey, enc.encode(`${header}.${claims}`));
    const token = `${header}.${claims}.${b64url(signature)}`;
    this.tokens.set(audience, { token, made: now });
    return token;
  }
}

/** The VAPID key's public point from the secret, base64url, for `GET /v1/config`; undefined without a usable secret. */
export function vapidPublicKey(secret: string | undefined): string | undefined {
  if (!secret) return undefined;
  try {
    const jwk = JSON.parse(secret) as JsonWebKey;
    return jwk.kty === "EC" && jwk.crv === "P-256" && jwk.x && jwk.y && jwk.d ? b64url(concat(new Uint8Array([4]), fromB64url(jwk.x), fromB64url(jwk.y))) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The push services the service sends to: the browsers' own (Chrome's and most others' through Google, Firefox's,
 * Safari's, Edge's). A subscription naming any other address is refused, so the service can't be made to post to an
 * arbitrary site. `test` adds the stand-in a local run or a test uses.
 */
export function pushServiceAllowed(endpoint: URL, test = false): boolean {
  const h = endpoint.hostname;
  if (test && h === "push.test") return endpoint.protocol === "https:";
  return endpoint.protocol === "https:" && (["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(h) || h.endsWith(".push.apple.com") || h.endsWith(".notify.windows.com"));
}

/** A subscription as a browser sent it (`PushSubscription.toJSON()`), checked; or why it isn't one. */
export function readSubscription(x: unknown, test = false): Subscription | string {
  const o = typeof x === "object" && x !== null ? (x as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) : {};
  if (typeof o.endpoint !== "string" || o.endpoint.length > 2048) return "send the browser's subscription: { endpoint, keys: { p256dh, auth } }";
  let url: URL;
  try {
    url = new URL(o.endpoint);
  } catch {
    return "the subscription's endpoint isn't an address";
  }
  if (!pushServiceAllowed(url, test)) return `${url.hostname} isn't a push service this site sends to`;
  const p256dh = typeof o.keys?.p256dh === "string" ? o.keys.p256dh : "";
  const auth = typeof o.keys?.auth === "string" ? o.keys.auth : "";
  const key = fromB64url(p256dh);
  if (key.byteLength !== 65 || key[0] !== 4) return "the subscription's p256dh key isn't a P-256 public key";
  if (fromB64url(auth).byteLength !== 16) return "the subscription's auth secret isn't 16 bytes";
  return { endpoint: o.endpoint, p256dh, auth };
}

/** What a push says: a notification's title and body, the page it opens, and its tag, so a newer one replaces it. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** How urgent a push is (RFC 8030 section 5.3): the two Baesian uses. */
export type Urgency = "high" | "normal";

/**
 * A push service's `Topic` for a project (RFC 8030 section 5.4): at most 32 characters of base64url, so a newer push for
 * the project replaces one not yet delivered. Derived from the project's ID, so the push service doesn't see the ID.
 */
export async function topicOf(project: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(`baesian-topic:${project}`))).slice(0, 32);
}

/** What a push service answered: delivered, gone (404 or 410: the subscription is deleted), or failed otherwise. */
export type Sent = { result: "delivered"; status: number } | { result: "gone"; status: number } | { result: "failed"; status: number; why: string };

/** How long a push service keeps a message for a browser that's offline: a day. */
export const PUSH_TTL_S = 86_400;

/** Send one push: encrypted to the subscription, with the VAPID token, TTL, `Urgency` and `Topic`. */
export async function sendPush(sub: Subscription, message: PushMessage, opts: { vapid: Vapid; urgency: Urgency; topic: string; fetch?: typeof fetch }): Promise<Sent> {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub, { pad: PADDED });
  const send = opts.fetch ?? ((input, init) => fetch(input, init));
  let r: Response;
  try {
    r = await send(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: await opts.vapid.authorization(sub.endpoint),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: String(PUSH_TTL_S),
        urgency: opts.urgency,
        topic: opts.topic,
      },
      body,
    });
  } catch (e) {
    return { result: "failed", status: 0, why: e instanceof Error ? e.message : String(e) };
  }
  if (r.status === 404 || r.status === 410) return { result: "gone", status: r.status };
  if (r.ok) return { result: "delivered", status: r.status };
  return { result: "failed", status: r.status, why: (await r.text().catch(() => "")).slice(0, 200) };
}
