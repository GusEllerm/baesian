// The relay's secrets, which `wrangler types` can't see in wrangler.jsonc: set with `wrangler secret put` when deployed
// (M9f), and in .dev.vars for a local run (scripts/dev-vars.mjs writes one). Never in the repo.
declare namespace Cloudflare {
  interface Env {
    /** The service's Ed25519 signing key, PKCS #8 in PEM (D160). */
    SERVICE_SIGNING_KEY?: string;
    /** The stand-in for sign-in's grants, as JSON: local development and tests only (M9c replaces it). */
    BAESIAN_DEV_ACCESS?: string;
  }
}
