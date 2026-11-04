// The service's secrets, which `wrangler types` can't see in wrangler.jsonc: set with `wrangler secret put` when deployed
// (M9f), and in .dev.vars for a local run (scripts/dev-vars.mjs writes one). Never in the repo.
declare namespace Cloudflare {
  interface Env {
    /** The service's Ed25519 signing key, PKCS #8 in PEM (D160). */
    SERVICE_SIGNING_KEY?: string;
    /** The stand-in for sign-in's grants, as JSON: local development and tests only, beside the real sign-in. */
    BAESIAN_DEV_ACCESS?: string;
    /** Turnstile's secret key (B-1a03b). Locally and in tests, Cloudflare's published test secrets. */
    TURNSTILE_SECRET?: string;
    /** The Globus app's client secret (B-s76hg), from its registration at app.globus.org. */
    GLOBUS_CLIENT_SECRET?: string;
    /** The VAPID key for web push (RFC 8292, B-nk97q): a P-256 private key as a JWK. Without it, nothing is pushed. */
    VAPID_KEY?: string;
  }
}
