// Turnstile, Cloudflare's bot check, on sign-up and on every request that sends an emailed code (B-1a03b), in managed
// mode on the website (M9e). The service checks each token with Cloudflare's siteverify before sending mail. Cloudflare
// publishes test keys that always pass or always fail; locally and in tests those are answered here, with no network,
// and production refuses them.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's published test secrets, and what siteverify says to each (developers.cloudflare.com/turnstile). */
export const TEST_SECRETS: Record<string, { success: boolean; error?: string }> = {
  "1x0000000000000000000000000000000AA": { success: true },
  "2x0000000000000000000000000000000AA": { success: false, error: "invalid-input-response" },
  "3x0000000000000000000000000000000AA": { success: false, error: "timeout-or-duplicate" },
};

/** Whether a token passes, and why not. */
export type Verdict = { ok: true } | { ok: false; why: string };

export interface Turnstile {
  check(token: unknown, address: string | undefined): Promise<Verdict>;
}

/**
 * Turnstile with the service's secret. In production a missing or test secret refuses everything (the check must never be
 * switched off by a misconfiguration); locally, a test secret is answered as Cloudflare would answer it.
 */
export function turnstile(secret: string | undefined, local: boolean, fetcher: typeof fetch = fetch): Turnstile {
  return {
    async check(token, address) {
      if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, why: "the bot check's token is missing: the page sends it as `turnstile`" };
      if (!secret) return { ok: false, why: "the bot check isn't set up on this service (TURNSTILE_SECRET)" };
      const test = TEST_SECRETS[secret];
      if (test) {
        if (!local) return { ok: false, why: "the bot check has a test key in production: set the real TURNSTILE_SECRET" };
        return test.success ? { ok: true } : { ok: false, why: `the bot check failed (${test.error})` };
      }
      const body = new FormData();
      body.append("secret", secret);
      body.append("response", token);
      if (address) body.append("remoteip", address);
      let result: { success?: boolean; "error-codes"?: string[] };
      try {
        const r = await fetcher(SITEVERIFY, { method: "POST", body });
        result = (await r.json()) as typeof result;
      } catch (e) {
        return { ok: false, why: `the bot check couldn't be reached (${e instanceof Error ? e.message : String(e)})` };
      }
      return result.success === true ? { ok: true } : { ok: false, why: `the bot check failed (${(result["error-codes"] ?? []).join(", ") || "no reason given"})` };
    },
  };
}
