import { type ApiCard, type ApiState, type Status, WAITING_STALE_MS } from "../../src/api";
import type { OptionKind } from "../../src/schema";

// M4 step 5b: what the client works out from the server's snapshot (D96). Pure functions, ported from the round 5
// prototype's data.js and app.js (design/explorations/round5/), now over real cards. Nothing here is inferred by
// a model (D65): every relation comes from a field a card or the store states. docs/vault/Design/Client Build.md.

export type Rarity = "common" | "uncommon" | "rare" | "mythic";
export type Tier = "low" | "medium" | "high";

export const RARITY: Record<Rarity, { name: string; rank: number; position: string }> = {
  common: { name: "Common", rank: 1, position: "the lowest of four levels" },
  uncommon: { name: "Uncommon", rank: 2, position: "the second of four levels" },
  rare: { name: "Rare", rank: 3, position: "the third of four levels" },
  mythic: { name: "Mythic", rank: 4, position: "the highest of four levels" },
};

/** Facts that make a card hard by default (D42), and mythic here. */
const HARD_FACTS = new Set(["security", "money", "data-loss", "publishes"]);
const OTHER: Record<OptionKind, OptionKind> = { proposal: "alternative", alternative: "proposal" };

/** A card's area: the first segment of its canonical topic (Client Data Contract). */
export const areaOf = (card: ApiCard): string => card.canonicalTopic.split("/")[0]!;

export const byId = (state: ApiState): Map<string, ApiCard> => new Map(state.cards.map((c) => [c.meta.id, c]));

/**
 * The agent's reply (D89, D104), on the revision that carries it: the fact or check, and the answer it replied to,
 * which went against its pick.
 */
export function replyOf(card: ApiCard): { reply: string; to: string | undefined } | undefined {
  if (card.meta.reply === undefined) return undefined;
  const to = card.verdicts.filter((v) => v.revision === card.meta.revision - 1 && (v.response === "alternative" || v.response === "correction")).at(-1);
  return { reply: card.meta.reply, to: to?.choice };
}

/** A card's identity for the client: a revised card is a new question, so it comes back. */
export const keyOf = (c: ApiCard) => `${c.meta.id}@${c.meta.revision}`;

/** Cards that still rest on this one: withdrawn and superseded dependents no longer do. */
export function liveDependents(card: ApiCard, cards: Map<string, ApiCard>): ApiCard[] {
  return card.dependents.flatMap((id) => cards.get(id) ?? []).filter((d) => d.status !== "withdrawn" && d.status !== "superseded");
}

/**
 * A card's rarity, from what it states and what rests on it, never from the agent's claim about importance
 * (D11). With the reasons, in plain words, so the card can say why.
 */
export function rarityOf(card: ApiCard, dependents: number): { rarity: Rarity; tier: Tier; why: string[] } {
  const m = card.meta;
  const why: string[] = [];
  const hard = m.touches.filter((f) => HARD_FACTS.has(f));
  const conflict = (m.conflict_of?.length ?? 0) > 0;
  if (hard.length) {
    why.push(`it touches ${hard.join(" and ").replace("-", " ")}`);
    if (m.reverse === "one-way") why.push("it's hard to undo");
    if (m.level !== "provisional") why.push("an agent has stopped for it");
    return { rarity: "mythic", tier: "high", why };
  }
  if (m.reverse === "one-way" || dependents >= 3 || conflict) {
    if (conflict) why.push("two settled decisions disagree");
    if (m.reverse === "one-way") why.push("it's hard to undo");
    if (dependents >= 3) why.push(`${dependents} decisions depend on it`);
    return { rarity: "rare", tier: "high", why };
  }
  if (dependents >= 1 || m.reverse === "moderate") {
    if (dependents) why.push(`${dependents} decision${dependents === 1 ? " depends" : "s depend"} on it`);
    if (m.reverse === "moderate") why.push("it's moderately costly to undo");
    return { rarity: "uncommon", tier: "medium", why };
  }
  why.push("it's cheap to undo and nothing is built on it yet");
  return { rarity: "common", tier: "low", why };
}

