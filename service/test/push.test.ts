import { describe, expect, it } from "vitest";
import { PADDED, type Steps, TOKEN_LIFE_S, TOKEN_REUSE_MS, Vapid, b64url, encrypt, fromB64url, keysFrom, sendPush, topicOf, vapidKey } from "../src/push.js";
import { PushStandIn, decrypt, testBrowser } from "./push-service.js";

// Web push on Web Crypto (B-nk97q): the encryption against RFC 8291's own example (section 5) and the intermediate values
// in its Appendix A, and the VAPID token (RFC 8292) within Apple's limits.

// RFC 8291 section 5 and Appendix A (https://www.rfc-editor.org/rfc/rfc8291.html), all base64url.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  ecdhSecret: "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs",
  keyInfo: "V2ViUHVzaDogaW5mbwAEJXGyvs3942BVGq8e0PTNNmwRzr5VX4m8t7GGpTM5FzFo7OLr4BhZe9MEebhuPI-OztV3ylkYfpJGmQ22ggCLDgT-M_SrDepxkU21WCP3O1SUj0EwbZIHMtu5pZpTKGSCIA5Zent7wmC6HCJ5mFgJkuk5cwAvMBKiiujwa7t45ewP",
  ikm: "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg",
  prk: "09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc",
  cek: "oIhVW04MRdy2XN9CiKLxTg",
  nonce: "4h_95klXJ5E_qnoN",
  header: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** The browser of RFC 8291's example: its key pair and auth secret. */
async function rfcBrowser() {
  const ua = await keysFrom(RFC.uaPrivate, RFC.uaPublic);
  return { p256dh: RFC.uaPublic, auth: RFC.authSecret, privateKey: ua.privateKey };
}

describe("aes128gcm encryption (RFC 8291)", () => {
  it("makes RFC 8291's example exactly, with its keys and salt, and every intermediate value in Appendix A", async () => {
    let steps: Steps | undefined;
    const body = await encrypt(new TextEncoder().encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.authSecret }, { server: await keysFrom(RFC.asPrivate, RFC.asPublic), salt: fromB64url(RFC.salt), steps: (s) => (steps = s) });
    expect(b64url(steps!.ecdhSecret)).toBe(RFC.ecdhSecret);
    expect(b64url(steps!.keyInfo)).toBe(RFC.keyInfo);
    expect(b64url(steps!.ikm)).toBe(RFC.ikm);
    expect(b64url(steps!.prk)).toBe(RFC.prk);
    expect(b64url(steps!.cek)).toBe(RFC.cek);
    expect(b64url(steps!.nonce)).toBe(RFC.nonce);
    expect(b64url(steps!.header)).toBe(RFC.header);
    expect(b64url(body)).toBe(RFC.body);
  });

  it("decrypts RFC 8291's example body as the browser of its example", async () => {
    expect(new TextDecoder().decode(await decrypt(fromB64url(RFC.body), await rfcBrowser()))).toBe(RFC.plaintext);
  });

  it("pads every message to the same length, so it doesn't say how long a project's name is, and a fresh key and salt each time", async () => {
    const b = await testBrowser();
    const short = await encrypt(new TextEncoder().encode("a"), b, { pad: PADDED });
    const long = await encrypt(new TextEncoder().encode("a".repeat(300)), b, { pad: PADDED });
    expect(short.byteLength).toBe(long.byteLength);
    expect(short.byteLength).toBe(86 + PADDED + 16);
    expect(new TextDecoder().decode(await decrypt(long, b))).toBe("a".repeat(300));
    const again = await encrypt(new TextEncoder().encode("a"), b, { pad: PADDED });
    expect(b64url(again.slice(0, 16))).not.toBe(b64url(short.slice(0, 16)));
    expect(b64url(again.slice(21, 86))).not.toBe(b64url(short.slice(21, 86)));
  });

  it("refuses a message too long for one record of 4,096 octets, and keys that aren't a browser's", async () => {
    const b = await testBrowser();
    await expect(encrypt(new Uint8Array(3994), b)).rejects.toThrow(/at most 3993/);
    await expect(encrypt(new Uint8Array(3993), b)).resolves.toHaveLength(4096);
    await expect(encrypt(new Uint8Array(1), { p256dh: b.p256dh, auth: b64url(new Uint8Array(8)) })).rejects.toThrow(/16 bytes/);
    await expect(encrypt(new Uint8Array(1), { p256dh: b64url(new Uint8Array(33)), auth: b.auth })).rejects.toThrow(/65 bytes/);
  });
});

