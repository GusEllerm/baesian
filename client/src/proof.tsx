import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type RequestOptionsJSON, signWithPasskey } from "./webauthn";

// The passkey on an answer (D139, D163, M9e). On the website, an answer on a hard card, or a change to your preferences
// that lets more cards past you, comes back from the relay waiting for your passkey (202). The desk asks you here, and
// only your tap starts the passkey, as Safari requires; the assertion goes back to the relay, which writes the answer.

/** What the relay asks the passkey to prove (`POST …/verdicts` or `…/preferences`, 202). */
export interface PasskeyAsk {
  pending: string;
  proving: "verdict" | "preferences";
  step: number;
  of: number;
  options: RequestOptionsJSON;
}

/** The answer wasn't sent: the person chose not to use their passkey. */
export class NotConfirmed extends Error {
  constructor() {
    super("you didn't confirm it with your passkey, so it wasn't sent");
  }
}

interface Waiting {
  ask: PasskeyAsk;
  done: (assertion: unknown) => void;
  refuse: () => void;
}

let waiting: Waiting | undefined;
const listeners = new Set<() => void>();
const changed = () => {
  for (const l of listeners) l();
};

/** Ask the person to confirm with their passkey: resolves with the assertion, or rejects with `NotConfirmed`. */
export function confirmWithPasskey(ask: PasskeyAsk): Promise<unknown> {
  waiting?.refuse();
  return new Promise((resolve, reject) => {
    waiting = {
      ask,
      done: (a) => {
        waiting = undefined;
        changed();
        resolve(a);
      },
      refuse: () => {
        waiting = undefined;
        changed();
        reject(new NotConfirmed());
      },
    };
    changed();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The prompt itself, while an answer waits for the passkey. The desk renders it on the website. */
export function ProofPrompt() {
  const w = useSyncExternalStore(subscribe, () => waiting);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setProblem(undefined);
    setBusy(false);
    if (w) requestAnimationFrame(() => button.current?.focus());
  }, [w]);
  useEffect(() => {
    if (!w) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        w.refuse();
      }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [w]);
  if (!w) return null;
  const { ask } = w;
  const use = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      w.done(await signWithPasskey(ask.options));
    } catch (e) {
      setBusy(false);
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const why =
    ask.proving === "verdict"
      ? "This card is hard, so your answer counts only once your passkey confirms it's yours, not an agent's at your keyboard."
      : "This change lets more cards past you without asking, so it counts only once your passkey confirms it's yours.";
  return (
    <>
      <div className="proof-backdrop" aria-hidden="true" />
      <aside className="panel proof" role="dialog" aria-modal="true" aria-labelledby="proof-title">
        <h4 id="proof-title">Confirm with your passkey</h4>
        <p className="proof-why">{why}</p>
        {ask.of > 1 && (
          <p className="sub">
            Step {ask.step} of {ask.of}: {ask.proving === "verdict" ? "your answer" : "the change to your preferences it makes"}.
          </p>
        )}
        {problem && (
          <p className="problem" role="alert">
            {sentence(problem)}
          </p>
        )}
        <div className="proof-row">
          <button type="button" className="confirm" ref={button} disabled={busy} onClick={() => void use()}>
            {busy ? "Waiting for your passkey…" : "Use your passkey"}
          </button>
          <button type="button" className="cancel" onClick={() => w.refuse()}>
            Don't send it
          </button>
        </div>
      </aside>
    </>
  );
}

/** A reason as a sentence: capitalised, with a full stop. */
export const sentence = (s: string) => {
  const t = s.trim();
  return t ? `${t[0]!.toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}` : t;
};
