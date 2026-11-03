// What the client keeps in this browser, per project (Client Data Contract: time spent, what you've seen, whether
// to notify). Storage can be missing or refused (a private window, cleared data), so every read and write is
// guarded, and the client works without it.

import { useCallback, useRef, useState } from "react";
import type { ApiState } from "../../src/api";
import type { Spent } from "./calibration";
import { keyOf } from "./model";

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no storage: the client carries on without it
  }
}

export const storageKey = (project: string, what: string) => `baesian:${project}:${what}`;

/** The time-spent log is capped, oldest first out: a median needs recent answers, not all of them. */
const SPENT_MAX = 1000;

export function addSpent(project: string, entry: Spent): void {
  const key = storageKey(project, "spent");
  save(key, [...load<Spent[]>(key, []), entry].slice(-SPENT_MAX));
}
export const loadSpent = (project: string) => load<Spent[]>(storageKey(project, "spent"), []);

/**
 * Which cards you've seen, for the "new" tag: a card is new until it's been on the desk. The first time this
 * browser opens a project, everything already there counts as seen, so the tag means "since you last looked".
 */
export function useSeen(state: ApiState) {
  const key = storageKey(state.project.name, "seen");
  const latest = useRef(state);
  latest.current = state;
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => {
    const stored = load<string[] | null>(key, null);
    if (stored) return new Set(stored);
    const all = state.cards.map(keyOf);
    save(key, all);
    return new Set(all);
  });
  const mark = useCallback(
    (k: string) =>
      setSeen((s) => {
        if (s.has(k)) return s;
        const next = new Set(s).add(k);
        // Kept to the cards that still exist, so the log doesn't grow forever.
        const live = new Set(latest.current.cards.map(keyOf));
        save(key, [...next].filter((x) => live.has(x)));
        return next;
      }),
    [key],
  );
  return { isNew: (k: string) => !seen.has(k), mark };
}

/**
 * Whether this browser has offered the setup survey for this project (B-5na1k): it's offered once, when the repo has
 * no preference file, and counts as offered once you've started it or said "Not now". The preferences panel offers it
 * again.
 */
export function useSetupOffered(state: ApiState) {
  const key = storageKey(state.project.name, "setup");
  const [offered, setOffered] = useState(() => load(key, false));
  const mark = useCallback(() => {
    save(key, true);
    setOffered(true);
  }, [key]);
  return { offered, mark };
}

/**
 * The decks whose briefing card you've been shown (B-j6b75): each comes once, before the first of its cards you
 * reach. Unlike "seen", nothing counts as briefed the first time a browser opens a project: you haven't read them.
 */
export function useBriefed(state: ApiState) {
  const key = storageKey(state.project.name, "briefed");
  const latest = useRef(state);
  latest.current = state;
  const [briefed, setBriefed] = useState<ReadonlySet<string>>(() => new Set(load<string[]>(key, [])));
  const mark = useCallback(
    (deck: string) =>
      setBriefed((s) => {
        if (s.has(deck)) return s;
        const next = new Set(s).add(deck);
        // Kept to the decks that still exist.
        const live = new Set(latest.current.decks.map((d) => d.meta.id));
        save(key, [...next].filter((x) => live.has(x)));
        return next;
      }),
    [key],
  );
  return { has: (deck: string) => briefed.has(deck), mark };
}
