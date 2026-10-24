// Round 3 prototype data. Everything here is structured (D65): nothing is inferred by a model.

export const PROJECT = { name: "baesian", settled: 41, rules: 6 };

export const AREAS = [
  { id: "gate", name: "gate" },
  { id: "client", name: "client" },
  { id: "time", name: "time" },
  { id: "release", name: "release" },
];

export const WORKS = [
  { id: "feat/m3-gate", area: "gate", title: "The commit gate", agent: "claude-code", goal: "block commits whose decisions aren't covered" },
  { id: "feat/m4-client", area: "client", title: "The local server the client talks to", agent: "claude-code", goal: "let a person answer cards in a browser" },
  { id: "feat/m4-ui", area: "client", title: "The client's views", agent: "codex", goal: "show the queue, the card and the map" },
  { id: "main/time", area: "time", title: "Card timestamps", agent: "claude-code", goal: "one time format across the record" },
  { id: "release/0.1", area: "release", title: "Ship 0.1.0", agent: "codex", goal: "publish Baesian to npm" },
];

// Every decision on the map, settled or not. `t` orders decisions along their work's lane.
// state: settled | open | agent (an agent's own two-way-door choice, logged, no card) | deferred | rule
export const DECISIONS = [
  { id: "B-g1hk2", work: "feat/m3-gate", t: 1, short: "Check trailers in commit-msg", state: "settled", commits: ["Read trailers in commit-msg", "Stage the record in pre-commit", "Write the ledger in post-commit"] },
  { id: "B-g4mn8", work: "feat/m3-gate", t: 2, short: "Never put secrets in URLs", state: "rule" },
  { id: "B-g7pq1", work: "feat/m3-gate", t: 3, short: "One file per verdict", state: "settled", commits: ["Write each verdict to its own file", "Sync verdicts into the record"] },

  { id: "B-r4tz9", work: "feat/m4-client", t: 1, short: "Serve the client with Node's http module", state: "settled", commits: ["Add the local server", "Serve the built client", "Bind to 127.0.0.1", "Check the Host header"] },
  { id: "B-h2wq8", work: "feat/m4-client", t: 2, short: "Keep the access token in the URL fragment", state: "open", needs: ["B-r4tz9"], conflicts: ["B-g4mn8"] },
  { id: "B-k7m2p", work: "feat/m4-client", t: 3, short: "Push live updates with server-sent events", state: "open", needs: ["B-r4tz9"], commits: ["Add the live event stream", "Subscribe the queue view"] },

  { id: "B-q7r8s", work: "feat/m4-ui", t: 1, short: "Store card times as epoch integers", state: "settled", commits: ["Store card times as epoch integers"] },
  { id: "B-p3xr6", work: "feat/m4-ui", t: 2, short: "Stream the queue view from the live endpoint", state: "agent", needs: ["B-k7m2p"] },
  { id: "B-9fz6m", work: "feat/m4-ui", t: 3, short: "Cache rendered Markdown in memory", state: "open", commits: ["Cache rendered card bodies"] },
  { id: "B-x5cnr", work: "feat/m4-ui", t: 4, short: "Store verdicts in one shared file", state: "practice" },

  { id: "B-a1b2c", work: "main/time", t: 1, short: "Store times as ISO 8601 strings", state: "settled", commits: ["Store times as ISO strings", "Compare times as text", "Validate timestamps", "Sort verdicts by time", "Render times in the client"] },
  { id: "B-v8nq3", work: "main/time", t: 2, short: "Settle the time format conflict", state: "open", conflicts: ["B-a1b2c", "B-q7r8s"] },

  { id: "B-n0pm5", work: "release/0.1", t: 1, short: "Publish Baesian to npm", state: "deferred" },
  { id: "B-c5d1x", work: "release/0.1", t: 2, short: "Ship the built client in the npm package", state: "open", needs: ["B-n0pm5"] },
];

export const byDecision = (id) => DECISIONS.find((d) => d.id === id);
export const workOf = (d) => WORKS.find((w) => w.id === d.work);
export const areaOf = (d) => AREAS.find((a) => a.id === workOf(d).area);
export const dependentsOf = (id) => DECISIONS.filter((d) => (d.needs ?? []).includes(id));

// ------------------------------------------------------------------ rarity, from facts (Card Rarity)

const HARD_FACTS = new Set(["security", "money", "data-loss", "publishes"]);

/**
 * Rarity is computed from what the card states and what's built on it; never from the agent's claim
 * about importance. Returns the rarity and the reasons, so the card can say why.
 */
