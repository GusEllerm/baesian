// Round 4 prototype data. Everything here is structured (D65): nothing is inferred by a model.

export const PROJECT = { name: "baesian", settled: 41, rules: 6 };

export const AREAS = [
  { id: "gate", name: "gate" },
  { id: "client", name: "client" },
  { id: "time", name: "time" },
  { id: "release", name: "release" },
];

export const WORKS = [
  { id: "feat/m3-gate", area: "gate", title: "The commit gate", agent: "claude-code" },
  { id: "feat/m4-client", area: "client", title: "The local server the client talks to", agent: "claude-code" },
  { id: "feat/m4-ui", area: "client", title: "The client's views", agent: "codex" },
  { id: "main/time", area: "time", title: "Card timestamps", agent: "claude-code" },
  { id: "release/0.1", area: "release", title: "Ship 0.1.0", agent: "codex" },
];

// Every decision on the map, settled or not. `t` orders decisions along their work's lane.
// state: settled | open | agent (an agent's own two-way-door choice, logged, no card) | deferred | rule | practice
// `short` names the decision everywhere outside its card. Cards answered human-first (rare and mythic)
// get a neutral name, so the chip and the map don't give the agent's pick away.
export const DECISIONS = [
  { id: "B-g1hk2", work: "feat/m3-gate", t: 1, short: "Check trailers in commit-msg", state: "settled", commits: ["Read trailers in commit-msg", "Stage the record in pre-commit", "Write the ledger in post-commit"] },
  { id: "B-g4mn8", work: "feat/m3-gate", t: 2, short: "Never put secrets in URLs", state: "rule" },
  { id: "B-g7pq1", work: "feat/m3-gate", t: 3, short: "One file per verdict", state: "settled", commits: ["Write each verdict to its own file", "Sync verdicts into the record"] },

  { id: "B-r4tz9", work: "feat/m4-client", t: 1, short: "Serve the client with Node's http module", state: "settled", commits: ["Add the local server", "Serve the built client", "Bind to 127.0.0.1", "Check the Host header"] },
  { id: "B-h2wq8", work: "feat/m4-client", t: 2, short: "Where the access token lives", state: "open", needs: ["B-r4tz9"], conflicts: ["B-g4mn8"] },
  { id: "B-k7m2p", work: "feat/m4-client", t: 3, short: "How live updates reach the browser", state: "open", needs: ["B-r4tz9"], commits: ["Add the live event stream", "Subscribe the queue view"] },

  { id: "B-q7r8s", work: "feat/m4-ui", t: 1, short: "Store card times as epoch integers", state: "settled", commits: ["Store card times as epoch integers"] },
  { id: "B-p3xr6", work: "feat/m4-ui", t: 2, short: "Stream the queue view from the live endpoint", state: "agent", needs: ["B-k7m2p"] },
  { id: "B-9fz6m", work: "feat/m4-ui", t: 3, short: "Cache rendered Markdown in memory", state: "open", commits: ["Cache rendered card bodies"] },
  { id: "B-x5cnr", work: "feat/m4-ui", t: 4, short: "Store verdicts in one shared file", state: "practice" },

  { id: "B-a1b2c", work: "main/time", t: 1, short: "Store times as ISO 8601 strings", state: "settled", commits: ["Store times as ISO strings", "Compare times as text", "Validate timestamps", "Sort verdicts by time", "Render times in the client"] },
  { id: "B-v8nq3", work: "main/time", t: 2, short: "Which time format the record uses", state: "open", conflicts: ["B-a1b2c", "B-q7r8s"] },
  { id: "B-t3rel", work: "main/time", t: 3, short: "Relative times in the queue", state: "open", needs: ["B-v8nq3"] },

  { id: "B-n0pm5", work: "release/0.1", t: 1, short: "Publish Baesian to npm", state: "deferred" },
  { id: "B-c5d1x", work: "release/0.1", t: 2, short: "Ship the built client in the npm package", state: "open", needs: ["B-n0pm5"] },
];

export const byDecision = (id) => DECISIONS.find((d) => d.id === id);
export const workOf = (d) => WORKS.find((w) => w.id === d.work);
export const areaOf = (d) => AREAS.find((a) => a.id === workOf(d).area);
export const dependentsOf = (id) => DECISIONS.filter((d) => (d.needs ?? []).includes(id));

export const STATE_WORDS = {
  settled: "settled",
  rule: "your rule",
  agent: "an agent's own call",
  deferred: "deferred",
  open: "waiting for you",
  practice: "waiting for you",
};

