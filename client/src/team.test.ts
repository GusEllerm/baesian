import { describe, expect, it } from "vitest";
import type { ApiCard, ApiState } from "../../src/api";
import { TODAY } from "../../src/routing";
import { parked, queue } from "./model";
import { type Team, ago, decidedByAnother, passedBy, sentToMe, sentWords, waitsForMe } from "./team";

// Several reviewers on the desk (P20): whose a card is, what waits for you, and what the queue leads with (B-tzdjn),
// against hand-built snapshots. The relay's own tests (service/test/sent-to.test.ts) cover the same rules where it counts.

const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const ANA = "acct-ana", BEN = "acct-ben", CAT = "acct-cat";
const handles = new Map([
  [ANA, "ana"],
  [BEN, "ben"],
  [CAT, "cat"],
]);
const ana: Team = { me: ANA, role: "owner", handles };
const ben: Team = { me: BEN, role: "member", handles };
const cat: Team = { me: CAT, role: "member", handles };
const alone: Team = { me: ANA, role: "owner", handles: new Map([[ANA, "ana"]]) };

let n = 0;
function card(over: Partial<ApiCard["meta"]> = {}, rest: Partial<Omit<ApiCard, "meta">> = {}): ApiCard {
  n += 1;
  const id = over.id ?? `B-${String(n).padStart(5, "0").replace(/[ilou]/g, "0")}`;
  const topic = over.topic ?? "area/subject";
  return {
    meta: {
      type: "card", format: 1, id, revision: 1, title: `Decision ${n}`, question: `Which option for ${n}?`, doing: "working",
      topic, deck: "branch-main", level: "provisional", touches: [], reverse: "cheap",
      proposal: "Option A", proposal_then: "A happens", alternative: "Option B", alternative_then: "B happens", also_considered: [],
      crux: "Does A fit?", crux_proposal: "If it does", crux_alternative: "If it doesn't",
      rules: [], proposal_breaks: [], alternative_breaks: [], depends_on: [], domain: [], evidence: [], rule_covers: [],
      source_agent: "claude-code", source_branch: "main", created: at(n),
      ...over,
    },
    body: "", revisions: 1, replied: false, status: "open", canonicalTopic: topic, verdicts: [], dependents: [], briefs: [], waiting: [], fallbacks: [], attachments: 0,
    ...rest,
  };
}

const verdict = (c: ApiCard, account: string | undefined, response: ApiCard["verdicts"][number]["response"], s = 50): ApiCard["verdicts"][number] =>
  ({ type: "verdict", format: 1, card: c.meta.id, revision: c.meta.revision, response, reviewer: account ? handles.get(account)! : "gus", at: at(s), ...(account ? { account } : {}) }) as ApiCard["verdicts"][number];

/** A card as it is once `by` have each said it's outside their expertise, in that order. */
function passed(c: ApiCard, ...by: (string | undefined)[]): ApiCard {
  return { ...c, status: "rerouted", verdicts: by.map((a, i) => verdict(c, a, "not_my_area", 50 + i)) };
}

const pooled = { shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, agreed: 0, cameRound: 0, unblind: 0, unanswered: 0, heldWaiting: 0, inChat: 0 };
const snapshot = (cards: ApiCard[]): ApiState => ({
  version: 1,
  server: { pid: 1, started: at(0), now: at(100), watch: "events" },
  project: { name: "repo", branch: "relay" },
  decks: [],
  rules: [],
  cards,
  routing: { settings: TODAY, history: [], report: { rows: {}, pooled, beforeGate: 0 } },
  problems: [],
});
const ids = (cards: ApiCard[]) => cards.map((c) => c.meta.id);

describe("whose a card is (B-2n7s4, B-tzdjn)", () => {
  it("is yours when it was sent to your account, or to nobody in particular and you're an owner", () => {
    expect(sentToMe(card({}, { sent_to: BEN }), ben)).toBe(true);
    expect(sentToMe(card({}, { sent_to: BEN }), ana)).toBe(false);
    expect(sentToMe(card(), ana)).toBe(true);
    expect(sentToMe(card(), ben)).toBe(false);
  });

  it("says whom it was sent to on everyone else's desk, and nothing in a project of one", () => {
    const bens = card({}, { sent_to: BEN });
    expect(sentWords(bens, ana)).toBe("sent to ben");
    expect(sentWords(bens, ben)).toBeUndefined();
    expect(sentWords(card(), ben)).toBe("sent to the owners");
    expect(sentWords(card(), ana)).toBeUndefined();
    expect(sentWords(card({}, { sent_to: ANA }), alone)).toBeUndefined();
    expect(sentWords(card(), undefined)).toBeUndefined();
    // Someone who has since left, should the state still name them.
    expect(sentWords(card({}, { sent_to: "acct-gone" }), ana)).toBe("sent to someone who has left");
  });

  it("says who passed it on, whoever it was sent to first", () => {
    const bens = card({}, { sent_to: BEN });
    expect(sentWords(passed(bens, BEN), ana)).toBe("passed on by ben");
    expect(sentWords(passed(bens, CAT), ana)).toBe("passed on by cat");
    expect(sentWords(passed(bens, CAT, BEN), ana)).toBe("passed on by ben");
    // An owner's own card another member put aside is still simply theirs.
    expect(sentWords(passed(card(), ANA), ben)).toBe("passed on by ana");
  });
});

