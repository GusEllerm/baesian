import type { WaitingCounts } from "../kept";

// Each project's inbox on the projects page (B-fzr1e): how many cards wait for you there, by level, as the project said
// when asked (B-wgbdh), or that asking failed. In a project with other members (P20), every card waits for every member,
// and the inbox also says how many of them were sent to you (B-tzdjn).

/** An inbox's counts, or that asking for them failed. */
export type Inbox = WaitingCounts | "failed";

/** How many cards wait in an inbox: 0 until it's known. */
export const waitingIn = (c: Inbox | undefined): number => (c && c !== "failed" ? c.total : 0);

/**
 * What an inbox says: "Nothing waiting", "3 waiting for you, 1 hard", or that it's being asked or couldn't be. When some
 * of what waits was sent to someone else, it says how many were sent to you: "5 waiting, 2 sent to you, 1 hard".
 */
export function inboxLine(c: Inbox | undefined): string {
  if (c === undefined) return "Checking what's waiting…";
  if (c === "failed") return "Couldn't check what's waiting";
  if (c.total === 0) return "Nothing waiting";
  const levels = [...(c.hard ? [`${c.hard} hard`] : []), ...(c.blocking ? [`${c.blocking} blocking`] : [])];
  if (!c.yours || c.yours.total === c.total) return [`${c.total} waiting for you`, ...levels].join(", ");
  return [`${c.total} waiting`, c.yours.total ? `${c.yours.total} sent to you` : "none sent to you", ...levels].join(", ");
}
