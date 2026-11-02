// A demo of Baesian on a made-up project, for showing people the whole loop. It makes a throwaway repo for
// Crumb, a small bakery's online shop, where two agents are at work on two branches and have filed five
// decisions. Then it opens the client on them, and plays the agents' side in this terminal: what each one
// hears when you answer. Run it with `npm run demo`, or `npm run demo -- <empty folder>` to choose where the
// repo goes; add `--no-open` to open the client yourself. Everything goes through the CLI, as an agent's would.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// This checkout's CLI, from source, so the demo shows the code in front of you, not an older install.
const CLI = [join(ROOT, "node_modules", ".bin", "tsx"), join(ROOT, "src", "bin.ts")];

// ------------------------------------------------------------------ the project

const FILES: Record<string, string> = {
  "README.md": `# Crumb

Online orders for the bakery on Mill Street. Shoppers order bread and pastries for pickup, and the bakers
see new orders on a screen in the kitchen.

- \`src/server.js\`: the web server
- \`data/prices.csv\`: today's price list
- \`docs/\`: the roadmap, and the accountant's note on invoices
`,
  "package.json": `${JSON.stringify({ name: "crumb", private: true, type: "module", scripts: { start: "node src/server.js" } }, null, 2)}\n`,
  "src/server.js": `import { createServer } from "node:http";

createServer((req, res) => {
  res.end("Crumb is baking.\\n");
}).listen(3000);
`,
  "data/prices.csv": `item,unit,price_eur
Sourdough loaf,each,4.50
Rye loaf,each,5.20
Croissant,each,2.10
Cinnamon bun,each,2.60
Stoneground flour,per 100 g,0.80
Coffee beans (house blend),per 100 g,2.40
`,
  "docs/roadmap.md": `# Roadmap

- This spring: online orders for pickup, on the website.
- This summer: the kitchen screen, and today's stock on the menu.
- Maybe next year: a mobile app. It has been mentioned, not planned.

The shop and its API are both served from crumb.example.
`,
  "docs/invoices.md": `# Keeping invoices

From the shop's accountant: keep every invoice for six years. Each one needs the date, what was sold, the
amounts and the VAT. The customer's name is required only on a VAT invoice, which business customers can
ask for.
`,
};

// ------------------------------------------------------------------ the agents and their decisions
// The client shows each option's outcome after "then", so the `_then` fields start in lower case.

interface Agent {
  name: string;
  branch: string;
  folder: string;
  deck: { id: string; title: string; briefing: string };
}

const CLAUDE: Agent = {
  name: "claude-code",
  branch: "feat/checkout",
  folder: "crumb",
  deck: {
    id: "checkout",
    title: "Checkout and accounts",
    briefing: "Shoppers sign in, pay and come in for their order. These are the decisions about accounts and signing in. The payment provider is already chosen.",
  },
};

const CODEX: Agent = {
  name: "codex",
  branch: "feat/catalog",
  folder: "crumb-catalog",
  deck: {
    id: "catalog",
    title: "The menu and the kitchen screen",
    briefing: "The menu lists today's bread and pastries with their prices, and the kitchen screen shows the bakers each new order.",
  },
};

interface Draft {
  agent: Agent;
  meta: Record<string, unknown>;
  body?: string;
}