export function rarityOf(card) {
  const d = byDecision(card.decision);
  const built = (d.commits ?? []).length;
  const deps = dependentsOf(d.id).length;
  const why = [];
  if (card.touches.some((f) => HARD_FACTS.has(f))) {
    why.push(`touches ${card.touches.filter((f) => HARD_FACTS.has(f)).join(" and ")}`);
    if (card.blocking) why.push("an agent has stopped for it");
    return { rarity: "mythic", tier: "high", why };
  }
  if (card.reverse === "one-way" || built + deps >= 4 || card.kind === "conflict") {
    if (card.reverse === "one-way") why.push("one-way to reverse");
    if (card.kind === "conflict") why.push("two settled decisions disagree");
    if (built + deps >= 4) why.push(`${built + deps} things build on it`);
    return { rarity: "rare", tier: "high", why };
  }
  if (built + deps >= 1 || card.reverse === "moderate") {
    if (built) why.push(`${built} commit${built === 1 ? "" : "s"} built on it`);
    if (deps) why.push(`${deps} decision${deps === 1 ? "" : "s"} depend${deps === 1 ? "s" : ""} on it`);
    if (card.reverse === "moderate") why.push("moderate cost to reverse");
    return { rarity: "uncommon", tier: "medium", why };
  }
  why.push("reversible, and nothing is built on it yet");
  return { rarity: "common", tier: "low", why };
}

export const RARITY = {
  common: { name: "Common", mark: "●" },
  uncommon: { name: "Uncommon", mark: "◆" },
  rare: { name: "Rare", mark: "★" },
  mythic: { name: "Mythic", mark: "♛" },
};

// ------------------------------------------------------------------ the cards (the open decisions)
// Card format trials (D70): trigger, type + precedent, contrastive options with a flip condition,
// a hedged rationale of at most ~25 words, sinks-if with where to check, a projection per answer,
// and candidate context cues ranked by a rule-based value of information.

