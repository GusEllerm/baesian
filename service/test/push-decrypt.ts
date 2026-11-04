import { b64url, ecdh, fromB64url } from "../src/push.js";

// A browser's side of web push, for the tests (B-nk97q): a subscription made with a key pair the test holds, and reading a
// push as the browser would: its body decrypted (RFC 8291) and its VAPID token checked (RFC 8292). Used by the relay's
// stand-in push service in workerd (push-service.ts) and by the website's browser tests in Node (e2e/site.ts), so it
// imports nothing but Web Crypto and the service's own encoding helpers.

const enc = new TextEncoder();

/** A browser's subscription, made in the test: its endpoint, its public keys, and its private key to decrypt with. */
export interface TestBrowser {
  endpoint: string;
  p256dh: string;
  auth: string;
  privateKey: CryptoKey;
}

/** A push as a stand-in push service received it, decrypted. */
export interface Received {
  endpoint: string;
  headers: Record<string, string>;
  /** The VAPID token's claims, and whether its signature checks against `k=`. */
  vapid: { claims: { aud: string; exp: number; sub: string }; k: string; verified: boolean };
  message: { title: string; body: string; url: string; tag: string };
  /** The body's length, header included. */
  length: number;
}

let n = 0;
/** A new browser's subscription at a stand-in push service. */
export async function testBrowser(host = "push.test"): Promise<TestBrowser> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  n += 1;
  return {
    endpoint: `https://${host}/send/${n}-${b64url(crypto.getRandomValues(new Uint8Array(8)))}`,
    p256dh: b64url(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer)),
    auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
    privateKey: pair.privateKey,
  };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Decrypt a push's body as the browser does (RFC 8291 and RFC 8188), dropping the padding after the delimiter. */
export async function decrypt(body: Uint8Array, to: { p256dh: string; auth: string; privateKey: CryptoKey }): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh(asKey), to.privateKey, 256));
  const uaPublic = fromB64url(to.p256dh);
  const keyInfo = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(fromB64url(to.auth), shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aes, cipher));
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end--;
  if (record[end] !== 2) throw new Error("the last record doesn't end with the delimiter 0x02");
  return record.slice(0, end);
}

/** Check a VAPID token's ES256 signature against the public key `k=` names. */
export async function verifyToken(token: string, k: string): Promise<boolean> {
  const [h, c, s] = token.split(".");
  const key = await crypto.subtle.importKey("raw", fromB64url(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64url(s!), enc.encode(`${h}.${c}`));
}

/** Read a push as its browser would: the message decrypted, the token's claims, and whether the token checks. */
export async function readPush(endpoint: string, headers: Record<string, string>, body: Uint8Array, browser: { p256dh: string; auth: string; privateKey: CryptoKey }): Promise<Received> {
  const auth = headers.authorization ?? "";
  const t = /t=([^,\s]+)/.exec(auth)?.[1] ?? "";
  const k = /k=([^,\s]+)/.exec(auth)?.[1] ?? "";
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(t.split(".")[1] ?? ""))) as Received["vapid"]["claims"];
  const message = JSON.parse(new TextDecoder().decode(await decrypt(body, browser))) as Received["message"];
  return { endpoint, headers, vapid: { claims, k, verified: await verifyToken(t, k) }, message, length: body.byteLength };
}