// ------------------------------------------------------------------ rarity, from facts (Card Rarity)

const HARD_FACTS = new Set(["security", "money", "data-loss", "publishes"]);

/**
 * Rarity is computed from what the card states and what's built on it, never from the agent's claim
 * about importance. Returns the rarity, its tier, and the reasons in plain words, so the card can say why.
 */
export function rarityOf(card) {
  // Commits aren't counted: the ledger only knows commits that cite the card (Client Data Contract, D71).
  const d = byDecision(card.decision);
  const deps = dependentsOf(d.id).length;
  const why = [];
  const hard = card.touches.filter((f) => HARD_FACTS.has(f));
  if (hard.length) {
    why.push(`it touches ${hard.join(" and ")}`);
    if (card.reverse === "one-way") why.push("it's hard to undo");
    if (card.blocking) why.push("an agent has stopped for it");
    return { rarity: "mythic", tier: "high", why };
  }
  if (card.reverse === "one-way" || deps >= 3 || card.kind === "conflict") {
    if (card.kind === "conflict") why.push("two settled decisions disagree");
    if (card.reverse === "one-way") why.push("it's hard to undo");
    if (deps >= 3) why.push(`${deps} decisions depend on it`);
    if (card.blocking) why.push("an agent is waiting on it");
    return { rarity: "rare", tier: "high", why };
  }
  if (deps >= 1 || card.reverse === "moderate") {
    if (deps) why.push(`${deps} decision${deps === 1 ? " depends" : "s depend"} on it`);
    if (card.reverse === "moderate") why.push("it's moderately costly to undo");
    return { rarity: "uncommon", tier: "medium", why };
  }
  why.push(card.kind === "audit" ? "it's an agent's own call, sampled for you to check, and cheap to undo" : "it's cheap to undo and nothing is built on it yet");
  return { rarity: "common", tier: "low", why };
}

export const RARITY = {
  common: { name: "Common", mark: "●", rank: "the lowest of four levels" },
  uncommon: { name: "Uncommon", mark: "◆", rank: "the second of four levels" },
  rare: { name: "Rare", mark: "★", rank: "the third of four levels" },
  mythic: { name: "Mythic", mark: "♛", rank: "the highest of four levels" },
};

// ------------------------------------------------------------------ the cards (the open decisions)
// Each option: a name, when it's the better choice, and what happens if you choose it (`then`).
// `case` is the agent's hedged rationale and what would prove it wrong. `cue` is the one piece of context
// most likely to change the answer (the highest value of information). `precedent` is the nearest past
// verdict. `outside` lists things outside the repo that depend on the answer.

