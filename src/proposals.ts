import { type Counted, countedCards, replayCards, rowWindows } from "./report.js";
import { LEVEL_AT, LOOSEN_AFTER, POSITION_NAMES, type Position, ROW_NAMES, type Row, type Settings, isOwnCard, replay, stop } from "./routing.js";
import type { Verdict } from "./schema.js";
import { SIMILAR_TITLE, jaccard, tokens } from "./similarity.js";
import { type Card, PENDING, type Store } from "./store.js";

// The cards Baesian files itself from the record, with no model, as it files conflict cards (D65): convention cards,
// "Make these one rule?" (D161, P16 section 6), and slider proposals, "move this slider?" (B-y6jn6). The local server
// runs `afterVerdict` when the client records an answer; a relay sync will run it when the CLI pulls one (M9).

/** Where each kind goes: a deck of its own, created when it's first used. */
export const CONVENTIONS_DECK = {
  id: "conventions",
  title: "Patterns in your answers",
  brief: "Baesian files these itself when your answers show a pattern: decisions in one area decided alike, or a comment that states a rule. Saying yes asks an agent to draft the rule, which comes back to you as a card.\n",
};
export const PREFERENCES_DECK = {
  id: "preferences",
  title: "Your preferences",
  brief: "Baesian files these itself from each row's record: one stop up after a miss, one stop down after 29 answers in a row without one. Accepting one writes a new preference file; Baesian never moves a row on its own.\n",
};

/** A comment that states a rule (P16 section 6). The word list is a guess, to tune while dogfooding. */
export const RULE_WORDS = /\b(always|never|from now on|in general)\b/i;

/** Final answers in a row without a miss before Baesian proposes loosening a row, kept in src/routing.ts so the client can mark it. */
export { LOOSEN_AFTER };

/** After the client records a verdict: the convention cards and slider proposals the record now calls for, filed. */
export function afterVerdict(store: Store, verdict: Verdict): Card[] {
  return [...proposeConvention(store, verdict.card), ...proposeSliderMoves(store)];
}

// ---------------------------------------------------------------- convention cards (D161)

/** A decision that can be evidence for a convention: an agent's, resolved, and not already a rule or on its way to one. */
function eligible(store: Store, card: Card, used: ReadonlySet<string>, ruled: ReadonlySet<string>): boolean {
  const id = card.meta.id;
  return !isOwnCard(card.meta) && !used.has(id) && !ruled.has(id) && store.status(id) === "resolved" && !store.ruleAsked(id);
}

const areaOf = (store: Store, card: Card) => store.canonicalTopic(card.meta.topic).split("/")[0]!;

/**
 * A convention card from a decision just resolved, if its answer shows a pattern (P16 section 6): a comment in rule
 * words, or at least one other resolved decision in the same area whose chosen answer is alike, by the filing check's
 * similarity. A decision is evidence for one convention card at most, so a pattern you've declined comes back only
 * from new decisions.
 */
