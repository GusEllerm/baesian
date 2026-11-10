import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK, CARD_FIELDS, CARD_TEMPLATE, personalInstructions } from "../src/agents.js";
import { main } from "../src/cli.js";
import { CardDraft, CardMeta } from "../src/schema.js";
import { writeNotes } from "../src/vault.js";
import { BODY, REVIEWER, cleanup, draft, draftFile, repo } from "./helpers.js";

// B-sy0kz, "A case the agent writes for its alternative": a card may carry the agent's best case for the option it didn't
// pick, `alternative_rationale`, written when it files, in its rationale's voice. It's the case a practice card gives its
// planted pick (B-kb5yt, docs/vault/Design/Practice Cards.md), so it's never shown on the card itself; only a card that
// carries one can come back as practice. Optional, and no migration before v1 (D108).

afterEach(cleanup);

const CASE = "One file next to the repo is all a single machine needs, and there's no server to keep running.";

async function cli(cwd: string, args: string[], stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const status = await main(["node", "baesian", "--agent", "claude-code", ...args], { out: (l) => out.push(l), err: (l) => err.push(l), stdin: () => stdin, cwd, notify: () => {}, env: {} });
  return { status, stdout: out.join("\n"), stderr: err.join("\n") };
}

describe("the alternative's case (B-sy0kz)", () => {
  it("is an optional field of a draft and a revision", () => {
    expect(CardDraft.parse(draft({ alternative_rationale: CASE })).alternative_rationale).toBe(CASE);
    expect(CardDraft.parse(draft()).alternative_rationale).toBeUndefined();
    expect(() => CardDraft.parse(draft({ alternative_rationale: "" }))).toThrow();
    expect(CardMeta.shape).toHaveProperty("alternative_rationale");
  });

  it("is in the template, commented out, beside the rationale, asked for in the same plain voice", () => {
    expect(CARD_TEMPLATE).toMatch(/^# rationale: "" +\(why you pick the proposal\)\n# alternative_rationale: "" \(the best case for the alternative: why you'd pick it, if it were your pick\)$/m);
    // Every optional field's note still starts in one column; the longest keeps a space before its own.
    const columns = new Set(CARD_TEMPLATE.split("\n").filter((l) => l.startsWith("# ") && /\(/.test(l) && !l.startsWith("# alternative_rationale")).map((l) => l.indexOf("(")));
    expect([...columns].every((c) => c === 27)).toBe(true);
    expect(CARD_FIELDS.find((f) => f.field === "alternative_rationale")).toMatchObject({ optional: true });
  });

  it("is in the instructions agents get: AGENTS.md's block, this repo's AGENTS.md, the skill; personal mode's still swaps the record's sentence", () => {
    const repoBlock = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    const skill = readFileSync(join(process.cwd(), "plugins", "baesian", "skills", "baesian", "SKILL.md"), "utf8");
    for (const text of [AGENTS_BLOCK, repoBlock]) {
      expect(text).toContain("Make your case in `rationale`, and the alternative's best case\nin `alternative_rationale`, as you'd argue it if it were your pick.");
    }
    expect(skill).toContain("Give the alternative its best case too, in `alternative_rationale`, as you'd write it if it were your pick.");
    const personal = personalInstructions();
    expect(personal).toContain("`alternative_rationale`");
    expect(personal).not.toContain("The decision record is committed");
    expect(personal.replace(/\s+/g, " ")).toContain("The decision record stays in this clone, but a card reaches the reviewer's website in a linked repo");
  });

  it("files with the card and stays on its revision, from the CLI and the store", async () => {
    const { dir, store } = repo();
    const r = await cli(dir, ["file", "--json"], draftFile({ alternative_rationale: CASE }));
    expect(r.status, r.stderr).toBe(0);
    const id = JSON.parse(r.stdout).card.meta.id as string;
    expect(store.card(id)!.meta.alternative_rationale).toBe(CASE);
    expect(readFileSync(join(dir, ".baesian", "cards", id, "r1.md"), "utf8")).toContain(`alternative_rationale: ${CASE}`);
    const plain = store.fileCard(draft({ title: "Another store", topic: "storage/other" }), BODY, { agent: "claude-code", force: true }).card;
    expect(plain.meta).not.toHaveProperty("alternative_rationale");
  });

  it("is never shown as the agent's case: not by `baesian show`, nor in the decision's note in the vault", async () => {
    const { dir, store } = repo();
    mkdirSync(join(dir, "docs", "vault"), { recursive: true });
    store.setVault("docs/vault");
    const id = store.fileCard(draft({ rationale: "A single file is enough here.", alternative_rationale: CASE }), BODY, { agent: "claude-code", force: true }).card.meta.id;
    const shown = await cli(dir, ["show", id]);
    expect(shown.stdout).toContain("A single file is enough here.");
    expect(shown.stdout).not.toContain(CASE);
    store.addVerdict({ card: id, revision: 1, response: "accept", first_choice: "proposal", ...REVIEWER });
    store.syncRecord();
    writeNotes(store);
    const notes = readdirSync(join(dir, "docs", "vault", "Decisions")).map((f) => readFileSync(join(dir, "docs", "vault", "Decisions", f), "utf8"));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("**The agent's case:** A single file is enough here.");
    expect(notes[0]).not.toContain(CASE);
  });
});
