import { ProjectId } from "../../src/schema.js";
import { type Accounts, LIMITS } from "./accounts.js";
import { addressOf } from "./http.js";

// A machine's sign-in (M9c's side of `baesian login`, which is M9d's), through OAuth's standard endpoints (B-t5wxr):
// the device authorization grant (RFC 8628), refresh tokens that rotate, a reused one revoking its grant (RFC 6749
// section 6, RFC 9700), and revocation (RFC 7009). One grant per machine and project (B-84e0d). Requests are
// form-encoded and replies JSON, as the RFCs have them; errors are OAuth's.

/** The only client: Baesian's own CLI, a public client with no secret (RFC 8628 section 3.1). */
export const CLIENT_ID = "baesian-cli";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const json = (status: number, body: unknown) => new Response(`${JSON.stringify(body)}\n`, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache" } });
/** An OAuth error (RFC 6749 section 5.2). */
const oauthError = (error: string, description: string, status = 400) => json(status, { error, error_description: description });

/** A form's fields (RFC 6749 appendix B), or the error refusing it. */
async function form(request: Request): Promise<URLSearchParams | Response> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) return oauthError("invalid_request", "send application/x-www-form-urlencoded, as OAuth does");
  const text = await request.text();
  if (text.length > 8192) return oauthError("invalid_request", "the request is too large");
  return new URLSearchParams(text);
}

/** A machine's name, as the approval page and the Machines page show it: the hostname the CLI sends (B-7bq05). */
const MACHINE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u;

/** The addresses under `/v1/machines/`: `device`, `token` and `revoke`, each a POST. */
export async function machinesRoute(accounts: Accounts, origin: string, limit: (key: string) => Promise<boolean>, request: Request, url: URL): Promise<Response | undefined> {
  const name = url.pathname.slice("/v1/machines/".length);
  if (!["device", "token", "revoke"].includes(name)) return undefined;
  if (request.method !== "POST") return oauthError("invalid_request", `${url.pathname} takes a POST`, 405);
  if (!(await limit(addressOf(request)))) return oauthError("slow_down", "too many requests from this network: wait a minute", 429);
  const f = await form(request);
  if (f instanceof Response) return f;
  if (name !== "revoke" && f.get("client_id") !== CLIENT_ID) return oauthError("invalid_client", `the client is ${CLIENT_ID}`, 401);

  if (name === "device") {
    // RFC 8628 section 3.1, with two parameters of Baesian's own: the project this grant is for, and the machine's name.
    const project = f.get("project") ?? "";
    const machine = (f.get("machine") ?? "").trim();
    if (!ProjectId.safeParse(project).success) return oauthError("invalid_request", "project: the project's ID, as .baesian/config.json has it");
    if (!MACHINE.test(machine)) return oauthError("invalid_request", "machine: this machine's name, up to 64 letters, digits, spaces, dots, dashes and underscores");
    const { device, user } = await accounts.startDevice(project, machine);
    return json(200, {
      device_code: device,
      user_code: user,
      verification_uri: `${origin}/device`,
      verification_uri_complete: `${origin}/device?code=${user}`,
      expires_in: LIMITS.deviceMs / 1000,
      interval: LIMITS.deviceIntervalS,
    });
  }

  if (name === "token") {
    const grant = f.get("grant_type");
    if (grant === DEVICE_GRANT) {
      const device = f.get("device_code");
      if (!device) return oauthError("invalid_request", "device_code is missing");
      const r = await accounts.pollDevice(device);
      if ("error" in r) {
        const said: Record<string, string> = {
          authorization_pending: "nobody has approved this machine yet",
          slow_down: `poll every ${LIMITS.deviceIntervalS} seconds, no faster`,
          access_denied: "the person refused this machine",
          expired_token: "the code expired: run baesian login again",
          invalid_grant: "no request with this device code, or its tokens were given already",
        };
        return oauthError(r.error, said[r.error]!);
      }
      return tokens(r);
    }
    if (grant === "refresh_token") {
      const refresh = f.get("refresh_token");
      if (!refresh) return oauthError("invalid_request", "refresh_token is missing");
      const r = await accounts.refresh(refresh);
      return "error" in r ? oauthError(r.error, r.why) : tokens(r);
    }
    return oauthError("unsupported_grant_type", `the grant types are ${DEVICE_GRANT} and refresh_token`);
  }

  // RFC 7009: a token is revoked, with its grant; an unknown one is no error, so nothing is learned from the reply.
  const t = f.get("token");
  if (!t) return oauthError("invalid_request", "token is missing");
  await accounts.revokeByToken(t);
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}

/** A token response (RFC 6749 section 5.1), with the grant's project and machine. */
function tokens(r: { grant: { id: string; project: string; machine: string }; access: string; refresh: string }): Response {
  return json(200, { access_token: r.access, token_type: "Bearer", expires_in: LIMITS.accessMs / 1000, refresh_token: r.refresh, project: r.grant.project, machine: r.grant.machine, grant: r.grant.id });
}
