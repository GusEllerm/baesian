// What every address of the service answers with, and how it reads what it's sent.

import type { Reply } from "./relay.js";

export type { Reply } from "./relay.js";

export const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
export const MAX_JSON = 64 * 1024;

/** A reply as a response, with any headers besides (a cookie, say). */
export const respond = ({ status, body }: Reply, extra: Record<string, string> | [string, string][] = []): Response => {
  const headers = new Headers(status === 204 || body === undefined ? { "cache-control": "no-store" } : HEADERS);
  for (const [k, v] of Array.isArray(extra) ? extra : Object.entries(extra)) headers.append(k, v);
  return status === 204 || body === undefined ? new Response(null, { status, headers }) : new Response(`${JSON.stringify(body)}\n`, { status, headers });
};

export const fail = (status: number, error: string, more: Record<string, unknown> = {}) => respond({ status, body: { error, ...more } });

/** A JSON body, or the response refusing it. A form on another site can't send JSON without a preflight, and the service answers no preflight. */
export async function readJson(request: Request): Promise<unknown | Response> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return fail(415, "send application/json");
  const text = await request.text();
  if (text.length > MAX_JSON) return fail(413, "the request is too large");
  try {
    return JSON.parse(text);
  } catch {
    return fail(400, "the request isn't valid JSON");
  }
}

/** A JSON object's fields, or the response refusing it. */
export async function readObject(request: Request): Promise<Record<string, unknown> | Response> {
  const input = await readJson(request);
  if (input instanceof Response) return input;
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : fail(400, "send a JSON object");
}

/** The network address a request came from, used in passing for limits and never stored (B-7bq05). */
export const addressOf = (request: Request): string => request.headers.get("cf-connecting-ip") ?? "unknown";

/** A short name for a browser, from what it says of itself: "Firefox on a Mac". Only this is kept (B-7bq05). */
export function browserName(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : undefined;
  const os = /iPhone/.test(ua) ? "an iPhone" : /iPad/.test(ua) ? "an iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "a Mac" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "a Chromebook" : /Linux/.test(ua) ? "Linux" : undefined;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? (os ? `a browser on ${os}` : "a browser");
}
