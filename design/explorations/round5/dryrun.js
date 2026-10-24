// The dry run (#dryrun): the open decisions from docs/vault/Design/Client Data Contract.md, written as real cards
// by the agent (claude-code), for the user to answer in this prototype. The settled decisions they build on are
// context. Answers are saved by the local server to design/dryrun/, one file per verdict.
//
// First pass (2026-10-24): the user answered all ten cards in FIRST. Nine were decided (D77–D85 in the Decision
// Log) and are now context. The waiting-marker card came back as "I need more context"; its revision, in REVISED,
// was decided with the agent's pick hidden (D90). Nothing is left to answer.

export const PROJECT = { name: "baesian" };

export const AREAS = [
  { id: "format", name: "card format" },
  { id: "server", name: "server" },
  { id: "store", name: "store" },
  { id: "client", name: "client" },
];

export const WORKS = [
  { id: "p12", area: "format", title: "P12: the card format", agent: "claude-code" },
  { id: "m4a-server", area: "server", title: "M4a: the local server", agent: "claude-code" },
  { id: "verdicts", area: "store", title: "What a verdict does", agent: "claude-code" },
  { id: "m4a-client", area: "client", title: "M4a: the client", agent: "claude-code" },
];

export const DECISIONS = [
  { id: "D66", work: "p12", t: 1, short: "Every card has a topic", state: "settled" },
  { id: "D73", work: "p12", t: 2, short: "The trigger is on the card", state: "settled" },
  { id: "D74", work: "p12", t: 3, short: "One shared crux decides between the options", state: "settled" },
  { id: "D75", work: "p12", t: 4, short: "Three facets on trial", state: "settled" },
  { id: "D77", work: "p12", t: 5, short: "Filing requires the core, plus what each facet asks", state: "settled", needs: ["D66", "D73", "D74"] },
  { id: "D83", work: "p12", t: 6, short: "Practice cards are built from past cards", state: "settled", needs: ["D74"] },

  { id: "D34", work: "m4a-server", t: 1, short: "Live state lives in git's common directory", state: "settled" },
  { id: "D41", work: "m4a-server", t: 2, short: "Presence is a heartbeat file", state: "settled" },
  { id: "D46", work: "m4a-server", t: 3, short: "A wait that gives up is recorded as carrying on", state: "settled" },
  { id: "D84", work: "m4a-server", t: 4, short: "The server uses Node's file watching, with a rescan", state: "settled", needs: ["D34"] },
  { id: "D90", work: "m4a-server", t: 5, short: "A waiting agent leaves a heartbeat", state: "settled", needs: ["D41", "D46"] },

  { id: "D14", work: "verdicts", t: 1, short: "Rejecting a card withdraws its dependents", state: "settled" },
  { id: "D35", work: "verdicts", t: 2, short: "Losing branches get rework briefs", state: "settled" },
  { id: "D80", work: "verdicts", t: 3, short: "Choosing the alternative returns dependents", state: "settled", needs: ["D14"] },
  { id: "D81", work: "verdicts", t: 4, short: "A changed answer comes with a rework brief", state: "settled", needs: ["D35"] },

  { id: "D67", work: "m4a-client", t: 1, short: "Hard cards are held to confirm", state: "settled" },
  { id: "D71", work: "m4a-client", t: 2, short: "Show only what can be stood behind", state: "rule" },
  { id: "D78", work: "m4a-client", t: 3, short: "Commits stay out of the client", state: "settled", needs: ["D71"] },
  { id: "D79", work: "m4a-client", t: 4, short: "Agents cite the rules a card bears on", state: "settled" },
  { id: "D82", work: "m4a-client", t: 5, short: "Answers keep a 5-second undo", state: "settled" },
  { id: "D85", work: "m4a-client", t: 6, short: "“See it run” is its own response", state: "settled" },
];

const card = (o) => ({ agent: "claude-code", blocking: false, touches: [], reverse: "cheap", ...o });

