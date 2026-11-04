import { Buffer } from "node:buffer";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

// A stand-in for Globus Auth, for the tests (D176: never contact Globus): its discovery document, its keys, and a token
// endpoint that checks the client's secret (client_secret_basic) and PKCE's verifier, and returns an ID token signed
// RS512, as Globus's are. The authorization page is the test's: `authorize()` stands in for the person signing in there.

export const ISSUER = "https://globus.test";

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

interface Grant {
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  sub: string;
  email: string | undefined;
}

/** What to get wrong in the ID token, one thing at a time. */
export interface Tamper {
  nonce?: string;
  iss?: string;
  aud?: string;
  /** Sign with a key that isn't in the published set. */
  otherKey?: boolean;
  exp?: number;
}

export class GlobusStandIn {
  private readonly key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  private readonly otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  private readonly kid = randomBytes(6).toString("hex");
  private readonly codes = new Map<string, Grant & { tamper: Tamper }>();
  /** Every request the service made to it. */
  readonly asked: string[] = [];

  constructor(
    readonly clientId: string,
    readonly clientSecret: string,
  ) {}

  /** The service's way to the network, in the tests: everything goes here, and anything not Globus's is refused. */
  readonly fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    this.asked.push(`${request.method} ${request.url}`);
    const url = new URL(request.url);
    if (url.origin !== ISSUER) throw new Error(`the tests reach no network: ${request.url}`);
    if (url.pathname === "/.well-known/openid-configuration") {
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/v2/oauth2/authorize`,
        token_endpoint: `${ISSUER}/v2/oauth2/token`,
        jwks_uri: `${ISSUER}/jwk.json`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS512"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        scopes_supported: ["openid", "email", "profile"],
      });
    }
    if (url.pathname === "/jwk.json") {
      const jwk = this.key.publicKey.export({ format: "jwk" });
      return Response.json({ keys: [{ ...jwk, kid: this.kid, alg: "RS512", use: "sig" }] });
    }
    if (url.pathname === "/v2/oauth2/token" && request.method === "POST") return this.token(request);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  /**
   * The person signs in at Globus and consents: from the authorization URL the service sent the browser to, the URL
   * Globus sends the browser back to, with a code.
   */
  authorize(location: string, who: { sub: string; email?: string }, tamper: Tamper = {}): string {
    const url = new URL(location);
    if (url.origin + url.pathname !== `${ISSUER}/v2/oauth2/authorize`) throw new Error(`not Globus's authorization page: ${location}`);
    const q = url.searchParams;
    if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256") throw new Error("not a code flow with PKCE");
    const code = randomBytes(16).toString("hex");
    this.codes.set(code, { clientId: q.get("client_id")!, redirectUri: q.get("redirect_uri")!, challenge: q.get("code_challenge")!, nonce: q.get("nonce")!, sub: who.sub, email: who.email, tamper });
    const back = new URL(q.get("redirect_uri")!);
    back.searchParams.set("code", code);
    back.searchParams.set("state", q.get("state")!);
    return back.href;
  }

  private async token(request: Request): Promise<Response> {
    const auth = request.headers.get("authorization") ?? "";
    // As Globus reads it: the ID and secret as they are, not form-decoded.
    const plain = Buffer.from(auth.replace(/^Basic /, ""), "base64").toString();
    const at = plain.indexOf(":");
    const [id, secret] = [plain.slice(0, at), plain.slice(at + 1)];
    if (id !== this.clientId || secret !== this.clientSecret) return Response.json({ error: "invalid_client" }, { status: 401 });
    const form = new URLSearchParams(await request.text());
    const grant = this.codes.get(form.get("code") ?? "");
    this.codes.delete(form.get("code") ?? "");
    if (!grant || form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== grant.redirectUri) return Response.json({ error: "invalid_grant" }, { status: 400 });
    if (b64(createHash("sha256").update(form.get("code_verifier") ?? "").digest()) !== grant.challenge) return Response.json({ error: "invalid_grant", error_description: "PKCE" }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const t = grant.tamper;
    const header = b64(JSON.stringify({ alg: "RS512", kid: this.kid, typ: "JWT" }));
    const payload = b64(
      JSON.stringify({ iss: t.iss ?? ISSUER, sub: grant.sub, aud: t.aud ?? grant.clientId, iat: now, exp: t.exp ?? now + 172800, nonce: t.nonce ?? grant.nonce, ...(grant.email ? { email: grant.email } : {}), identity_set: [{ sub: grant.sub }] }),
    );
    const signature = b64(sign("sha512", Buffer.from(`${header}.${payload}`), t.otherKey ? this.otherKey : this.key.privateKey));
    return Response.json({ access_token: randomBytes(16).toString("hex"), token_type: "Bearer", expires_in: 172800, scope: "openid email", id_token: `${header}.${payload}.${signature}` });
  }
}
