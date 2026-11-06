// Whether an agent's message puts a choice to the person in chat (B-qrdhh), and what the hooks say when it may. Pure,
// with no Node, so the Stop hook and the tests read it alike.
//
// The check is a pattern, cheap enough to run at the end of every turn: a sentence that asks (a question, "say which",
// "tell me whether") and carries alternatives, an offer of two ways followed by "Shall I?", a request to accept or
// overturn the agent's picks. It doesn't judge: when it fires, the hook asks the agent itself whether its message asked
// the person to choose, and the agent, who knows the conversation, files a card or ends its turn. Measured on 228 turn
// endings from Baesian's own development, labelled by hand (test/fixtures/turn-endings.json, B-qrdhh's research note).

/** Only the end of a message is read: that's where a turn's ask is, and a long report's quotes stay out of it. */
export const CHOICE_TAIL = 1500;

/** Code, links, quotes and emphasis out, so their dots, question marks and "or"s don't count. */
const clean = (text) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, "code")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/"[^"\n]*"|“[^”\n]*”/g, "quote")
    .replace(/[*_]{1,2}(?=\S)|(?<=\S)[*_]{1,2}/g, "");

/** The message's sentences, and its list items and lines, without their bullets. */
export function sentencesOf(text) {
  return clean(text)
    .split(/(?<=[.!?:])\s+|\n+/)
    .map((s) => s.replace(/^[\s>\-–•\d.)#|]+/, "").trim())
    .filter(Boolean);
}

const LEAD = /^(?:and|but|so|also|or),? /i;
/** A sentence that asks something of the person. */
const ASKS = /\?\W*$|\b(?:say|tell me|let me know)\b[^.]*\b(?:which|whether|prefer)\b/i;
/** Alternatives, but not "or not", "or so", "or similar". */
const OR = /\bor\b(?! (?:not|so|similar|later|two|more|less)\b)/i;
/** A go-ahead ("Shall I commit, or wait?"), or a question of fact ("Did you install it from Chrome or Safari?"). */
const GO_OR_FACT = /^(?:shall|should|can|may|do you want me to|want me to) I\b(?! go with)|^(?:what|when|who|how|will|would|did|does|do you|have you|are you|is (?:it|this|that|there))\b/i;
const PREFER = /\bprefer\b|\brather\b|\bwhich (?:one|option|of (?:these|them|the))\b|^(?:please )?say which\b/i;
/** Two ways offered ("I can lowercase it, or tell agents to…"), for a short ask that follows. */
const OFFER = /\bI(?:'d| would| can| could)\b[^?]*,? or\b|\b(?:options?|alternatives?|either)\b[^?]*\bor\b/i;
const SHORT_ASK = /^(?:shall I|should I|ok|okay|which|which one)\?$|^(?:please )?say which\b|\bprefer\b|\brather\b/i;
/** The agent's picks, put for approval. */
const ACCEPT = /\baccept\b[^.]*\bor\b[^.]*\b(?:change|overturn)|\bsign off\b|\byou can accept\b/i;
const GO_WITH = /\bshall I go with\b|\bmy recommendation on each\b|\bwith (?:those|these) defaults\?/i;
const UNLESS = /\bunless you'?d rather\b/i;
const NUMBERED = /\(\s*\d\s*,\s*\d\s*,?\s*or\s*\d\s*\)|\boptions? [1-9A-C]\b/i;
const CHOOSE = /^(?:please )?(?:pick|choose) (?:one|between)\b|\bI need you to (?:choose|pick|decide)\b/i;
/** Yes-or-no design questions: "Should old branches fold away?", "Do you want X added?", "Is X worth it?". */
const SHOULD_IT = /^should (?!I\b)[^?]*\?$/i;
const WANT_IT = /\b(?:do|would) you (?:want|like) (?!me\b|to\b)[^?]*\?$/i;
const WORTH = /\bworth it\?$/i;
/** "Tell me whether to accept them or what to change", across a list's lines. */
const WHETHER = /\b(?:tell me|waiting on your answers?|let me know)\b[^.?]*\bwhether\b[^.?]*\bor\b/i;

/** What in the end of a message looks like a choice put to the person: each signal's name, once. */
export function choiceSignals(message) {
  const text = typeof message === "string" ? message.slice(-CHOICE_TAIL) : "";
  const found = new Set();
  const s = sentencesOf(text);
  s.forEach((raw, i) => {
    const x = raw.replace(LEAD, "");
    const ask = ASKS.test(x);
    if (ask && OR.test(x) && !GO_OR_FACT.test(x)) found.add("or");
    if (ask && PREFER.test(x)) found.add("prefer");
    if (!ask && OFFER.test(x) && s[i + 1] && SHORT_ASK.test(s[i + 1].replace(LEAD, ""))) found.add("offer");
    if (ACCEPT.test(x)) found.add("accept");
    if (GO_WITH.test(x)) found.add("go-with");
    if (UNLESS.test(x)) found.add("unless");
    if (NUMBERED.test(x)) found.add("numbered");
    if (CHOOSE.test(x)) found.add("choose");
    if (SHOULD_IT.test(x)) found.add("should");
    if (WANT_IT.test(x)) found.add("want");
    if (WORTH.test(x)) found.add("worth");
  });
  if (WHETHER.test(clean(text))) found.add("whether");
  return [...found];
}

/** Whether the end of a message may put a choice to the person. */
export function asksChoice(message) {
  return choiceSignals(message).length > 0;
}

/**
 * What the agent is told when its last message may put a choice to the person (B-qrdhh): it judges, since it knows the
 * conversation, and either files a card or ends its turn. Said once a turn: the hook stays quiet while the agent is
 * carrying on because of a Stop hook.
 */
export const CHOICE_REASON = [
  "Baesian: does your last message ask the person to choose between options for a design decision, or to approve your picks for one?",
  "If it does, put it to them as a card instead (`baesian file`, or the file_card tool), and if they're in the conversation, tell them it's in their deck without listing the options: the reviewer chooses before seeing your pick.",
  "If it doesn't (a go-ahead on work already decided, a question of fact, what to do next, a report, a card already filed), end your turn with no further message.",
].join(" ");

/**
 * What the agent is told when it opens the question tool (B-qrdhh). The question is refused once; asked again unchanged,
 * it goes through, so a question of fact costs one retry.
 */
export const QUESTION_REASON = [
  "Baesian: if this question asks the person to choose between options for a design decision, put it to them as a card instead (`baesian file`, or the file_card tool), and tell them it's in their deck without listing the options: the reviewer chooses before seeing your pick.",
  "If it's a question of fact (what they want, what they saw, what's true), ask it again unchanged and it will go through.",
].join(" ");