/** The ten cards as the user first answered them, kept as the record of what they saw. */
export const FIRST = [
  card({
    decision: "C-format", blocking: true, touches: ["schema"], reverse: "moderate",
    doing: "about to write the card schema for M4a",
    trigger: "I'm about to write the card schema for M4a, and I've stopped until you answer.",
    question: "Which card fields should filing require?",
    crux: { q: "Will agents write a useful “wrong if” and check for routine decisions, or only for consequential ones?", proposal: "Only for consequential ones", alternative: "For routine ones too", fact: "The research found agents' stated reasons are often not their real ones; a check is what makes “wrong if” worth having." },
    proposal: { name: "The core, plus what each facet asks", then: "every card needs a trigger, the question, two options with what each does, and the crux; “wrong if” and its check are required only when a facet asks (hard to undo, security, an unchecked premise)" },
    alternative: { name: "Every field, on every card", then: "every card also needs a rationale and a “wrong if” with a check, even for cheap decisions" },
    case: { rationale: "I think required fields that agents fill with filler are worse than optional ones, so I'd require only what changes answers.", wrongIf: "agents skip “wrong if” on decisions that later turn out to matter", check: "the dogfooding audit of reversed decisions" },
  }),
  card({
    decision: "C-watch", blocking: true,
    doing: "writing the server's file watcher",
    trigger: "I'm writing the server's file watcher, and I've stopped until you answer.",
    question: "How should the local server notice new cards and verdicts?",
    crux: { q: "Does Node's own recursive file watching report every change in nested folders, on macOS and Linux?", proposal: "If it does", alternative: "If it doesn't" },
    proposal: { name: "Node's file watching", then: "the server reacts at once, with a full rescan every 30 seconds as a safety net; no new dependency" },
    alternative: { name: "Poll every second", then: "the server rescans the live layer each second; up to a second's delay, simple and always correct" },
    case: { rationale: "The data contract says file watching is unreliable on macOS, but that may be out of date for Node 22; I'd use it with a rescan rather than poll.", wrongIf: "events go missing under bursts of writes from several worktrees", check: "a test that writes 1,000 files across nested folders and counts the events" },
    premise: { option: "proposal", claim: "is only safe if Node 22's recursive watching reports every nested change; the data contract says it doesn't on macOS, and nobody has checked", check: "a test that writes 1,000 files across nested folders and counts the events" },
  }),
  card({
    decision: "C-waiting",
    doing: "adding presence to the server",
    trigger: "I'm adding presence to the server, and carrying on with this while you decide.",
    question: "Should “agent stopped” be checked, or taken from the card?",
    crux: { q: "Do agents die or time out while waiting often enough that a stale “stopped” would mislead you?", proposal: "If they do", alternative: "If they rarely do" },
    proposal: { name: "A waiting marker with a heartbeat", then: "baesian wait writes a marker and refreshes it, like presence; after 90 seconds without a refresh the card says the agent is gone" },
    alternative: { name: "Take it from the card", then: "the client shows “stopped” whenever the card is blocking, worded as what the agent declared" },
    case: { rationale: "I'm fairly sure agents get killed mid-wait often enough, since harness commands time out after ten minutes.", wrongIf: "waits almost always end with a verdict or a clean timeout", check: "the fallback records: how many waits end without one" },
  }),
  card({
    decision: "C-alt", touches: ["schema"], reverse: "moderate",
    doing: "writing the store's verdict handling",
    trigger: "I'm writing the store's verdict handling, and carrying on with this while you decide.",
    question: "When you choose the alternative, what happens to the cards built on the proposal?",
    crux: { q: "Do cards built on a proposal usually still make sense once the alternative is chosen?", proposal: "If they usually don't", alternative: "If they usually do" },
    proposal: { name: "Return them, with a brief", then: "they come back to their agents as returned, like a rejection's dependents; each agent re-proposes or withdraws" },
    alternative: { name: "Leave them open, flagged", then: "they stay in your queue marked “what this builds on has changed”, and you decide each one" },
    case: { rationale: "I think a dependent written against the proposal is usually stale once you choose otherwise, so returning it is the honest default.", wrongIf: "most dependents are unaffected by which option won", check: "how often dependents are re-filed unchanged after a return" },
  }),
  card({
    decision: "C-change", reverse: "moderate",
    doing: "writing what happens when an answer changes",
    trigger: "I'm writing what happens when an answer changes, and carrying on with this while you decide.",
    question: "If you change an answer after the agent has acted on it, what should the agent get?",
    crux: { q: "Can the agent find, on its own, the work it built on the old answer?", proposal: "If it can't reliably", alternative: "If it can" },
    proposal: { name: "A rework brief", then: "the new answer arrives with a brief listing the commits that cite the card, as for a lost conflict" },
    alternative: { name: "The new answer only", then: "the agent gets the new verdict and works out for itself what to redo" },
    case: { rationale: "I'd send a brief, because agents often lose track of what they built across sessions.", wrongIf: "the brief misses work that didn't cite the card", check: "compare each brief with the files the agent changed after the first answer" },
    premise: { option: "proposal", claim: "rests on the ledger listing everything built on the card, but it only counts commits that cite it", check: "how many commits on a branch cite a card, against how many touch the same files" },
  }),
  card({
    decision: "C-commits",
    doing: "building the card's consequence panel",
    trigger: "I'm building the card's consequence panel, and carrying on with this while you decide.",
    question: "Should the client show the commits built on a decision?",
    crux: { q: "Do agents cite the card on nearly every commit that builds on it?", proposal: "If they don't", alternative: "If they do", fact: "Nobody has measured it yet: dogfooding hasn't produced real cards." },
    proposal: { name: "Leave commits out of M4a", then: "the card shows the agent's own “then”, worded as its claim; the ledger still feeds the gate and rework briefs" },
    alternative: { name: "Show “commits that cite this card”", then: "the card lists cited commits, worded as a lower bound, never as the whole" },
    case: { rationale: "Under your rule of showing only what we can stand behind, I'd leave them out until citation is measured; a lower bound people read as the whole is worse than nothing.", wrongIf: "citation turns out to be close to complete", check: "the citation audit above, after a few weeks of dogfooding" },
  }),
  card({
    decision: "C-rules", touches: ["schema"],
    doing: "matching rules to cards",
    trigger: "I'm matching rules to cards for the client, and carrying on with this while you decide.",
    question: "How should the client find the rules that bear on a card?",
    crux: { q: "Is sharing a topic good enough evidence that a rule applies?", proposal: "If it isn't", alternative: "If it is" },
    proposal: { name: "Agents cite the rule", then: "cards gain a rules field; cited rules show as “may conflict”, and topic matches as the weaker “a rule on the same topic”" },
    alternative: { name: "Match by topic only", then: "the client lists every rule on the card's topic, all worded “a rule on the same topic”; no change to the card format" },
    case: { rationale: "I think topics are too loose on their own, since they're free-form, so I'd let the agent say which rule it means.", wrongIf: "agents cite rules no better than a topic match does", check: "how often a cited rule is the one you'd have named" },
  }),
  card({
    decision: "C-undo",
    doing: "building the answer flow",
    trigger: "I'm building the answer flow, and carrying on with this while you decide.",
    question: "Should answers have a 5-second undo?",
    crux: { preference: true, q: "Which matters more: catching a slip right after you answer, or answers reaching agents at once?", proposal: "If catching a slip", alternative: "If answers arriving at once", fact: "The prototypes added the undo, but an earlier decision ruled out an undo window, and nobody flagged the conflict." },
    proposal: { name: "Keep the undo", then: "an answer waits 5 seconds before it's sent, and is sent anyway if the client closes in that time" },
    alternative: { name: "No undo, as decided earlier", then: "answers go at once; you change one by reopening the card, after the agent may have acted" },
    case: { rationale: "I'd keep it: slips happen on fast cards, and 5 seconds rarely matters to an agent.", wrongIf: "an agent is often blocked waiting on an answer you've already given", check: "the time from answer to delivery on blocking cards" },
    serves: "catching slips",
    effects: { D67: { proposal: { text: "replaced", bad: true }, alternative: { text: "kept" } } },
  }),
  card({
    decision: "C-practice",
    doing: "planning practice cards",
    trigger: "I'm planning practice cards for after M4a, and carrying on with this while you decide.",
    question: "How should practice cards be made, and where should they be kept?",
    crux: { q: "Will cards built from past decisions' own words read like real cards?", proposal: "If they will", alternative: "If they won't" },
    proposal: { name: "Built from past cards", then: "Baesian swaps a resolved card's options, using each option's own crux answer and “then”; they live in the live layer only, never in the record or sent to an agent" },
    alternative: { name: "Leave them out of 0.1.0", then: "no practice cards until dogfooding shows assembled cards can't be told apart" },
    case: { rationale: "I think the shared crux makes swapped cards read naturally, so they can ship.", wrongIf: "you can spot a practice card at a glance", check: "a blind test: ten assembled cards mixed with real ones" },
    premise: { option: "proposal", claim: "rests on assembled cards being indistinguishable from real ones, which nobody has tested", check: "a blind test: ten assembled cards mixed with real ones" },
  }),
  card({
    decision: "C-run", touches: ["schema"], reverse: "moderate",
    doing: "mapping the client's answers to verdicts",
    trigger: "I'm mapping the client's answers to verdicts, and carrying on with this while you decide.",
    question: "When you say you need to see it run, what should the agent get?",
    crux: { q: "Will agents act differently on “see it run” than on “more context”?", proposal: "If they will", alternative: "If they won't", fact: "Every interface correction so far came after you saw something built." },
    proposal: { name: "A new response: see it run", then: "the verdict format gains a response; the agent comes back with a demo, a screenshot or a running preview" },
    alternative: { name: "More context, with a note", then: "it's sent as need_context with “see it run” in the comment; no format change" },
    case: { rationale: "I'd add it, since showing beat describing every time in this project.", wrongIf: "agents treat it exactly like need_context", check: "what agents return after each kind" },
  }),
];

