import type { ApiState } from "../../src/api";

// What this tab keeps of what the website has loaded, in its memory and nowhere else (B-9n2c3): each project's last state,
// shown at once when you open the project again, marked as refreshing until a fresh read replaces it (B-3va5g); and each
// project's count of the cards waiting for you, for the projects page (B-wgbdh, B-fzr1e). A reload or a new tab starts
// empty. It's all forgotten when the signed-in account changes, so nobody who signs in on this tab after you sees it.

/** A project's state as it was last read, and when, by this browser's clock. */
export interface KeptState {
  state: ApiState;
  fetchedAt: number;
}

/** How many cards wait for you in a project, and how many of them are hard or blocking (`GET …/waiting`). */
export interface WaitingCounts {
  total: number;
  hard: number;
  blocking: number;
}

const states = new Map<string, KeptState>();
const counts = new Map<string, WaitingCounts>();
let account: string | undefined;

/** The state last read from a project's state address in this tab, if any. */
export const keptState = (url: string): KeptState | undefined => states.get(url);
export const keepState = (url: string, kept: KeptState): void => void states.set(url, kept);
export const dropState = (url: string): void => void states.delete(url);

/** A project's waiting counts as last read in this tab, if any. */
export const keptCounts = (project: string): WaitingCounts | undefined => counts.get(project);
export const keepCounts = (project: string, c: WaitingCounts): void => void counts.set(project, c);

/** Who is signed in now (an account's ID), or nobody: what was kept while someone else was is forgotten. */
export function keptFor(who: string | undefined): void {
  if (who === account) return;
  account = who;
  states.clear();
  counts.clear();
}
