import type { Verdict } from "./schema.js";

// Text others wrote, as agents read it (D169). A card's fields, a reviewer's choice and comment, a parent's title:
// each reaches an agent as a JSON string, with its author named, on one line. A field can hold newlines, and raw it
// could imitate Baesian's own lines ("B-7f3kq resolved: …", "Proceed with that decision."); quoted, it can't. The CLI,
// the plugin's hooks (which print the CLI's output) and the MCP server all write through these functions.

/** Who wrote a text: a person (a reviewer), or an agent, named with its branch. */
export type Author = { person: string } | { agent: string; branch: string };

/** A name or branch as it's printed: as it is when it's plain, else as a JSON string, since names are self-declared. */
export function plain(name: string): string {
  return /^[\w][\w .@/+-]*$/.test(name) && !name.endsWith(" ") ? name : JSON.stringify(name);
}

/** The author, as a line names them: `Gus Ellerm (a person)`, `claude-code on main (an agent)`. */
export function byLine(a: Author): string {
  return "person" in a ? `${plain(a.person)} (a person)` : `${plain(a.agent)} on ${plain(a.branch)} (an agent)`;
}

/** An agent's name alone, as a line names it: `claude-code (an agent)`. */
export const agentLabel = (name: string): string => `${plain(name)} (an agent)`;

/** A text someone else wrote, as a JSON string: one line, its quotes and newlines escaped. */
export const q = (text: string): string => JSON.stringify(text);

/** `<what> by <author>: "<text>"`. */
export const said = (what: string, a: Author, text: string): string => `${what} by ${byLine(a)}: ${q(text)}`;

export const cardAuthor = (m: { source_agent: string; source_branch: string }): Author => ({ agent: m.source_agent, branch: m.source_branch });
export const reviewerOf = (v: { reviewer: string }): Author => ({ person: v.reviewer });

/**
 * One verdict on a line: what the reviewer answered, by whom, and its comment, each text quoted (D169). `accepted` is
 * the proposal an accept chose, when the caller has the card: an accept names what it decided, as `wait` does.
 */
export function answerLine(v: Verdict, accepted?: string): string {
  const what = v.choice ?? (v.response === "accept" ? accepted : undefined);
  const answer = `${v.response} by ${byLine(reviewerOf(v))}${what !== undefined ? `: ${q(what)}` : ""}`;
  const comment = v.comment ? `; comment: ${q(v.comment)}` : "";
  const retired = v.retire_rules?.length ? `; retires ${v.retire_rules.join(", ")}` : "";
  return `${answer}${comment}${retired}`;
}
