import { createContext, useContext } from "react";
import { PHONE } from "./media";
import { type PasskeyAsk, confirmWithPasskey } from "./proof";

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
  /** On the website: the project, its name (B-zqkwk), and where an answer's passkey proof goes (D139, D163). */
  hosted?: { project: string; name: string | null; proofs: string; live: string };
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
    hosted: { project, name, proofs: `${base}/proofs`, live: ws },
  };
}

export const EndpointsContext = createContext<Endpoints>(LOCAL);
export const useEndpoints = () => useContext(EndpointsContext);

/** Which hosted client is answering (D130), as the relay records it on what it signs: the phone layout, or not. */
export const hostedClient = () => (matchMedia(PHONE).matches ? "hosted-phone" : "hosted-desktop");

/**
 * POST an answer as JSON, with the browser's cookie. On the website, an answer that takes the passkey comes back 202
 * (D139, D163): the person confirms it with their passkey, and the proof goes to `proofs`; a slider proposal that loosens
 * takes two, so this repeats while the reply is 202. Resolves with the last response; rejects when the passkey isn't used.
 */
export async function postAnswer(e: Endpoints, url: string, body: unknown, opts: { keepalive?: boolean; client?: boolean } = {}): Promise<Response> {
  const json = (x: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(x), credentials: "same-origin" as const });
  const sent = e.hosted && opts.client ? { ...(body as object), client: hostedClient() } : body;
  let r = await fetch(url, { ...json(sent), ...(opts.keepalive ? { keepalive: true } : {}) });
  while (r.status === 202 && e.hosted) {
    const { passkey } = (await r.json()) as { passkey: PasskeyAsk };
    const response = await confirmWithPasskey(passkey);
    r = await fetch(e.hosted.proofs, json({ pending: passkey.pending, response }));
  }
  return r;
}
