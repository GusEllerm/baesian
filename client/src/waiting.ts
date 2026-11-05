import { storageKey } from "./local";

// Answers waiting for your passkey (B-a6xpc). On the website, an answer on a hard card (D139), or one that lets more cards
// past you (D163), doesn't ask for the passkey at once: the relay holds it (202), the desk marks it as waiting, and you go
// on to the next card. One tap then confirms every answer waiting. The desk asks by itself when the run of hard cards in
// front of you is over (`askNow()`), or when you press its button. A plain module, so the rule and the words are tested
// on their own (waiting.test.ts); the desk (Desk.tsx) holds the answers.

/** What the relay replied for an answer it holds for your passkey (`POST …/verdicts`, 202). */
export interface Wait {
  /** Its ID on the relay. */
  pending: string;
  /** What it writes that takes the passkey: the verdict, and the preference file an accepted slider proposal writes. */
  proving: ("verdict" | "preferences")[];
  /** When the relay drops it, by the relay's clock: 30 minutes after you answered. */
  expires: string;
}

/** The desk asks by itself this long before a waiting answer would expire, whatever card is in front of you. */
export const ASK_BEFORE_EXPIRY_MS = 5 * 60_000;

/** Small counts in words, as the desk's summary has them. */
const NUMBER = ["no", "one", "two", "three", "four", "five", "six"];
const count = (n: number) => NUMBER[n] ?? String(n);
const capital = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;

/**
 * Whether the desk asks for your passkey by itself now: answers wait, and nothing is in the way (an answer still in its
 * undo window or on its way to the relay, a written answer, a panel or the menu, or the prompt itself); and then either
 * one of them expires within five minutes, which it asks about once, or the card in front of you isn't hard: the run of
 * hard cards is over, or there's no card left. After "Not now", or a tap that failed, it asks by itself again only once
 * another answer has joined them, or one is about to expire; the button asks any time.
 */
export function askNow(p: {
  waiting: readonly { pending: string; expiresAt: number }[];
  busy: boolean;
  hardInFront: boolean;
  /** Answers you said "Not now" to, or whose tap failed. */
  declined: ReadonlySet<string>;
  /** Answers it has already asked about as they neared expiry. */
  warned: ReadonlySet<string>;
  now: number;
}): "no" | "run-over" | "expiring" {
  if (!p.waiting.length || p.busy) return "no";
  if (p.waiting.some((w) => w.expiresAt - p.now <= ASK_BEFORE_EXPIRY_MS && !p.warned.has(w.pending))) return "expiring";
  if (!p.hardInFront && p.waiting.some((w) => !p.declined.has(w.pending))) return "run-over";
  return "no";
}

/** What the desk says while answers wait: "Two answers wait for your passkey." */
export const waitingLine = (n: number) => `${capital(count(n))} ${n === 1 ? "answer waits" : "answers wait"} for your passkey.`;

/** What the desk says of answers the relay dropped before your passkey confirmed them: their cards are back. */
export function expiredLine(titles: readonly string[]): string {
  if (titles.length === 1) return `Your answer to “${titles[0]}” waited too long for your passkey, so it wasn't recorded. The card is back for you to answer.`;
  return `${capital(count(titles.length))} answers waited too long for your passkey, so they weren't recorded: ${titles.map((t) => `“${t}”`).join(", ")}. Their cards are back for you to answer.`;
}

/** What the toast says once a tap confirmed answers: one answer's own words, or how many. */
export function confirmedLine(n: number, one: string | undefined): string {
  return n === 1 && one ? one : `${capital(count(n))} answers confirmed and sent.`;
}

// ---------------------------------------------------------------- kept in this tab

/**
 * The waiting answers are kept in this tab's session storage, per project, so reloading the page, going back to it, or
 * signing in again finds them still waiting, for as long as the relay holds them. Storage can be missing or refused, so
 * every read and write is guarded.
 */
const KEY = (project: string) => storageKey(project, "passkey-waiting");

/** One waiting answer as the tab keeps it: the card's key, when the relay drops it, and what the desk shows of it. */
export interface Kept<T> {
  key: string;
  expires: string;
  answered: T;
}

export function loadWaiting<T>(project: string): Kept<T>[] {
  try {
    const v = sessionStorage.getItem(KEY(project));
    const parsed: unknown = v === null ? [] : JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as Kept<T>[]).filter((e) => typeof e?.key === "string" && typeof e.expires === "string") : [];
  } catch {
    return [];
  }
}

export function saveWaiting(project: string, entries: readonly Kept<unknown>[]): void {
  try {
    if (entries.length) sessionStorage.setItem(KEY(project), JSON.stringify(entries));
    else sessionStorage.removeItem(KEY(project));
  } catch {
    // no storage: they wait on this page only
  }
}

/**
 * How many answers wait for your passkey in each project this tab has had open, by this browser's clock, for the pages
 * that aren't its desk: the projects say so, and so does signing out.
 */
export function waitingByProject(now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const m = k ? /^baesian:(.+):passkey-waiting$/.exec(k) : null;
      if (!m) continue;
      const n = loadWaiting(m[1]!).filter((e) => Date.parse(e.expires) > now).length;
      if (n) out.set(m[1]!, n);
    }
  } catch {
    // no storage
  }
  return out;
}
