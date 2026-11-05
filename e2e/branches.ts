import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "../src/hooks.js";
import { Store } from "../src/store.js";
import { BODY, draft, sh } from "../test/helpers.js";

// A repo's history for the branches panel (D181), made the way agents and git make it: cards filed on branches, the
// commits that cite them (their ledger written by post-commit), a merge commit and a squash (found by post-merge and
// post-commit), and a branch still open, one card on it waiting. `sh` runs git with the hooks off, so each step runs the
// hook git would have run. The record is committed (shared mode), with the answers in it.

const quiet = { out: () => {}, err: () => {} };
let n = 0;

export interface History {
  cards: Record<"session" | "cookie" | "deletion" | "kitchen" | "prices" | "typo", string>;
  /** The merge commit of feat/checkout into main, and the squash of fix/typo. */
  merged: string;
  squashed: string;
  /** The commits that cite cards, newest last. */
  commits: string[];
}

/** File a card on the branch checked out, answer it as given, and commit the work with the record, citing it. */
async function decide(dir: string, over: Record<string, unknown>, answer?: Record<string, unknown> | "withdraw"): Promise<{ id: string; commit: string }> {
  n += 1;
  const store = Store.open(dir);
  const { agent = "claude-code", ...fields } = over;
  const id = store.fileCard(draft({ topic: `history${n}/q`, touches: [], reverse: "cheap", ...fields }), BODY, { agent: agent as string, force: true }).card.meta.id;
  if (answer === "withdraw") store.withdraw(id, "not needed after all", "claude-code");
  else if (answer) store.addVerdict({ card: id, revision: 1, reviewer: "gus", client: "test", ...answer } as Parameters<Store["addVerdict"]>[0]);
  store.syncRecord();
  writeFileSync(join(dir, `work-${n}.txt`), `work ${n}\n`);
  sh(dir, "add", "-A");
  // The commit's subject is the agent's own words: it stays on the machine (D181).
  sh(dir, "commit", "-q", "-m", `Secret subject ${n}: the acquisition talks\n\nBaesian-Card: ${id}`);
  await runHook(Store.open(dir), "post-commit", [], quiet);
  return { id, commit: sh(dir, "rev-parse", "HEAD") };
}

function work(dir: string, name: string): void {
  writeFileSync(join(dir, name), `${name}\n`);
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", name);
}

/** The history: main, feat/checkout merged into it, fix/typo squashed into it, and feat/catalog still open. */
export async function makeHistory(dir: string): Promise<History> {
  const commits: string[] = [];
  const store = Store.open(dir);
  store.syncRecord();
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "Set up Baesian");
  const session = await decide(dir, { title: "Where the session lives", question: "Where should the session live?", level: "hard" }, { response: "accept", first_choice: "proposal" });
  commits.push(session.commit);

  sh(dir, "checkout", "-q", "-b", "feat/checkout");
  const cookie = await decide(dir, { title: "The session cookie", question: "Which cookie holds the session?" }, { response: "accept", first_choice: "alternative" });
  const deletion = await decide(dir, { title: "What deleting an account removes", question: "What should deleting an account remove?" }, { response: "alternative", choice: "Postgres", first_choice: "alternative" });
  commits.push(cookie.commit, deletion.commit);
  sh(dir, "checkout", "-q", "main");
  work(dir, "main-moves-on.txt");
  sh(dir, "merge", "-q", "--no-ff", "--no-edit", "feat/checkout");
  await runHook(Store.open(dir), "post-merge", ["0"], quiet);
  const merged = sh(dir, "rev-parse", "HEAD");

  sh(dir, "checkout", "-q", "-b", "fix/typo");
  const typo = await decide(dir, { title: "The typo's fix", question: "Which spelling should the page use?" }, "withdraw");
  commits.push(typo.commit);
  sh(dir, "checkout", "-q", "main");
  sh(dir, "merge", "-q", "--squash", "fix/typo");
  await runHook(Store.open(dir), "post-merge", ["1"], quiet);
  sh(dir, "commit", "-q", "-m", "Squashed: fix the typo");
  await runHook(Store.open(dir), "post-commit", [], quiet);
  const squashed = sh(dir, "rev-parse", "HEAD");

  sh(dir, "checkout", "-q", "-b", "feat/catalog");
  const kitchen = await decide(dir, { title: "How orders reach the kitchen", question: "How should orders reach the kitchen?", agent: "codex" }, { response: "accept", first_choice: "proposal" });
  const prices = await decide(dir, { title: "How prices are stored", question: "How should prices be stored?", agent: "codex", level: "blocking" });
  commits.push(kitchen.commit, prices.commit);
  sh(dir, "checkout", "-q", "main");
  return { cards: { session: session.id, cookie: cookie.id, deletion: deletion.id, kitchen: kitchen.id, prices: prices.id, typo: typo.id }, merged, squashed, commits };
}