const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The stakes in a few words: how hard it is to undo, then what it touches or what rests on it. Never the tier's name. */
export function stakesLine(card: ApiCard, dependents: number): string {
  const m = card.meta;
  const undo = { "one-way": "Hard to undo", moderate: "Costly to undo", cheap: "Easy to undo" }[m.reverse];
  const parts: string[] = [];
  const hard = m.touches.filter((f) => HARD_FACTS.has(f));
  if (hard.length) parts.push(`touches ${listJoin(hard.map((f) => f.replace("-", " ")))}`);
  if ((m.conflict_of?.length ?? 0) > 0) parts.push("two settled decisions disagree");
  if (dependents) parts.push(`${dependents} decision${dependents === 1 ? " rests" : "s rest"} on it`);
  return [undo, ...parts].join(", ");
}

/**
 * Whether an agent is waiting on a card now (D90), measured on the server's clock:
 * - `waiting`: a marker is fresh, so "stopped for you" is true;
 * - `gone`: every marker went stale, so the agent stopped waiting, killed mid-wait;
 * - `carried-on`: a wait gave up and recorded a fallback (D46);
 * - `none`: nobody is waiting, or ever waited.
 */
export type WaitState = "waiting" | "gone" | "carried-on" | "none";
export function waitState(card: ApiCard, nowMs: number): WaitState {
  if (card.waiting.some((w) => nowMs - Date.parse(w.at) <= WAITING_STALE_MS)) return "waiting";
  if (card.waiting.length) return "gone";
  if (card.fallbacks.some((f) => f.revision === card.meta.revision)) return "carried-on";
  return "none";
}

/** What the server's clock reads now, given when the snapshot was taken by both clocks. */
export const serverNow = (state: ApiState, fetchedAtMs: number, nowMs: number = Date.now()): number => Date.parse(state.server.now) + (nowMs - fetchedAtMs);

/**
 * The queue (round 5's order, with D90): cards with an agent waiting now come first of all; then each area in
 * turn, the area with the rarest card first, and within it the rarest first, oldest first among equals.
 * Only open cards are in it: passed-on and deferred cards are parked (`parked`).
 */
export function queue(state: ApiState, nowMs: number): ApiCard[] {
  const cards = byId(state);
  const open = state.cards.filter((c) => c.status === "open");
  const rank = new Map(open.map((c) => [c.meta.id, RARITY[rarityOf(c, liveDependents(c, cards).length).rarity].rank]));
  const waitingNow = (c: ApiCard) => waitState(c, nowMs) === "waiting";
  const best = new Map<string, number>();
  for (const c of open) best.set(areaOf(c), Math.max(best.get(areaOf(c)) ?? 0, rank.get(c.meta.id)!));
  const byRank = (a: ApiCard, b: ApiCard) => rank.get(b.meta.id)! - rank.get(a.meta.id)! || a.meta.created.localeCompare(b.meta.created);
  const first = open.filter(waitingNow).sort(byRank);
  const rest = open.filter((c) => !waitingNow(c)).sort((a, b) => {
    const x = areaOf(a), y = areaOf(b);
    if (x !== y) return best.get(y)! - best.get(x)! || x.localeCompare(y);
    return byRank(a, b);
  });
  return [...first, ...rest];
}

/** Cards that need the reviewer, but not now: passed to another reviewer, or deferred. */
export const parked = (state: ApiState): ApiCard[] => state.cards.filter((c) => c.status === "rerouted" || c.status === "deferred");

const STATE_WORDS: Record<Status, string> = {
  open: "waiting for you",
  resolved: "settled earlier",
  returned: "returned to its agent",
  rerouted: "passed to another reviewer",
  deferred: "deferred",
  withdrawn: "withdrawn",
  superseded: "superseded",
};

export interface Relation {
  /** A card or rule ID. */
  id: string;
  kind: "builds-on" | "conflict" | "rule" | "relies-on-this" | "precedent";
  /** How it relates, from this card's side, in the words shown beside it. */
  label: string;
  /** Above the card's node on the path, or below it. */
  where: "up" | "down";
  /** Its short name: a card's neutral title, or a rule's first line (D69: never an ID). */
  name: string;
  state: string;
  /** What each option does to it, where they differ: declared by the agent in `proposal_breaks` and `alternative_breaks`. */
  effect?: Partial<Record<OptionKind, { text: string; bad: boolean }>>;
  /** The option that keeps it, when the other would replace or break it. On a conflict card, that's the choice itself. */
  keptBy?: OptionKind;
}