/** The waiting-marker card, revised after "I need more context", and decided as D90. */
export const REVISED = [
  card({
    decision: "C-waiting",
    doing: "adding presence to the server",
    trigger: "I'm adding presence to the server, and carrying on with this while you decide.",
    question: "Should the client check that a stopped agent is still waiting?",
    crux: { q: "Do agents get killed mid-wait (a session closed, a crash) often enough that a stale “stopped” would mislead you?", proposal: "If they do", alternative: "If they rarely do", fact: "A wait that times out already says so: after 9 minutes the card shows the agent carried on. Only an agent killed mid-wait leaves “stopped” showing, and cards with a stopped agent go to the front of your queue." },
    proposal: { name: "A waiting marker with a heartbeat", then: "baesian wait refreshes a marker while it waits; once it goes quiet, the card says the agent stopped waiting and drops back to its place in the queue; your answer still reaches the agent's next session" },
    alternative: { name: "Take it from the card", then: "a blocking card shows “stopped” until it's answered or the agent records carrying on; a killed agent's card stays at the front" },
    case: { rationale: "I think closing a session mid-wait is the ordinary way to stop an agent, and nothing records it. My first version blamed timeouts, which was wrong: a timeout is recorded.", wrongIf: "killed waits are rare next to answered and timed-out ones", check: "blocking cards with neither a verdict nor a fallback a day after filing" },
  }),
];

/** Still to answer. */
export const CARDS = [];