describe("what waits for you (B-r51ts: every member's)", () => {
  it("an open card waits for every member, but one only owners answer", () => {
    const open = card({}, { sent_to: BEN });
    for (const t of [ana, ben, cat]) expect(waitsForMe(open, t)).toBe(true);
    const draft = card({ rule: "No card for small dev dependencies." });
    expect(waitsForMe(draft, ana)).toBe(true);
    expect(waitsForMe(draft, ben)).toBe(false);
    // With no team (`baesian serve`), an open card waits, as ever.
    expect(waitsForMe(draft, undefined)).toBe(true);
  });

  it("a card someone passed on waits for everyone else; passed by all, or from before linking, for nobody", () => {
    const bens = card({}, { sent_to: BEN });
    expect(passedBy(passed(bens, BEN))).toEqual([BEN]);
    expect(waitsForMe(passed(bens, BEN), ana)).toBe(true);
    expect(waitsForMe(passed(bens, BEN), ben)).toBe(false);
    expect(waitsForMe(passed(bens, BEN, ANA), cat)).toBe(true);
    expect(waitsForMe(passed(bens, BEN, ANA, CAT), cat)).toBe(false);
    // An answer from before linking names no account: nobody knows who passed it, so it waits for nobody.
    expect(passedBy(passed(bens, undefined))).toEqual([]);
    expect(waitsForMe(passed(bens, undefined), ana)).toBe(false);
    // With no team, a passed-on card is parked.
    expect(waitsForMe(passed(bens, BEN), undefined)).toBe(false);
    // A member who passed it and then answered it hasn't passed it.
    const back = { ...bens, status: "rerouted" as const, verdicts: [verdict(bens, BEN, "not_my_area", 50), verdict(bens, ANA, "not_my_area", 51), verdict(bens, BEN, "need_context", 52), verdict(bens, ANA, "not_my_area", 53)] };
    expect(passedBy(back)).toEqual([ANA]);
  });
});

describe("the queue, in a team (B-tzdjn: sent to one, open to all)", () => {
  it("leads with the cards sent to you, then the rest, each part in the queue's own order", () => {
    const bensRare = card({ reverse: "one-way" }, { sent_to: BEN });
    const anas = card({}, { sent_to: ANA });
    const owners = card();
    const bensStopped = card({}, { sent_to: BEN, waiting: [{ agent: "claude-code", at: at(95), stale: false }] as ApiCard["waiting"] });
    const s = snapshot([bensRare, anas, owners, bensStopped]);
    // Ana, an owner: hers and the owners' first; then Ben's, the one an agent has stopped for ahead of the rarer one.
    expect(ids(queue(s, T0 + 100_000, ana))).toEqual(ids([anas, owners, bensStopped, bensRare]));
    // Ben: his own first, the stopped one leading; then the rest.
    expect(ids(queue(s, T0 + 100_000, ben))).toEqual(ids([bensStopped, bensRare, anas, owners]));
    // With no team, the queue is as it always was.
    expect(ids(queue(s, T0 + 100_000))).toEqual(ids([bensStopped, bensRare, anas, owners]));
  });

  it("holds a card someone else passed on, and parks only the ones you passed", () => {
    const bens = passed(card({}, { sent_to: BEN }), BEN);
    const anas = passed(card({}, { sent_to: ANA }), ANA);
    const s = snapshot([bens, anas]);
    expect(ids(queue(s, T0, ana))).toEqual(ids([bens]));
    expect(ids(parked(s, ana))).toEqual(ids([anas]));
    expect(ids(queue(s, T0, ben))).toEqual(ids([anas]));
    expect(ids(parked(s, ben))).toEqual(ids([bens]));
    // Cat passed neither: both are hers to answer.
    expect(ids(queue(s, T0, cat))).toEqual(ids([bens, anas]));
    expect(parked(s, cat)).toEqual([]);
    // With no team, both are parked.
    expect(queue(s, T0)).toEqual([]);
    expect(ids(parked(s))).toEqual(ids([bens, anas]));
  });

  it("leaves a card only owners answer off a member's desk", () => {
    const draft = card({ rule: "No card for small dev dependencies." });
    const s = snapshot([draft]);
    expect(ids(queue(s, T0, ana))).toEqual(ids([draft]));
    expect(queue(s, T0, ben)).toEqual([]);
    expect(parked(s, ben)).toEqual([]);
  });
});

describe("a card someone else decided", () => {
  it("names who decided it, when it wasn't you", () => {
    const c = card({}, { sent_to: BEN });
    const decided = { ...c, status: "resolved" as const, verdicts: [verdict(c, BEN, "accept")] };
    expect(decidedByAnother(decided, ana)).toBe("ben");
    expect(decidedByAnother(decided, ben)).toBeUndefined();
    expect(decidedByAnother(c, ana)).toBeUndefined();
    expect(decidedByAnother(decided, undefined)).toBeUndefined();
    expect(decidedByAnother(undefined, ana)).toBeUndefined();
    // Whoever answered last decided it.
    expect(decidedByAnother({ ...decided, verdicts: [verdict(c, BEN, "need_context", 40), verdict(c, CAT, "accept", 60)] }, ana)).toBe("cat");
  });
});

describe("how long ago", () => {
  it("says it in a few words", () => {
    const now = T0;
    expect(ago(now - 20_000, now)).toBe("just now");
    expect(ago(now - 60_000, now)).toBe("1 minute ago");
    expect(ago(now - 40 * 60_000, now)).toBe("40 minutes ago");
    expect(ago(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(ago(now - 5 * 3600_000, now)).toBe("5 hours ago");
    expect(ago(now - 49 * 3600_000, now)).toBe("2 days ago");
    // A clock a little ahead never says "in the future".
    expect(ago(now + 5000, now)).toBe("just now");
  });
});