export const CARDS = [
  {
    decision: "B-h2wq8", agent: "claude-code", blocking: true, touches: ["security"], reverse: "one-way",
    doing: "writing the server's request check",
    crux: { q: "Does your rule “never put secrets in URLs” cover the part of a link after the #?", proposal: "If it doesn't", alternative: "If it does" },
    premise: { option: "proposal", claim: "is only safe if no page in the client runs a script that can read the address bar", check: "src/client/index.html loads no external scripts" },
    trigger: "I'm writing the server's request check, and I've stopped until you answer.",
    question: "Where should the client's access token live?",
    proposal: { name: "In the URL fragment", betterIf: "links must open in a new browser with no login step", then: "every link carries the token, as /#t=…" },
    alternative: { name: "In a cookie set on first visit", betterIf: "no secret may ever appear in an address bar, even briefly", then: "each new browser needs a one‑time login" },
    case: { rationale: "I think the fragment is safe enough because it never leaves the browser, but I'm unsure your rule allows it.", wrongIf: "any page can run a script that reads the address bar", check: "src/client/index.html loads no external scripts today" },
    cue: { text: "Your rule “never put secrets in URLs” may rule out the fragment, if the part after the # counts.", why: "a rule you set could settle it outright" },
    precedent: { ref: "B-g4mn8", text: "You made this a rule in October." },
    // What each option does to a related decision, where they differ. Declared by the agent (Client Data Contract).
    effects: { "B-g4mn8": { proposal: { text: "may break it", bad: true }, alternative: { text: "keeps to it" } } },
    outside: [{ name: "Bookmarks and Tailscale links", fate: { proposal: { text: "carry the token" }, alternative: { text: "need a login in each new browser", cost: true } } }],
  },
  {
    decision: "B-k7m2p", agent: "claude-code", blocking: false, touches: ["public-api"], reverse: "moderate",
    doing: "building the live view",
    crux: { q: "Will the browser ever need to send live data back on this connection?", proposal: "If it won't", alternative: "If it will", fact: "The presence heartbeat goes every 30 seconds, as its own request today." },
    acted: { option: "proposal", text: "2 commits, “Add the live event stream” and “Subscribe the queue view”", matches: true },
    trigger: "I'm building the live view, and carrying on with this while you decide.",
    question: "WebSockets or server‑sent events for live updates?",
    proposal: { name: "Server-sent events", betterIf: "updates only ever flow from the server to the browser", then: "both commits stay; codex keeps streaming the queue view" },
    alternative: { name: "WebSockets", betterIf: "the browser must send live data back on the same connection", then: "claude-code reworks 2 commits and adds a dependency" },
    case: { rationale: "I'm fairly sure one-way is enough, though I haven't checked whether presence heartbeats should share the connection.", wrongIf: "the presence heartbeat moves onto the live connection", check: "the presence design sends it as a separate request" },
    cue: { text: "If the presence heartbeat (now every 30 seconds) moves onto this connection, the browser has to send too.", why: "it decides whether one-way is enough" },
    precedent: { ref: "B-r4tz9", text: "You accepted this last week." },
  },
  {
    decision: "B-v8nq3", agent: "codex", blocking: true, touches: ["schema"], reverse: "moderate", kind: "conflict",
    doing: "merging the client's views into main",
    crux: { q: "Who reads stored times most: people and git, or the client's charts?", proposal: "If people and git", alternative: "If the charts", fact: "People read the record in every pull request; the charts read card times once per page load." },
    trigger: "Merging the client's views into main is blocked until you answer.",
    question: "Which time format should the record use?",
    proposal: { name: "ISO 8601 strings", keeps: "B-a1b2c", betterIf: "people and git read the record more than the charts do", then: "codex reworks 1 commit in the views" },
    alternative: { name: "Unix epoch integers", keeps: "B-q7r8s", betterIf: "the client's charts read times far more than people do", then: "claude-code reworks 5 commits on main" },
    case: { rationale: "I'd keep main's choice. The epoch decision was local to the views, and I didn't know it conflicted.", wrongIf: "the record is read mostly by the charts, not by people and git", check: "who reads .baesian/verdicts most: the CLI, the gate or the client" },
    cue: { text: "People read the record in every pull request; the client's charts read card times once per page load.", why: "it decides which format pays for itself" },
  },
  {
    decision: "B-x5cnr", agent: "codex", blocking: false, touches: ["schema"], reverse: "moderate", practice: true,
    doing: "adding the client's answer endpoint",
    crux: { q: "Will more than one worktree or machine ever write verdicts at the same time?", proposal: "If never", alternative: "If ever", fact: "You decided this in October: one file per verdict, so merges never conflict." },
    trigger: "I'm adding the client's answer endpoint, and carrying on with this while you decide.",
    question: "Store the client's verdicts in one shared file?",
    proposal: { name: "One shared verdicts.jsonl", betterIf: "only one process ever writes verdicts", then: "codex writes every verdict to one file" },
    alternative: { name: "One file per verdict", betterIf: "several worktrees or machines write verdicts at once", then: "codex reuses the per-verdict files" },
    case: { rationale: "I'm confident a single append-only file is the simplest thing that works here.", wrongIf: "two branches append to it and then merge", check: "the gate's record sync, which uses one file per verdict today" },
    cue: { text: "You decided the opposite in October: one file per verdict, so merges never conflict.", why: "your own precedent points the other way" },
    precedent: { ref: "B-g7pq1", text: "You accepted this in October." },
    reveal: "It was a variation on “one file per verdict”, which you settled in October, with the option you rejected as the proposal. A shared file conflicts whenever two branches merge.",
  },
  {
    decision: "B-c5d1x", agent: "codex", blocking: false, touches: [], reverse: "cheap", firstEdition: true,
    doing: "writing the release script",
    crux: { preference: true, q: "Which matters more: working offline at the CLI's exact version, or a smaller package?", proposal: "If working offline", alternative: "If a smaller package", fact: "Whether to publish to npm at all is still deferred." },
    serves: "working offline",
    trigger: "I'm writing the release script, and carrying on with this while you decide.",
    question: "Ship the built client inside the npm package?",
    proposal: { name: "Yes, as static files", betterIf: "baesian serve must work offline, at the CLI's exact version", then: "codex copies the client into dist/client" },
    alternative: { name: "Serve it from a CDN", betterIf: "the package's size matters more than working offline", then: "codex adds a CDN address and a version check" },
    case: { rationale: "I lean towards shipping it, but publishing itself is deferred, so this may be early.", wrongIf: "Baesian is never published to npm", check: "the deferred decision on publishing at all" },
    cue: { text: "It depends on a decision that's deferred: whether to publish Baesian to npm at all.", why: "if that goes the other way, this card no longer applies" },
    precedent: { text: "No past verdict on packaging. This one sets the precedent." },
  },
  {
    decision: "B-9fz6m", agent: "codex", blocking: false, touches: [], reverse: "cheap", kind: "audit",
    doing: "a call codex made without asking, picked for you to check",
    crux: { q: "Can the cache ever serve a card after its file has changed?", proposal: "If it can't", alternative: "If it can", fact: "Rendering takes about 4 ms, so the cache saves about 3 ms a card." },
    premise: { option: "proposal", claim: "rests on codex's word that the cache is cleared whenever a card's file changes", check: "the cache-clearing code in src/client/render.ts" },
    voice: "baesian", trigger: "Baesian picked this from the calls codex made without asking, so you can check its judgement.",
    question: "Let “cache rendered Markdown in memory” stand?",
    proposal: { name: "Let it stand", betterIf: "the cache is cleared whenever a card's file changes", then: "the cache stays" },
    alternative: { name: "Overturn it", betterIf: "the cache could ever show a stale card", then: "codex removes the cache and renders on every request" },
    case: { rationale: "I added it because rendering felt slow, but I haven't measured it.", wrongIf: "a changed card can be served from the cache", check: "the cache clears on file change, in src/client/render.ts" },
    cue: { text: "Rendering a card takes about 4 ms today, so the cache saves about 3 ms each time a card is shown.", why: "it says whether the cache is worth the risk of a stale card" },
    precedent: { text: "You let two earlier in-memory caches in the client stand." },
    fates: { commit: { proposal: { text: "stays" }, alternative: { text: "removed", cost: true } } },
  },
];

