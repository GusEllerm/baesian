import * as oauth from "oauth4webapi";

// Signing in and up through Globus (D153, D176), with oauth4webapi (B-s76hg): OpenID Connect's authorization code flow
// with PKCE, the service a confidential client whose secret is a Worker secret (client_secret_basic, the only method
// Globus's discovery lists), and the ID token checked, its signature included. Only `openid` and `email` are asked
// for. Globus's tokens are used once, to learn who signed in, and never kept.

export interface GlobusConfig {
  /** Globus Auth's issuer: `https://auth.globus.org` (wrangler.jsonc's `GLOBUS_ISSUER`). */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Where Globus sends the browser back: the service's own `/v1/globus/callback`. */
  redirectUri: string;
  /** How the Worker reaches Globus: `fetch`, or a stand-in in the tests. */
  fetch: typeof fetch;
}

/** What the service asks Globus for: who you are, and an email address for notices. */
export const SCOPES = "openid email";

/** What a round trip carries from start to callback, kept in the flow: never in the browser. */
export interface RoundTrip {
  state: string;
  nonce: string;
  verifier: string;
}

/** Who Globus says signed in: the ID token's `sub`, and the email it gave, if any. */
export interface GlobusIdentity {
  sub: string;
  email: string | undefined;
}

const options = (c: GlobusConfig) => ({ [oauth.customFetch]: c.fetch });

/** Globus's metadata, from its discovery document, checked to be its own issuer's. */
async function server(c: GlobusConfig): Promise<oauth.AuthorizationServer> {
  const issuer = new URL(c.issuer);
  return oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer, options(c)));
}

const client = (c: GlobusConfig): oauth.Client => ({ client_id: c.clientId });

/** A new round trip's secrets: state, nonce and PKCE's code verifier. */
export const newRoundTrip = (): RoundTrip => ({ state: oauth.generateRandomState(), nonce: oauth.generateRandomNonce(), verifier: oauth.generateRandomCodeVerifier() });

/** Where to send the browser to sign in at Globus. */
export async function authorizationUrl(c: GlobusConfig, trip: RoundTrip): Promise<string> {
  const as = await server(c);
  if (!as.authorization_endpoint) throw new Error("Globus's discovery document names no authorization endpoint");
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", c.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", trip.state);
  url.searchParams.set("nonce", trip.nonce);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(trip.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.href;
}

/**
 * Globus's answer at the callback: the state checked, the code exchanged with the client secret and the PKCE verifier,
 * the ID token's claims checked (issuer, audience, expiry, nonce) and its signature checked against Globus's keys.
 * Throws with why when any of it fails.
 */
export async function identityFrom(c: GlobusConfig, callback: URL, trip: RoundTrip): Promise<GlobusIdentity> {
  const as = await server(c);
  const cl = client(c);
  const params = oauth.validateAuthResponse(as, cl, callback, trip.state);
  const response = await oauth.authorizationCodeGrantRequest(as, cl, oauth.ClientSecretBasic(c.clientSecret), params, c.redirectUri, trip.verifier, options(c));
  const result = await oauth.processAuthorizationCodeResponse(as, cl, response, { expectedNonce: trip.nonce, requireIdToken: true });
  await oauth.validateApplicationLevelSignature(as, response, options(c));
  const claims = oauth.getValidatedIdTokenClaims(result);
  if (!claims?.sub) throw new Error("Globus's ID token names nobody");
  return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}

/** Why oauth4webapi refused, in a line. */
export function whyNot(e: unknown): string {
  if (e instanceof oauth.ResponseBodyError) return `Globus said ${e.error}${e.error_description ? `: ${e.error_description}` : ""}`;
  if (e instanceof oauth.AuthorizationResponseError) return `Globus said ${e.error}${e.error_description ? `: ${e.error_description}` : ""}`;
  return e instanceof Error ? e.message : String(e);
}