/** A rule's first line, as a name: without a heading's marks, or the full stop of a one-line rule. */
const ruleName = (body: string): string => body.split("\n").map((l) => l.replace(/^#+\s*/, "").replace(/\.$/, "").trim()).find(Boolean) ?? "a rule";

/**
 * Everything a card is connected to, in the order the path shows them: what it builds on, what it conflicts
 * with, the rules it bears on, what relies on it, and its precedent. Each from a field a card or rule states.
 */
export function relationsOf(card: ApiCard, state: ApiState): Relation[] {
  const cards = byId(state);
  const rules = new Map(state.rules.map((r) => [r.meta.id, r]));
  const m = card.meta;
  const out = new Map<string, Relation>();
  const describe = (id: string): { name: string; state: string } | undefined => {
    const c = cards.get(id);
    if (c) return { name: c.meta.title, state: STATE_WORDS[c.status] };
    const r = rules.get(id);
    if (r) return { name: ruleName(r.body), state: "your rule" };
    return undefined;
  };
  const add = (id: string, rel: Omit<Relation, "id" | "name" | "state">) => {
    if (id === m.id || out.has(id)) return;
    const d = describe(id);
    if (d) out.set(id, { id, ...rel, ...d });
  };

  for (const id of m.depends_on) add(id, { kind: "builds-on", label: "this card builds on", where: "up" });

  // What each option would replace or break, as the agent declares it. On a conflict card these are its two
  // decisions, and the option that doesn't break one keeps it.
  const breaks: Record<OptionKind, string[]> = { proposal: m.proposal_breaks, alternative: m.alternative_breaks };
  const conflicts = new Set([...(m.conflict_of ?? []), ...state.cards.filter((c) => c.meta.conflict_of?.includes(m.id)).map((c) => c.meta.id), ...breaks.proposal, ...breaks.alternative]);
  for (const id of conflicts) {
    const rule = id.startsWith("R-");
    const hurts = (["proposal", "alternative"] as const).filter((k) => breaks[k].includes(id));
    const one = hurts.length === 1 ? hurts[0]! : undefined;
    const effect = one
      ? { [one]: { text: rule ? "may break it" : "replaced", bad: true }, [OTHER[one]]: { text: rule ? "keeps to it" : "kept", bad: false } }
      : undefined;
    add(id, {
      kind: rule ? "rule" : "conflict",
      label: rule ? "this card may conflict with" : "this card conflicts with",
      where: "down",
      ...(effect ? { effect, keptBy: OTHER[one!] } : {}),
    });
  }

  // Rules: one the agent cites may conflict (D79); one only on the same topic is said to be no more than that.
  for (const id of m.rules) add(id, { kind: "rule", label: "this card may conflict with", where: "down" });
  for (const r of state.rules) {
    if (r.meta.topic && r.meta.topic === card.canonicalTopic) add(r.meta.id, { kind: "rule", label: "a rule on the same topic", where: "down" });
  }

  for (const d of liveDependents(card, cards)) add(d.meta.id, { kind: "relies-on-this", label: "relies on this card", where: "down" });

  // The precedent: the newest settled decision on the same topic that isn't already shown (Client Data Contract:
  // partial, so it says which).
  const precedent = state.cards
    .filter((c) => c.status === "resolved" && c.canonicalTopic === card.canonicalTopic && c.meta.id !== m.id && !out.has(c.meta.id))
    .sort((a, b) => b.meta.created.localeCompare(a.meta.created))[0];
  if (precedent) add(precedent.meta.id, { kind: "precedent", label: "your precedent, on the same topic", where: "down" });

  return [...out.values()];
}

/** A stable hash, so a card's sides stay put for the session. */
function hash(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Which option goes on which side. Shuffled per card, with a salt new each session, so position can't hint at the agent's pick (D86). */
export function sidesFor(cardId: string, salt: string): { left: OptionKind; right: OptionKind } {
  return hash(`${salt}${cardId}`) % 2 === 0 ? { left: "proposal", right: "alternative" } : { left: "alternative", right: "proposal" };
}