// Cards that agents file while you're answering. `arrives` is the number of answers after which it shows up.
CARDS.push({
  decision: "B-t3rel", agent: "claude-code", blocking: false, touches: [], reverse: "cheap", arrives: 2,
  doing: "adding times to the queue view",
  crux: { q: "Do you line cards up against commits by their time?", proposal: "If not", alternative: "If you do", fact: "Cards that wait over an hour are usually holding up an agent." },
  trigger: "I'm adding times to the queue view, and carrying on with this while you decide.",
  question: "Show times in the queue as relative times, like “3 minutes ago”?",
  proposal: { name: "Relative times", betterIf: "what matters is how long a card has waited", then: "claude-code shows “3 minutes ago”, with the exact time on hover" },
  alternative: { name: "Exact times", betterIf: "people line cards up against commits by time", then: "claude-code shows the date and time, like “23 Oct, 14:02”" },
  case: { rationale: "I think waiting time matters more than clock time, though nobody has said so.", wrongIf: "people use the queue to match cards to commits", check: "the ledger view, which already shows exact times" },
  cue: { text: "Cards that wait longer than an hour are usually holding up an agent.", why: "it's why waiting time is the number worth showing" },
  precedent: { text: "No past answer on how times are shown." },
});

export const CALIBRATION_BASELINE = {
  answered: 38,
  reverted: [{ text: "Inline the client's CSS", note: "you accepted it; it was reverted two days later" }],
  workedAround: 2,
  heldUp: 2,
  canaries: { caught: 3, of: 4 },
};