const DRAFTS: Draft[] = [
  {
    agent: CLAUDE,
    meta: {
      title: "Where a signed-in shopper's session lives",
      question: "Where should a signed-in shopper's session be kept?",
      doing: "writing the sign-in endpoint",
      topic: "auth/session-storage",
      touches: ["security"],
      reverse: "moderate",
      proposal: "An HttpOnly cookie",
      proposal_then: "the server sets the cookie at sign-in. No script on the page can read it, and every form carries a CSRF token.",
      alternative: "A token in localStorage",
      alternative_then: "the page sends the token with each request. Any script on the page can read it, and a mobile app could use the API unchanged.",
      crux: "Will anything but the shop's own website call the API?",
      crux_proposal: "If only the website will",
      crux_alternative: "If a mobile app will too",
      crux_fact: "The shop is a website today; a mobile app has been mentioned for next year, not planned. The checkout page loads the payment provider's script.",
      rationale: "A cookie keeps the session out of reach of every script on the page, the payment provider's included. A mobile app can have its own sign-in when it exists.",
      wrong_if: "a mobile app is planned for this year, or the API moves to a domain of its own",
      check: "docs/roadmap.md, and whether the shop and its API share a domain",
    },
    body: "Changing this later signs every shopper out once, and means rewriting the sign-in endpoint and the page's requests.",
  },
  {
    agent: CLAUDE,
    meta: {
      title: "What deleting an account removes",
      question: "What should happen when a shopper deletes their account?",
      doing: "adding \"Delete my account\" to the account page",
      topic: "accounts/deletion",
      touches: ["data-loss", "user-facing"],
      reverse: "one-way",
      proposal: "Erase it at once",
      proposal_then: "name, email and address are erased straight away, and invoices keep the amounts without the name. A shopper who changes their mind opens a new account.",
      alternative: "Lock it for 30 days, then erase it",
      alternative_then: "signing in within 30 days restores the account. After that, it's erased the same way.",
      crux: "Should a shopper be able to undo deleting their account?",
      crux_preference: true,
      crux_proposal: "If deleting should be final",
      crux_alternative: "If it should be undoable for a while",
      crux_fact: "Invoices are kept for six years. On the old site, 3 of the 40 or so shoppers who deleted their account last year asked to have it back.",
      serves: "erasing personal details as soon as a shopper asks",
      rationale: "Deleting should mean deleted. Three requests a year can be handled by hand, by opening a new account for them.",
      wrong_if: "an invoice has to name the customer",
      check: "the accountant's note, docs/invoices.md",
    },
  },
  {
    agent: CODEX,
    meta: {
      title: "How prices are stored",
      question: "How should prices be stored in the database?",
      doing: "creating the products table",
      topic: "catalog/price-format",
      touches: ["schema"],
      reverse: "one-way",
      level: "blocking",
      proposal: "Whole cents, as integers",
      proposal_then: "a €4.50 loaf is stored as 450. Sums are exact, and nothing can be priced below a cent.",
      alternative: "Decimals with four places",
      alternative_then: "a €4.50 loaf is stored as 4.5000. A price per gram fits, and every total is rounded to the cent at checkout.",
      crux: "Will anything be priced in fractions of a cent?",
      crux_proposal: "If nothing will",
      crux_alternative: "If something will",
      crux_fact: "Flour and coffee beans are sold by weight. The price list gives them per 100 g, at €0.80 and €2.40.",
      rationale: "Prices per 100 g are whole cents, and a weighed item can be rounded once, when it goes in the cart. Whole cents rule out a whole class of rounding bugs.",
      wrong_if: "the shop wants to price anything per gram, or to show unit prices finer than a cent",
      check: "the price list, data/prices.csv",
    },
    body: "Every order ever placed keeps the format it was stored in, so changing it later means migrating the order history.",
  },
  {
    agent: CODEX,
    meta: {
      title: "How new orders reach the kitchen screen",
      question: "How should new orders reach the kitchen screen?",
      doing: "building the kitchen's order screen",
      topic: "kitchen/live-updates",
      touches: ["dependency"],
      reverse: "moderate",
      proposal: "Server-sent events",
      proposal_then: "the screen opens one stream, and the server pushes each new order down it. No new dependency; marking an order done is an ordinary request.",
      alternative: "WebSockets",
      alternative_then: "the screen and the server share a two-way connection, through the ws package, and marking an order done travels on it too.",
      crux: "Will the kitchen screen ever need to send live data back?",
      crux_proposal: "If it won't",
      crux_alternative: "If it will",
      crux_fact: "Today the screen only shows orders. At the busiest time, the bakers mark an order done about once a minute.",
      rationale: "Orders flow one way, and marking one done is rare enough for an ordinary request.",
      acted: "the order stream, and the screen's subscription to it",
      acted_option: "proposal",
    },
  },
  {
    agent: CODEX,
    meta: {
      title: "What the menu shows for sold-out items",
      question: "What should the menu show for an item that's sold out today?",
      doing: "adding today's stock to the menu",
      topic: "menu/sold-out-items",
      touches: ["user-facing"],
      reverse: "cheap",
      proposal: "Show it, greyed out",
      proposal_then: "a sold-out item stays in its place, marked \"Sold out today\", with no add button.",
      alternative: "Hide it until it's back",
      alternative_then: "the menu lists only what can be ordered now, so regulars won't see their usual loaf that day.",
      crux: "Which matters more: shoppers seeing the whole range, or a menu of only what they can buy?",
      crux_preference: true,
      crux_proposal: "If the whole range",
      crux_alternative: "If only what they can buy",
      crux_fact: "On a usual Saturday, about a third of the menu has sold out by 11 a.m.",
      serves: "shoppers seeing the whole range",
      rationale: "Regulars look for their usual loaf, and a missing one looks dropped, not sold out.",
    },
  },
];

