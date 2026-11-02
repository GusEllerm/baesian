import type { ApiCard, ApiVerdictInput } from "../../src/api";
import type { OptionKind } from "../../src/schema";
import type { Rarity } from "./model";

// M4 step 5c: what the reviewer answered, turned into the verdict the server records (D96). Pure, so it's tested
// on its own (answer.test.ts).

/** What you chose in the client: an option, a written answer, or "can't judge". */
export type Answer =
  /** `rule`: D16's "make this a rule", so the agent drafts one for you to confirm (D109, D110). */
  /** `retire`: rules the chosen option breaks, which you retire with this answer (D119). */
  | { kind: "choose"; option: OptionKind; first: OptionKind; why?: string; rule?: boolean; retire?: string[] }
  | { kind: "write"; reason: WriteReason; text: string; rule?: boolean }
  | { kind: "pass"; reason: PassReason; text: string };

export type WriteReason = "question" | "correction" | "reject";
export type PassReason = "need_context" | "not_my_area" | "see_it_run";

/** The chips, in the words the card shows, for ↑ (write) and ↓ (can't judge). */
export const WRITE_REASONS: { reason: WriteReason; label: string; placeholder: string }[] = [
  { reason: "question", label: "Ask a question", placeholder: "What do you want the agent to answer?" },
  { reason: "correction", label: "Suggest a correction", placeholder: "Your own answer, in place of both options" },
  { reason: "reject", label: "Reject, with a reason", placeholder: "Why, so the agent can re-propose" },
];
export const PASS_REASONS: { reason: PassReason; label: string }[] = [
  { reason: "need_context", label: "I need more context" },
  { reason: "not_my_area", label: "It's outside my expertise" },
  { reason: "see_it_run", label: "I need to see it run" },
];

/** How long a card asks you to read before an option counts (D91: the trial from D70, now a product decision). */
export const READ_FIRST_MS: Record<Rarity, number> = { common: 0, uncommon: 2000, rare: 3000, mythic: 3000 };
/** The undo window (D82). */
export const UNDO_MS = 5000;
/** How long a mythic card's confirm is held (D67, D91). */
export const HOLD_MS = 900;

/** The verdict for an answer, or why it can't be sent yet. */
export function verdictFor(card: ApiCard, answer: Answer): { verdict: ApiVerdictInput } | { problem: string } {
  const base = { card: card.meta.id, revision: card.meta.revision };
  const text = answer.kind === "choose" ? (answer.why ?? "").trim() : answer.text.trim();
  const rule = answer.kind !== "pass" && answer.rule ? { make_rule: true } : {};
  if (answer.kind === "choose") {
    const chosen = answer.option === "proposal" ? { response: "accept" as const } : { response: "alternative" as const, choice: card.meta.alternative };
    // The choice made before the agent's pick showed (D88), and a disagreement's reason (D87).
    const retire = answer.retire?.length ? { retire_rules: answer.retire } : {};
    return { verdict: { ...base, ...chosen, first_choice: answer.first, ...(text ? { comment: text } : {}), ...rule, ...retire } };
  }
  if (answer.kind === "write") {
    if (!text) return { problem: answer.reason === "question" ? "Write your question first." : answer.reason === "correction" ? "Write your answer first." : "Say why first." };
    if (answer.reason === "correction") return { verdict: { ...base, response: "correction", choice: text, ...rule } };
    return { verdict: { ...base, response: answer.reason, comment: text, ...(answer.reason === "reject" ? rule : {}) } };
  }
  return { verdict: { ...base, response: answer.reason, ...(text ? { comment: text } : {}) } };
}

/** The short words for an answer, for the toast and, later, the path. */
export function describeAnswer(card: ApiCard, answer: Answer): string {
  if (answer.kind === "choose") return `You chose “${card.meta[answer.option]}”.`;
  if (answer.kind === "write") return answer.reason === "question" ? "You asked a question." : answer.reason === "correction" ? "You gave your own answer." : "You rejected it.";
  return answer.reason === "see_it_run" ? "You asked to see it run." : answer.reason === "not_my_area" ? "You passed it on." : "You asked for more context.";
}
