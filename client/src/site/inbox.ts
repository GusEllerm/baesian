import type { WaitingCounts } from "../kept";

// Each project's inbox on the projects page (B-fzr1e): how many cards wait for you there, by level, as the project said
// when asked (B-wgbdh), or that asking failed.

/** An inbox's counts, or that asking for them failed. */
export type Inbox = WaitingCounts | "failed";

/** How many cards wait in an inbox: 0 until it's known. */
export const waitingIn = (c: Inbox | undefined): number => (c && c !== "failed" ? c.total : 0);

/** What an inbox says: "Nothing waiting", "3 waiting for you, 1 hard", or that it's being asked or couldn't be. */
export function inboxLine(c: Inbox | undefined): string {
  if (c === undefined) return "Checking what's waiting…";
  if (c === "failed") return "Couldn't check what's waiting";
  if (c.total === 0) return "Nothing waiting";
  return [`${c.total} waiting for you`, ...(c.hard ? [`${c.hard} hard`] : []), ...(c.blocking ? [`${c.blocking} blocking`] : [])].join(", ");
}
