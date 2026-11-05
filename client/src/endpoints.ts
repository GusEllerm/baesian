import { createContext, useContext } from "react";
import { PHONE } from "./media";
import { type PasskeyAsk, confirmWithPasskey } from "./proof";
import type { Wait } from "./waiting";

// Where the desk reads and answers (M9e): the local server's `/api/` (D96), or on the website the relay's addresses for
// one project, `/v1/projects/{project}/…` (B-7z97x), which serve the same state (B-17wn9). The desk is the same either
// way (D130); only these addresses, the hosted client's name on what it sends, and the passkey on a hard answer differ.

export interface Endpoints {
  state: string;
  presence: string;
  verdicts: string;
  aliases: string;
  preferences: string;
  presets: string;
  /**
   * On the website: the project, its name (B-zqkwk), where waiting answers are asked for together, and where the passkey's
   * assertion goes (D139, D163, B-a6xpc).
   */
  hosted?: { project: string; name: string | null; batches: string; proofs: string; live: string };
}

/** `baesian serve`'s API (D96). */
export const LOCAL: Endpoints = {
  state: "/api/state",
  presence: "/api/presence",
  verdicts: "/api/verdicts",
  aliases: "/api/aliases",
  preferences: "/api/preferences",
  presets: "/api/presets",
};

/** One project's addresses on the relay (B-7z97x). */
export function hostedEndpoints(project: string, name: string | null): Endpoints {
  const base = `/v1/projects/${encodeURIComponent(project)}`;
  const ws = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${base}/live`;
  return {
    state: `${base}/state`,
    presence: `${base}/presence`,
    verdicts: `${base}/verdicts`,
    aliases: `${base}/aliases`,
    preferences: `${base}/preferences`,
    presets: `${base}/presets`,
    hosted: { project, name, batches: `${base}/batches`, proofs: `${base}/proofs`, live: ws },
  };
}

export const EndpointsContext = createContext<Endpoints>(LOCAL);
export const useEndpoints = () => useContext(EndpointsContext);

/** Which hosted client is answering (D130), as the relay records it on what it signs: the phone layout, or not. */
export const hostedClient = () => (matchMedia(PHONE).matches ? "hosted-phone" : "hosted-desktop");

const asJson = (x: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(x), credentials: "same-origin" as const });
const reasonOf = (body: unknown, status: number) => (body as { error?: string } | undefined)?.error ?? `the server answered ${status}`;

/**
 * POST an answer as JSON, with the browser's cookie. On the website, an answer that takes the passkey comes back 202
 * (D139, D163). With `wait`, that reply is the caller's: the desk keeps the answer waiting for one tap over several
 * (B-a6xpc). Without it (a change to your preferences), the passkey is asked for at once, for it alone, and the reply is
 * as the relay wrote it; rejects with `NotConfirmed` when the passkey isn't used.
 */
export async function postAnswer(e: Endpoints, url: string, body: unknown, opts: { keepalive?: boolean; client?: boolean; wait?: boolean } = {}): Promise<Response> {
  const sent = e.hosted && opts.client ? { ...(body as object), client: hostedClient() } : body;
  const r = await fetch(url, { ...asJson(sent), ...(opts.keepalive ? { keepalive: true } : {}) });
  if (r.status !== 202 || !e.hosted || opts.wait) return r;
  const { passkey } = (await r.json()) as { passkey: Wait };
  const out = await confirmAnswers(e, [passkey.pending], { kind: "preferences", titles: {}, loosens: true });
  const o = out.outcomes[0];
  const reply = o ? { status: o.status, body: o.body } : { status: 410, body: { error: "it waited too long for your passkey, so it wasn't saved" } };
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
}

/** What became of answers the passkey was asked to confirm together (B-a6xpc). */
export interface Confirmed {
  /** Answers the relay no longer held: they waited too long, and weren't recorded. */
  expired: string[];
  /** Each answer the tap reached, as its own address would have answered: 201 written, or why not. */
  outcomes: { pending: string; status: number; body: unknown }[];
}

/**
 * Ask the passkey to confirm answers waiting for it, together (B-a6xpc): the relay makes their batch and its challenge
 * (`POST batches`), the person taps once (`confirmWithPasskey()`), and the assertion goes to `POST proofs`, which writes
 * each answer. `titles` names each answer's card, by its pending ID, for the prompt. Rejects with `NotConfirmed` when the
 * passkey isn't used, and with the relay's reason when the batch can't be asked for or the assertion isn't taken: the
 * answers wait still.
 */
export async function confirmAnswers(e: Endpoints, pending: string[], about: { kind: PasskeyAsk["kind"]; titles: Record<string, string>; loosens: boolean }): Promise<Confirmed> {
  const hosted = e.hosted!;
  const asked = await fetch(hosted.batches, asJson({ pending }));
  const a = (await asked.json().catch(() => ({}))) as { passkey?: { batch: string; answers: string[]; expired: string[]; options: PasskeyAsk["options"] }; expired?: string[] };
  if (asked.status === 404 && a.expired) return { expired: a.expired, outcomes: [] };
  if (asked.status !== 202 || !a.passkey) throw new Error(reasonOf(a, asked.status));
  const { batch, answers, expired, options } = a.passkey;
  const response = await confirmWithPasskey({ kind: about.kind, titles: answers.map((p) => about.titles[p]).filter((t): t is string => !!t), loosens: about.loosens, options });
  const done = await fetch(hosted.proofs, asJson({ batch, response }));
  const d = (await done.json().catch(() => ({}))) as { answers?: Confirmed["outcomes"] };
  // The batch lasts as long as its last answer: gone, they all are.
  if (done.status === 404) return { expired: [...expired, ...answers], outcomes: [] };
  if (done.status !== 200 || !d.answers) throw new Error(reasonOf(d, done.status));
  return { expired, outcomes: d.answers };
}