export function proposeConvention(store: Store, id: string): Card[] {
  const plan = store.view(() => {
    const card = store.card(id);
    if (!card) return undefined;
    const conventions = store.cards().filter((c) => c.meta.convention !== undefined && store.status(c.meta.id) !== "withdrawn");
    const used = new Set(conventions.flatMap((c) => c.meta.depends_on));
    const ruled = new Set(store.rules().flatMap((r) => (r.meta.from_card ? [r.meta.from_card] : [])));
    if (!eligible(store, card, used, ruled)) return undefined;
    const verdict = store.verdicts(id).filter((v) => v.revision === card.meta.revision).at(-1);
    if (verdict?.make_rule) return undefined;
    const area = areaOf(store, card);
    const decided = (c: Card) => store.decision(c.meta.id) ?? "";
    if (verdict?.comment && RULE_WORDS.test(verdict.comment)) {
      return { signal: "rule-words" as const, area, cards: [card], fact: `On ${id}, “${card.meta.title}”, you chose “${decided(card)}”, and wrote: “${verdict.comment}”` };
    }
    const mine = tokens(decided(card));
    const alike = store
      .cards()
      .filter((o) => o.meta.id !== id && areaOf(store, o) === area && eligible(store, o, used, ruled) && jaccard(mine, tokens(decided(o))) >= SIMILAR_TITLE)
      .sort((a, b) => a.meta.created.localeCompare(b.meta.created));
    if (!alike.length) return undefined;
    const cards = [...alike, card];
    return { signal: "same-choice" as const, area, cards, fact: cards.map((c) => `${c.meta.id}, “${c.meta.title}”: you chose “${decided(c)}”`).join("; ") };
  });
  if (!plan) return [];
  const one = plan.cards.length === 1;
  const draft = {
    title: `A pattern in your answers on ${plan.area}`,
    question: one ? "Should this decision become a rule?" : `Should these ${plan.cards.length} decisions become one rule?`,
    doing: "reading your answers for patterns",
    topic: `conventions/${plan.area}/${plan.cards[0]!.meta.id.toLowerCase()}`,
    level: "provisional",
    touches: [],
    reverse: "cheap",
    proposal: one ? "Draft a rule from it" : "Draft a rule from these",
    proposal_then: "an agent drafts the rule and its gate patterns, and it comes back to you to confirm",
    alternative: one ? "Keep it to this decision" : "Keep them separate",
    alternative_then: one ? "nothing is saved, and this decision isn't proposed again" : "nothing is saved, and these decisions aren't proposed again",
    crux: "Would you decide the next one like these the same way, unasked?",
    crux_proposal: "If so",
    crux_alternative: "If it depends",
    crux_fact: plan.fact,
    depends_on: plan.cards.map((c) => c.meta.id),
    convention: plan.signal,
  };
  const body = `Baesian found this pattern itself, with no model (D161): ${plan.signal === "rule-words" ? "a comment that states a rule" : "decisions in one area whose chosen answers are alike"}.\n`;
  return [store.fileOwn(draft, body, CONVENTIONS_DECK)];
}

// ---------------------------------------------------------------- slider proposals (B-y6jn6)

/** What a position does to a row's cards, in a line. */
function effect(to: Position, settings: Settings): string {
  const rate = (p: number) => `about 1 in ${Math.round(1 / p)}`;
  switch (to) {
    case "agent-decides":
      return `agents go ahead without you on these, and ${rate(settings.rate_agent_decides)} comes back to you as an audit`;
    case "sample":
      return `agents go ahead without you on these, and ${rate(settings.rate_sample)} comes back to you as an audit`;
    case "tell-me":
      return "these reach you, and agents carry on with their pick until you answer";
    case "stop-and-ask":
      return "agents wait for your answer on these while you're there";
    case "never-without-me":
      return "agents never go ahead on these without your answer";
  }
}

const named = (p: Position) => `“${POSITION_NAMES[p]}”`;

/**
 * Propose moving each row one stop (B-y6jn6): up after a miss on it, down after `LOOSEN_AFTER` final answers in a row on
 * it without one, at its position since it last moved or Baesian last proposed moving it. Misses are as card B-87tkc
 * counts them, final answers on shown rows and audits on held ones. Not past a row's floor, and not while a proposal on
 * the row is still waiting. Loosening is hard, since it lets more decisions past you; tightening is provisional.
 */