// ------------------------------------------------------------------ running things

const children = new Set<ChildProcess>();
const tty = process.stdout.isTTY;
const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[22m` : s);
const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[22m` : s);
const say = (line = "") => console.log(line);
const indent = (text: string) => text.trimEnd().split("\n").map((l) => `    ${l}`).join("\n");

function fail(message: string): never {
  console.error(`demo: ${message}`);
  for (const c of children) c.kill("SIGTERM");
  process.exit(1);
}

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.name=Crumb", "-c", "user.email=dev@crumb.example", "-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) fail(`git ${args.join(" ")}: ${r.stderr.trim()}`);
}

function baesian(cwd: string, args: string[], input?: string): string {
  const r = spawnSync(CLI[0]!, [...CLI.slice(1), ...args], { cwd, input, encoding: "utf8" });
  if (r.status !== 0) fail(`baesian ${args.join(" ")} exited ${r.status}:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Run the CLI in the background, and resolve with its exit code and output. */
function baesianAsync(cwd: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(CLI[0]!, [...CLI.slice(1), ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      children.delete(child);
      done({ code, out });
    });
  });
}

// ------------------------------------------------------------------ setting up

if (!existsSync(join(ROOT, "dist", "client", "index.html"))) fail("the client isn't built: run `npm run demo`, which builds it first");

const args = process.argv.slice(2);
const open = !args.includes("--no-open"); // for recording, or a browser you'd rather pick yourself
const target = args.find((a) => !a.startsWith("--"));
let base: string;
if (target) {
  base = resolve(target);
  if (existsSync(base) && readdirSync(base).length) fail(`${base} isn't empty`);
  mkdirSync(base, { recursive: true });
} else {
  base = mkdtempSync(join(tmpdir(), "baesian-demo-"));
}
const dirOf = (a: Agent) => join(base, a.folder);
const main = dirOf(CLAUDE);

mkdirSync(main);
git(main, "init", "-q", "-b", "main");
for (const [path, text] of Object.entries(FILES)) {
  mkdirSync(dirname(join(main, path)), { recursive: true });
  writeFileSync(join(main, path), text);
}
git(main, "add", "-A");
git(main, "commit", "-q", "-m", "Crumb: a web server, the price list and the roadmap");
baesian(main, ["init"]);
git(main, "add", "-A");
git(main, "commit", "-q", "-m", "Set up Baesian");
git(main, "checkout", "-q", "-b", CLAUDE.branch);
git(main, "worktree", "add", "-q", "-b", CODEX.branch, dirOf(CODEX));

for (const a of [CLAUDE, CODEX]) {
  baesian(dirOf(a), ["--agent", a.name, "deck", a.deck.id, "--title", a.deck.title, "--from", "-"], `${a.deck.briefing}\n`);
}

interface Filed {
  id: string;
  agent: Agent;
  title: string;
  level: string;
}

const filed: Filed[] = DRAFTS.map(({ agent, meta, body }) => {
  const text = `---\n${stringify({ ...meta, deck: agent.deck.id })}---\n${body ? `${body}\n` : ""}`;
  const { card } = JSON.parse(baesian(dirOf(agent), ["--agent", agent.name, "file", "--json", "-"], text));
  return { id: card.meta.id, agent, title: card.meta.title, level: card.meta.level };
});

// ------------------------------------------------------------------ the show

/** Each agent waits on its blocking and hard cards one at a time, as it comes to them, and carries on with the rest. */
const waitsFor = (a: Agent) => filed.filter((f) => f.agent === a && f.level !== "provisional");

say();
say(`${bold("Crumb")}, a bakery's online shop, is at ${main}.`);
say("Two agents are at work on it, and have filed five decisions for you:");
for (const a of [CLAUDE, CODEX]) {
  say();
  say(`  ${bold(a.name)}, on ${a.branch} (deck "${a.deck.title}")`);
  const queue = waitsFor(a);
  for (const f of filed.filter((x) => x.agent === a)) {
    const n = queue.indexOf(f);
    const what = n === 0 ? "stopped until you answer" : n > 0 ? "waits on it next" : "carries on with its pick";
    say(`    ${f.id}  ${f.level.padEnd(11)}  ${f.title.padEnd(44)}  ${dim(what)}`);
  }
}
say();
say("Answer the cards in the client. What each agent hears appears here as you go.");
say("Press Enter when the agents reach a stopping point: they check for answers to the cards they didn't wait for.");
say("Ctrl-C stops the demo.");
say();

let stopping = false;

const server = spawn(CLI[0]!, [...CLI.slice(1), "serve", ...(open ? [] : ["--no-open"])], { cwd: main, stdio: ["ignore", "pipe", "inherit"] });
children.add(server);
createInterface({ input: server.stdout }).on("line", (line) => {
  const url = line.match(/^serving .* at (\S+)$/)?.[1];
  if (url) say(`${open ? "The client is opening in your browser, at" : "Open the client at"} ${url}\n`);
});
server.on("close", (code) => {
  if (!stopping) fail(`the server stopped (exit ${code})`);
});

async function agentLoop(a: Agent): Promise<void> {
  for (const [n, f] of waitsFor(a).entries()) {
    if (n > 0) say(dim(`${a.name} goes on, and stops again for ${f.id}, "${f.title}".\n`));
    for (;;) {
      const r = await baesianAsync(dirOf(a), ["--agent", a.name, "wait", f.id, "--timeout", "3600"]);
      if (stopping) return;
      if (r.code === 7) continue; // the reviewer is still there: wait again (D101)
      say(`${bold(a.name)} hears, from \`baesian wait ${f.id}\`:`);
      say(indent(r.out));
      if (r.code === 4) say(dim(`    (a real agent would now revise ${f.id} or withdraw it)`));
      say();
      break;
    }
  }
}

for (const a of [CLAUDE, CODEX]) void agentLoop(a);

createInterface({ input: process.stdin, terminal: false }).on("line", () => {
  for (const a of [CLAUDE, CODEX]) {
    const out = baesian(dirOf(a), ["--agent", a.name, "inbox"]).trim();
    say(`${bold(a.name)} reaches a stopping point, and \`baesian inbox\` says:`);
    say(indent(out));
    say();
  }
});

process.on("SIGINT", () => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  const bye = () => {
    say();
    say(`The demo repo is still at ${main}, with the catalog worktree beside it.`);
    say("Run `baesian serve` there to come back to it, `baesian list --all` to see every card, and delete the folder when you're done.");
    process.exit(0);
  };
  // The server says "stopped" as it goes, so let it finish before its output has nowhere to go.
  if (server.exitCode !== null || server.signalCode !== null) bye();
  server.once("close", bye);
  setTimeout(bye, 3000).unref();
});