export const CARDS = [
  {
    decision: "B-h2wq8", agent: "claude-code", blocking: true, touches: ["security"], reverse: "one-way",
    trigger: "I'm writing the server's request check, and I've stopped until you answer.",
    type: "A one-way security choice: bookmarks and Tailscale links will depend on it.",
    precedent: "Your nearest past verdict: you made “never put secrets in URLs” a rule, in the gate work.",
    question: "Keep the client's access token in the URL fragment?",
    proposal: { name: "In the URL fragment", because: "the page reads it, sends it as a header and strips it, so it never reaches server logs", betterIf: "links must work on a new browser with no login step" },
    alternative: { name: "A cookie set on first visit", winsIf: "the rule against secrets in URLs covers fragments too", betterIf: "no secret may ever appear in an address bar, even briefly" },
    keyQuestion: "Does your rule against secrets in URLs cover the part after the #?",
    rationale: "I think the fragment is safe enough because it never leaves the browser, but I'm unsure the rule allows it.",
    sinksIf: { claim: "Wrong if any page can run a script that reads the address bar.", check: "src/client/index.html loads no external scripts today" },
    projection: { proposal: "claude-code resumes; links look like /#t=…", alternative: "claude-code adds a cookie and a login step for each new browser" },
    cues: [
      { kind: "conflict", voi: 10, text: "It conflicts with a rule you accepted: “never put secrets in URLs”.", why: "a rule you set would forbid the proposal" },
      { kind: "depends", voi: 3, text: "It builds on a settled decision: serve the client with Node's http module.", why: "settled, so unlikely to change your answer" },
    ],
  },
  {
    decision: "B-k7m2p", agent: "claude-code", blocking: false, touches: ["public-api"], reverse: "moderate",
    trigger: "I'm building the live view, and carrying on with this while you decide.",
    type: "A reversible library choice inside one module.",
    precedent: "Your nearest past verdict: you accepted “serve the client with Node's http module”.",
    question: "Push live updates to the client with server-sent events?",
    proposal: { name: "Server-sent events", because: "updates only flow from the server, the browser reconnects by itself, and no dependency is needed" },
    alternative: { name: "WebSockets", winsIf: "the client has to send live data back on the same connection" },
    rationale: "I'm fairly sure one-way is enough, though I haven't checked whether presence heartbeats should share the connection.",
    sinksIf: { claim: "Wrong if the presence heartbeat moves onto the live connection.", check: "the presence design (D41) sends it as a separate request" },
    projection: { proposal: "2 commits stay; codex keeps streaming the queue view", alternative: "rework 2 commits in the live stream; add a dependency" },
    cues: [
      { kind: "changed", voi: 9, text: "Changed since you last looked: the presence heartbeat is now sent every 30 seconds.", why: "it bears directly on the flip condition" },
      { kind: "depends", voi: 3, text: "It builds on a settled decision: serve the client with Node's http module.", why: "settled, so unlikely to change your answer" },
    ],
  },
  {
    decision: "B-v8nq3", agent: "codex", blocking: true, touches: ["schema"], reverse: "moderate", kind: "conflict",
    trigger: "Merging the client's views into main is blocked on this.",
    type: "A conflict between two settled decisions about a stored format.",
    precedent: "Your nearest past verdict: you accepted ISO 8601 strings for the record, in the timestamps work.",
    question: "Two decisions store times differently. Keep ISO 8601 strings, or Unix epoch integers?",
    proposal: { name: "ISO 8601 strings", because: "already used across main: readable in the record, and sortable as text", betterIf: "people and git read the record more than the charts do" },
    alternative: { name: "Unix epoch integers", winsIf: "the client's charts can't afford converting strings", betterIf: "the client's charts read times far more than people do" },
    keyQuestion: "Who reads stored times most: people and git, or the client's charts?",
    rationale: "I'd keep main's choice; the epoch decision was local to the views and I didn't know it conflicted.",
    sinksIf: { claim: "Wrong if the record is read mostly by the charts, not by people and git.", check: "who reads .baesian/verdicts most: the CLI, the gate, and the client" },
    projection: { proposal: "codex reworks 1 commit in the views; the merge proceeds", alternative: "5 commits on main move to integers; the record becomes harder to read" },
    cues: [
      { kind: "conflict", voi: 9, text: "Two settled decisions disagree: ISO strings on main, epoch integers in the views.", why: "whichever loses is superseded" },
      { kind: "built", voi: 6, text: "Five commits on main already build on ISO strings.", why: "the cost of reversing is asymmetric" },
    ],
  },
  {
    decision: "B-x5cnr", agent: "codex", blocking: false, touches: ["schema"], reverse: "moderate", practice: true,
    trigger: "I'm adding the client's answer endpoint, and carrying on with this while you decide.",
    type: "A storage format choice for the record.",
    precedent: "Your nearest past verdict: you accepted “one file per verdict”, in the gate work.",
    question: "Store the client's verdicts in one shared file?",
    proposal: { name: "One shared verdicts.jsonl", because: "a single file is simpler to read, append and back up" },
    alternative: { name: "One file per verdict", winsIf: "several worktrees or machines write verdicts at once" },
    rationale: "I'm confident a single append-only file is the simplest thing that works here.",
    sinksIf: { claim: "Wrong if two branches append to it and then merge.", check: "the gate's record sync (one file per verdict today)" },
    projection: { proposal: "codex writes verdicts to one file", alternative: "codex reuses the per-verdict files" },
    cues: [
      { kind: "precedent", voi: 8, text: "You decided the opposite in October: one file per verdict, so merges never conflict.", why: "your own precedent points the other way" },
    ],
    reveal: "Practice card. It's a variation on “one file per verdict”, which you settled in October, with the option you rejected as the proposal. A shared file conflicts whenever two branches merge.",
  },
  {
    decision: "B-c5d1x", agent: "codex", blocking: false, touches: [], reverse: "cheap",
    trigger: "I'm writing the release script, and carrying on with this while you decide.",
    type: "A reversible packaging default.",
    precedent: "No past verdict on packaging yet: this one would set the precedent.",
    question: "Ship the built client inside the npm package?",
    proposal: { name: "Yes, as static files", because: "baesian serve then works offline, and the client's version always matches the CLI" },
    alternative: { name: "Serve it from a CDN", winsIf: "the package's size matters more than working offline" },
    rationale: "I lean towards shipping it, but publishing itself is deferred, so this may be early.",
    sinksIf: { claim: "Wrong if Baesian is never published to npm.", check: "the deferred decision on publishing to npm at all" },
    projection: { proposal: "codex copies the client into dist/client", alternative: "codex adds a CDN URL and a version check" },
    firstEdition: true,
    cues: [
      { kind: "open-dep", voi: 7, text: "It depends on a decision that's deferred: publish Baesian to npm at all.", why: "if that one goes the other way, this card no longer applies" },
    ],
  },
  {
    decision: "B-9fz6m", agent: "codex", blocking: false, touches: [], reverse: "cheap", kind: "audit",
    trigger: "A sample of decisions agents make without a card, so you can check their judgement.",
    type: "An agent's own two-way door, made without asking.",
    precedent: "Your nearest past verdicts: you let both earlier in-memory caches in the client stand.",
    question: "Let “cache rendered Markdown in memory” stand?",
    proposal: { name: "Let it stand", because: "rendered card bodies stay in memory, and are cleared when a file changes" },
    alternative: { name: "Overturn: render every request", winsIf: "the cache ever serves a stale card" },
    rationale: "I added it because rendering felt slow, but I haven't measured it.",
    sinksIf: { claim: "Wrong if a changed card can be shown from the cache.", check: "the cache clears on file change (src/client/render.ts)" },
    projection: { proposal: "the cache stays", alternative: "codex removes the cache; rendering happens per request" },
    cues: [
      { kind: "precedent", voi: 4, text: "You let both earlier in-memory caches in the client stand.", why: "your own precedent" },
    ],
  },
];

export const CALIBRATION_BASELINE = {
  answered: 38,
  reverted: [{ text: "Inline the client's CSS", note: "you accepted it; it was reverted two days later" }],
  workedAround: 2,
  heldUp: 2,
  canaries: { caught: 3, of: 4 },
};