/** A VAPID key as the secret holds it: a P-256 private key, as a JWK. */
async function vapidSecret(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
}

const claimsOf = (token: string) => JSON.parse(new TextDecoder().decode(fromB64url(token.split(".")[1]!))) as { aud: string; exp: number; sub: string };

describe("the VAPID token (RFC 8292)", () => {
  it("is an ES256 JWT for the push service's origin, from the website, expiring 12 hours ahead, which checks against the public key", async () => {
    const key = await vapidKey(await vapidSecret());
    const now = Date.UTC(2026, 10, 4, 12);
    const v = new Vapid(key, "https://baesian.test", () => now);
    const header = await v.authorization("https://push.test/send/abc?x=1");
    const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(key.publicKey);
    expect(fromB64url(k!)).toHaveLength(65);
    const [h, c, s] = t!.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h!)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(claimsOf(t!)).toEqual({ aud: "https://push.test", exp: now / 1000 + TOKEN_LIFE_S, sub: "https://baesian.test" });
    // Apple: an expiry "more than one day into the future" is refused.
    expect(TOKEN_LIFE_S).toBeLessThanOrEqual(86_400);
    const pub = await crypto.subtle.importKey("raw", fromB64url(k!), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(fromB64url(s!)).toHaveLength(64);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(s!), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });

  it("reuses a token for an hour per push service, then signs a new one", async () => {
    let now = Date.UTC(2026, 10, 4, 12);
    const v = new Vapid(await vapidKey(await vapidSecret()), "mailto:push@baesian.test", () => now);
    const first = await v.token("https://push.test");
    now += TOKEN_REUSE_MS - 1000;
    expect(await v.token("https://push.test")).toBe(first);
    expect(await v.token("https://other.test")).not.toBe(first);
    now += 2000;
    const next = await v.token("https://push.test");
    expect(next).not.toBe(first);
    expect(claimsOf(next).exp).toBe(Math.floor(now / 1000) + TOKEN_LIFE_S);
  });

  it("takes only an https: URL or a mailto: address as its subject, and a P-256 JWK as its key", async () => {
    const key = await vapidKey(await vapidSecret());
    expect(() => new Vapid(key, "baesian.test")).toThrow(/https: URL or a mailto:/);
    expect(() => new Vapid(key, "http://baesian.test")).toThrow(/https: URL or a mailto:/);
    expect(() => new Vapid(key, "mailto:someone@baesian.test")).not.toThrow();
    await expect(vapidKey("not json")).rejects.toThrow(/isn't JSON/);
    await expect(vapidKey(JSON.stringify({ kty: "OKP", crv: "Ed25519" }))).rejects.toThrow(/P-256 private key/);
  });
});

describe("sending a push", () => {
  it("sends the message encrypted, with the token, TTL, Urgency and a Topic of at most 32 characters; 404 and 410 are gone", async () => {
    const service = new PushStandIn();
    try {
      const b = await service.browser();
      const vapid = new Vapid(await vapidKey(await vapidSecret()), "https://baesian.test");
      const topic = await topicOf("proj-a");
      expect(topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(await topicOf("proj-a")).toBe(topic);
      expect(await topicOf("proj-b")).not.toBe(topic);
      const message = { title: "2 cards waiting in Shop (1 hard)", body: "Open them to answer.", url: "/projects/proj-a", tag: "proj-a" };
      expect(await sendPush(b, message, { vapid, urgency: "high", topic })).toEqual({ result: "delivered", status: 201 });
      const [got] = service.to(b);
      expect(got!.message).toEqual(message);
      expect(got!.headers).toMatchObject({ "content-encoding": "aes128gcm", ttl: "86400", urgency: "high", topic });
      expect(got!.vapid).toMatchObject({ verified: true, claims: { aud: "https://push.test", sub: "https://baesian.test" } });
      service.answer(b, 410);
      expect(await sendPush(b, message, { vapid, urgency: "normal", topic })).toEqual({ result: "gone", status: 410 });
      service.answer(b, 404);
      expect((await sendPush(b, message, { vapid, urgency: "normal", topic })).result).toBe("gone");
      service.answer(b, 500);
      expect((await sendPush(b, message, { vapid, urgency: "normal", topic })).result).toBe("failed");
    } finally {
      service.restore();
    }
  });
});
