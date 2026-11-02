import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderDoc } from "../src/frontmatter.js";
import type { Store } from "../src/store.js";

// Round 5's desk, filed through the real store: its settled decisions, its rule, and its open cards, from
// design/explorations/round5/data.js. The layout check (layout.spec.ts) runs over it, and the side-by-side with
// round 5's screenshots uses it, so both look at the same content. The practice card waits for D83.

const RULE = "R-g4mn8";

export interface Round5 {
  /** The open cards, by round 5's short names. */
  token: string;
  live: string;
  time: string;
  packaging: string;
  cache: string;
  /** Files the card that arrives while you answer (round 5's B-t3rel). */
  fileRelativeTimes: () => string;
}

export function fileRound5(store: Store): Round5 {
  const as = (agent: string) => ({ agent, force: true });
  const file = (agent: string, deck: string, card: Record<string, unknown>, body = "") => store.fileCard({ deck, level: "provisional", touches: [], ...card }, body, as(agent)).card.meta.id;
  const settle = (id: string) => store.addVerdict({ card: id, revision: 1, response: "accept", reviewer: "gus", client: "web" });

  for (const [id, title] of [
    ["feat-m4-client", "The local server the client talks to"],
    ["feat-m4-ui", "The client's views"],
    ["main-time", "Card timestamps"],
    ["release-0-1", "Ship 0.1.0"],
  ] as const) store.createDeck({ id, title }, "");

  mkdirSync(join(store.live, "rules"), { recursive: true });
  writeFileSync(join(store.live, "rules", `${RULE}.md`), renderDoc({ type: "rule", id: RULE, covers: [], accepted_by: "gus", created: new Date().toISOString() }, "Never put secrets in URLs.\n"));

  const option = (proposal: string, proposal_then: string, alternative: string, alternative_then: string) => ({ proposal, proposal_then, alternative, alternative_then });
  const server = file("claude-code", "feat-m4-client", {
    title: "Serve the client with Node's http module",
    question: "What should serve the client?",
    doing: "adding the local server",
    topic: "client/server",
    reverse: "moderate",
    ...option("Node's http module", "no dependency is added", "Express", "the server adds a dependency"),
    crux: "Will the server need middleware beyond a few routes?",
    crux_proposal: "If not",
    crux_alternative: "If it will",
  });
  settle(server);
  const iso = file("claude-code", "main-time", {
    title: "Store times as ISO 8601 strings",
    question: "How should the record store times?",
    doing: "writing the record's timestamps",
    topic: "time/storage",
    reverse: "moderate",
    ...option("ISO 8601 strings", "times read as text in every diff", "Unix epoch integers", "times are numbers in the record"),
    crux: "Do people read the record's times?",
    crux_proposal: "If they do",
    crux_alternative: "If they don't",
  });
  settle(iso);
  const epoch = file("codex", "feat-m4-ui", {
    title: "Store card times as epoch integers",
    question: "How should the views store card times?",
    doing: "building the views",
    topic: "time/views",
    reverse: "moderate",
    ...option("Unix epoch integers", "the charts read numbers", "ISO 8601 strings", "the charts parse text"),
    crux: "Do the charts read times more than people do?",
    crux_proposal: "If they do",
    crux_alternative: "If they don't",
  });
  settle(epoch);

  const token = file("claude-code", "feat-m4-client", {
    title: "Where the access token lives",
    question: "Where should the client's access token live?",
    doing: "writing the server's request check",
    topic: "client/auth",
    level: "blocking",
    touches: ["security"],
    reverse: "one-way",
    ...option("In the URL fragment", "every link carries the token, as /#t=…", "In a cookie set on first visit", "each new browser needs a one‑time login"),
    crux: "Does your rule “never put secrets in URLs” cover the part of a link after the #?",
    crux_proposal: "If it doesn't",
    crux_alternative: "If it does",
    rationale: "I think the fragment is safe enough because it never leaves the browser, but I'm unsure your rule allows it.",
    wrong_if: "any page can run a script that reads the address bar",
    check: "src/client/index.html loads no external scripts today",
    premise: "is only safe if no page in the client runs a script that can read the address bar",
    premise_option: "proposal",
    premise_check: "src/client/index.html loads no external scripts",
    rules: [RULE],
    proposal_breaks: [RULE],
    depends_on: [server],
  }, "**The request check** reads the token on every request.\n\n- In the fragment, it never reaches the server's logs.\n- In a cookie, `HttpOnly` keeps scripts from reading it.\n");
  // Two agents have stopped for you, as in round 5.
  const since = new Date().toISOString();
  store.startWaiting(token, "claude-code", since);
  const live = file("claude-code", "feat-m4-client", {
    title: "How live updates reach the browser",
    question: "WebSockets or server‑sent events for live updates?",
    doing: "building the live view",
    topic: "client/live",
    touches: ["public-api"],
    reverse: "moderate",
    ...option("Server-sent events", "both commits stay; codex keeps streaming the queue view", "WebSockets", "claude-code reworks 2 commits and adds a dependency"),
    crux: "Will the browser ever need to send live data back on this connection?",
    crux_proposal: "If it won't",
    crux_alternative: "If it will",
    crux_fact: "The presence heartbeat goes every 30 seconds, as its own request today.",
    acted: "2 commits, “Add the live event stream” and “Subscribe the queue view”",
    acted_option: "proposal",
    depends_on: [server],
  });
  const time = file("codex", "main-time", {
    title: "Which time format the record uses",
    question: "Which time format should the record use?",
    doing: "merging the client's views into main",
    topic: "time/format",
    level: "blocking",
    touches: ["schema"],
    reverse: "moderate",
    ...option("ISO 8601 strings", "codex reworks 1 commit in the views", "Unix epoch integers", "claude-code reworks 5 commits on main"),
    crux: "Who reads stored times most: people and git, or the client's charts?",
    crux_proposal: "If people and git",
    crux_alternative: "If the charts",
    crux_fact: "People read the record in every pull request; the charts read card times once per page load.",
    conflict_of: [iso, epoch],
    proposal_breaks: [epoch],
    alternative_breaks: [iso],
  });
  store.startWaiting(time, "codex", since);
  const packaging = file("codex", "release-0-1", {
    title: "Ship the built client in the npm package",
    question: "Ship the built client inside the npm package?",
    doing: "writing the release script",
    topic: "release/package",
    reverse: "cheap",
    ...option("Yes, as static files", "codex copies the client into dist/client", "Serve it from a CDN", "codex adds a CDN address and a version check"),
    crux: "Which matters more: working offline at the CLI's exact version, or a smaller package?",
    crux_proposal: "If working offline",
    crux_alternative: "If a smaller package",
    crux_preference: true,
    crux_fact: "Whether to publish to npm at all is still deferred.",
    serves: "working offline",
  });
  const cache = file("codex", "feat-m4-ui", {
    title: "Cache rendered Markdown in memory",
    question: "Let “cache rendered Markdown in memory” stand?",
    doing: "speeding up the client's views",
    topic: "client/render",
    reverse: "cheap",
    ...option("Let it stand", "the cache stays", "Overturn it", "codex removes the cache and renders on every request"),
    crux: "Can the cache ever serve a card after its file has changed?",
    crux_proposal: "If it can't",
    crux_alternative: "If it can",
    crux_fact: "Rendering takes about 4 ms, so the cache saves about 3 ms a card.",
    premise: "rests on codex's word that the cache is cleared whenever a card's file changes",
    premise_option: "proposal",
    premise_check: "the cache-clearing code in src/client/render.ts",
    wrong_if: "a changed card can be served from the cache",
    check: "the cache clears on file change, in src/client/render.ts",
  });
  const fileRelativeTimes = () =>
    file("claude-code", "main-time", {
      title: "Relative times in the queue",
      question: "Show times in the queue as relative times, like “3 minutes ago”?",
      doing: "adding times to the queue view",
      topic: "time/queue",
      reverse: "cheap",
      ...option("Relative times", "claude-code shows “3 minutes ago”, with the exact time on hover", "Exact times", "claude-code shows the date and time, like “23 Oct, 14:02”"),
      crux: "Do you line cards up against commits by their time?",
      crux_proposal: "If not",
      crux_alternative: "If you do",
      crux_fact: "Cards that wait over an hour are usually holding up an agent.",
      depends_on: [time],
    });
  return { token, live, time, packaging, cache, fileRelativeTimes };
}