export function proposeSliderMoves(store: Store): Card[] {
  const plans = store.view(() => {
    const force = store.inForce();
    const counted = countedCards(store);
    const waiting = new Set(store.cards().flatMap((c) => (c.meta.pref_row && PENDING.has(store.status(c.meta.id)) ? [c.meta.pref_row] : [])));
    return rowWindows(store, counted, force).flatMap((w): { w: typeof w; to: Position; dir: "up" | "down"; counted: Counted[]; settings: Settings }[] => {
      if (waiting.has(w.row)) return [];
      if (w.misses.length) {
        const to = stop(w.row, w.position, "up");
        return to ? [{ w, to, dir: "up", counted, settings: force.settings }] : [];
      }
      if (w.streak >= LOOSEN_AFTER) {
        const to = stop(w.row, w.position, "down");
        return to ? [{ w, to, dir: "down", counted, settings: force.settings }] : [];
      }
      return [];
    });
  });
  return plans.map((p) => store.fileOwn(sliderDraft(p.w.row, p.w.position, p.to, p.dir, p.w.answered, p.w.misses, p.counted, p.settings), sliderBody(p.dir), PREFERENCES_DECK));
}

function sliderDraft(row: Row, from: Position, to: Position, dir: "up" | "down", answered: Counted[], misses: Counted[], counted: Counted[], settings: Settings) {
  const name = ROW_NAMES[row];
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  const evidence = dir === "up" ? misses.at(-1)! : answered.at(-1)!;
  const moved = { ...settings, rows: { ...settings.rows, [row]: to } };
  const after = replay(replayCards(counted), moved).rows[row];
  const cards = (k: number) => `${k} ${k === 1 ? "card" : "cards"}`;
  // What the move would have held of past cards, when it moves to a stop that holds any back.
  const history = after && !LEVEL_AT[to] ? ` Of the ${cards(after.cards)} on this row so far, ${after.held} would have been held back at ${named(to)}.` : "";
  const fact =
    dir === "up"
      ? `“${name}” is at ${named(from)}. On ${evidence.card.meta.id}, “${evidence.card.meta.title}”, ${evidence.answers.final?.response === "accept" ? "you kept the agent's pick, and marked that you should have been asked" : "your final answer went against the agent's pick"}. Misses on this row at ${named(from)}: ${misses.length} in ${answered.length} final ${answered.length === 1 ? "answer" : "answers"}.${history}`
      : `“${name}” is at ${named(from)}. Your last ${answered.length} final answers on it kept the agent's pick, and none was marked “you should have asked me”: with no misses in ${answered.length}, the miss rate is under about 1 in ${Math.floor(answered.length / 3)}.${history}`;
  return {
    title: `The setting for ${lower}`,
    question: `Where should the setting for ${lower} be now?`,
    doing: "reading the record of your answers, row by row",
    topic: `preferences/${row.replace(/_/g, "-")}/${evidence.card.meta.id.toLowerCase()}`,
    level: dir === "up" ? "provisional" : "hard",
    touches: [],
    reverse: "cheap",
    proposal: `Move it to ${named(to)}`,
    proposal_then: `a new preference file moves it: ${effect(to, settings)}${settings.mode === "shadow" && !["tell-me", "stop-and-ask", "never-without-me"].includes(to) ? " (in shadow, nothing is held back yet)" : ""}`,
    alternative: `Keep it at ${named(from)}`,
    alternative_then: "nothing changes, and Baesian proposes a move on this row again only from new answers",
    crux: dir === "up" ? "Was that answer a sign of this kind of decision, or a one-off?" : "Can agents take this kind of decision with less of your attention?",
    crux_proposal: dir === "up" ? "A sign of the kind" : "If they can",
    crux_alternative: dir === "up" ? "A one-off" : "Not yet",
    crux_fact: fact,
    pref_row: row,
    pref_from: from,
    pref_to: to,
  };
}

const sliderBody = (dir: "up" | "down") =>
  `Baesian files this itself from the record, with no model (B-y6jn6): ${dir === "up" ? "one stop up after a miss on a row" : `one stop down after ${LOOSEN_AFTER} final answers in a row on it without a miss`}. A miss is a final answer that overturns the agent's pick, or one marked “you should have asked me” (B-87tkc). Accepting writes a new preference file; Baesian never moves a row on its own.\n`;