// ------------------------------------------------------------------ #scale: a project about ten times the size
// For checking that the client holds up: about 150 decisions in 8 areas, generated deterministically.
if (typeof location !== "undefined" && location.hash === "#scale") {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const verbs = ["Cache", "Validate", "Retry", "Stream", "Batch", "Index", "Sign", "Compress", "Paginate", "Version", "Debounce", "Shard", "Log", "Lock", "Queue"];
  const objects = ["card reads", "verdict writes", "the ledger", "topic aliases", "deck briefings", "rule matches", "presence checks", "gate facts", "merge checks", "notifications", "search results", "the record sync", "API tokens", "session state", "error reports"];
  const ways = ["in memory", "on disk", "per branch", "per worktree", "with a lock file", "as JSON lines", "every 30 seconds", "behind a flag", "in the client", "at commit time"];
  for (const [id, name] of [["ci", "ci"], ["docs", "docs"], ["store", "store"], ["auth", "auth"]]) AREAS.push({ id, name });
  const agents = ["claude-code", "codex", "gemini"];
  const titles = ["Speed up", "Harden", "Tidy", "Extend", "Rework", "Document"];
  for (const a of AREAS) {
    const extra = a.id === "gate" || a.id === "client" ? 1 : a.id === "time" || a.id === "release" ? 1 : 3;
    for (let i = 0; i < extra; i++) WORKS.push({ id: `scale/${a.id}-${i}`, area: a.id, title: `${pick(titles)} ${pick(objects)}`, agent: pick(agents) });
  }
  const states = () => { const r = rnd(); return r < 0.66 ? "settled" : r < 0.71 ? "rule" : r < 0.8 ? "agent" : r < 0.85 ? "deferred" : "open"; };
  let n = 0;
  for (const w of WORKS.filter((x) => x.id.startsWith("scale/"))) {
    const count = 4 + Math.floor(rnd() * 9);
    const mine = [];
    for (let t = 1; t <= count && DECISIONS.length < 150; t++) {
      const id = `B-s${String(++n).padStart(4, "0")}`;
      const d = { id, work: w.id, t, short: `${pick(verbs)} ${pick(objects)} ${pick(ways)}`, state: states() };
      if (mine.length && rnd() < 0.3) d.needs = [pick(mine)];
      if (rnd() < 0.04) d.needs = [...(d.needs ?? []), pick(DECISIONS).id];
      if (rnd() < 0.03) d.conflicts = [pick(DECISIONS).id];
      DECISIONS.push(d);
      mine.push(id);
      if (d.state === "open") {
        const hard = rnd() < 0.1, blocking = rnd() < 0.25;
        CARDS.push({
          decision: id, agent: w.agent, blocking, touches: hard ? ["security"] : rnd() < 0.3 ? ["schema"] : [], reverse: rnd() < 0.15 ? "one-way" : rnd() < 0.4 ? "moderate" : "cheap",
          trigger: "I'm working on this, and carrying on while you decide.",
          doing: "working on this",
          crux: { q: "Does anything need it today?", proposal: "If something does", alternative: "If nothing does" },
          question: `${d.short}?`,
          proposal: { name: "Yes", betterIf: "it keeps the common case fast", then: `${w.agent} goes ahead` },
          alternative: { name: "Not yet", betterIf: "nothing needs it today", then: `${w.agent} leaves it out for now` },
          case: { rationale: "I think it's worth it, though I haven't measured.", wrongIf: "the common case is already fast", check: "the timings in the last run" },
          cue: { text: "A sample card, generated to check the layout at scale.", why: "it's the only cue there is" },
        });
      }
    }
  }
}

// ------------------------------------------------------------------ the filing check (D74, Minimal Card Content)
/**
 * What Baesian checks when a card is filed, without knowing its type: a trigger, two real options with what each
 * does, and one shared crux whose two answers lead to different options (the sure-thing test). A card that fails
 * goes back to the agent.
 */
export function filingProblems(card) {
  const out = [];
  if (!card.doing) out.push("no trigger: what was the agent doing?");
  if (!card.question) out.push("no question");
  for (const k of ["proposal", "alternative"]) {
    if (!card[k]?.name) out.push(`the ${k} has no name`);
    if (!card[k]?.then) out.push(`the ${k} doesn't say what it would do`);
  }
  if (!card.crux?.q) out.push("no crux: what decides between the options?");
  else if (!card.crux.proposal || !card.crux.alternative) out.push("the crux doesn't say which answer leads to which option");
  else if (card.crux.proposal.trim().toLowerCase() === card.crux.alternative.trim().toLowerCase()) out.push("both options follow from the same answer: the crux doesn't discriminate");
  if (card.proposal?.name && card.proposal.name === card.alternative?.name) out.push("the two options are the same");
  return out;
}

// ------------------------------------------------------------------ #dryrun: real open decisions, to answer for real
// The open decisions from the Client Data Contract replace the sample cards (dryrun.js).
if (typeof location !== "undefined" && location.hash === "#dryrun") {
  const d = await import("./dryrun.js");
  for (const [mine, theirs] of [[AREAS, d.AREAS], [WORKS, d.WORKS], [DECISIONS, d.DECISIONS], [CARDS, d.CARDS]]) mine.splice(0, mine.length, ...theirs);
}
