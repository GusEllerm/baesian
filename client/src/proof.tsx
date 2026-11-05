import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type RequestOptionsJSON, signWithPasskey } from "./webauthn";

// The passkey on an answer (D139, D163, M9e). On the website, an answer on a hard card, or a change to your preferences
// that lets more cards past you, comes back from the relay waiting for your passkey (202). Answers on the desk wait there
// until one tap confirms them together (B-a6xpc, waiting.ts); a change to your preferences is confirmed at once. The
// passkey is asked for here, and only your tap starts it, as Safari requires; the assertion goes back to the relay, which
// writes what it confirmed.

/** What the passkey is asked to confirm, with the browser's options for it (`POST …/batches`, 202). */
export interface PasskeyAsk {
  /** Answers waiting on the desk, which go on waiting if you don't confirm them; or a change to your preferences. */
  kind: "answers" | "preferences";
  /** The cards the answers are on, by their titles. */
  titles: string[];
  /** Whether an answer among them lets more cards past you (an accepted slider proposal, D163). */
  loosens: boolean;
  options: RequestOptionsJSON;
}

/** The passkey wasn't used: the person chose not to, for now. */
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

/** Small counts in words. */
const NUMBER = ["no", "one", "two", "three", "four", "five", "six"];
/** The prompt lists this many cards, then says how many more. */
const LISTED = 5;

/** Why the passkey is asked for, in a sentence or two. */
function whyOf(ask: PasskeyAsk): string {
  const n = ask.titles.length;
  if (ask.kind === "preferences") return "This change lets more cards past you without asking, so it counts only once your passkey confirms it's yours.";
  if (n > 1) return `These ${NUMBER[n] ?? n} answers count only once your passkey confirms they're yours, not an agent's at your keyboard. One tap confirms them all.`;
  if (ask.loosens) return "Accepting this lets more cards past you without asking, so it counts only once your passkey confirms it's yours.";
  return "This card is hard, so your answer counts only once your passkey confirms it's yours, not an agent's at your keyboard.";
}

/** The prompt itself, while the passkey is asked for. The desk renders it on the website. */
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
  const more = ask.titles.length - LISTED;
  return (
    <>
      <div className="proof-backdrop" aria-hidden="true" />
      <aside className="panel proof" role="dialog" aria-modal="true" aria-labelledby="proof-title">
        <h4 id="proof-title">Confirm with your passkey</h4>
        <p className="proof-why">{whyOf(ask)}</p>
        {ask.kind === "answers" && ask.titles.length > 0 && (
          <ul className="proof-list" aria-label={ask.titles.length === 1 ? "The card you answered" : "The cards you answered"}>
            {ask.titles.slice(0, more > 1 ? LISTED : LISTED + 1).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
            {more > 1 && <li className="sub">and {NUMBER[more] ?? more} more</li>}
          </ul>
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
            {ask.kind === "answers" ? "Not now" : "Don't send it"}
          </button>
        </div>
        {ask.kind === "answers" && <p className="small">Not now leaves {ask.titles.length === 1 ? "it" : "them"} waiting on the desk, for up to 30 minutes from when you answered.</p>}
      </aside>
    </>
  );
}

/** A reason as a sentence: capitalised, with a full stop. */
export const sentence = (s: string) => {
  const t = s.trim();
  return t ? `${t[0]!.toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}` : t;
};
