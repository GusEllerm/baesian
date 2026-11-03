import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK } from "../src/agents.js";
import { main } from "../src/cli.js";
import { CardDraft, filingWarnings } from "../src/schema.js";
import { BODY, cleanup, draft, draftFile, repo } from "./helpers.js";

// B-vqn69: the record is committed with the code, so filing warns when a card looks like it holds a secret. A warning,
// never a block, and it names the field without quoting it.

afterEach(cleanup);

const AGENT = { agent: "claude-code" };

// Made-up secrets, put together here so the test file itself doesn't look like it holds any.
const glue = (...parts: string[]) => parts.join("");
const FAKE = {
  privateKey: glue("-----BEGIN ", "OPENSSH PRIVATE KEY", "-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----"),
  aws: glue("AK", "IA", "Z3XQ7RT2LMPA9KDV"),
  github: glue("gh", "p_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"),
  githubPat: glue("github", "_pat_", "11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ"),
  slack: glue("xo", "xb-", "1234567890-0987654321-AbCdEfGhIjKlMnOp"),
  jwt: glue("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJ", "zdWIiOiIxMjM0NTY3ODkwIn0", ".", "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
  urlToken: glue("https://api.example.com/v1/runs?limit=5&access_", "token=", "9f8e7d6c5b4a39281706f5e4d3c2b1a0"),
  assigned: glue("api_", "key = ", "\"q8Zr2LkW9vXe4TnB7pJs\""),
};

const warn = (over: Record<string, unknown>, body = "") => filingWarnings(CardDraft.parse(draft(over)), body);

describe("a warning on likely secrets at filing (B-vqn69)", () => {
  it("names the field and what the text looks like, and never quotes it", () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ crux_fact: `The deploy key is ${FAKE.privateKey}` }, "crux_fact", "a private key"],
      [{ rationale: `The CI user's key, ${FAKE.aws}, can already read the bucket.` }, "rationale", "an AWS access key ID"],
      [{ doing: `testing the release with ${FAKE.github}` }, "doing", "a GitHub token"],
      [{ doing: `testing the release with ${FAKE.githubPat}` }, "doing", "a GitHub token"],
      [{ check: `post to Slack with ${FAKE.slack}` }, "check", "a Slack token"],
      [{ wrong_if: `the session cookie, ${FAKE.jwt}, outlives the server` }, "wrong_if", "a JWT"],
      [{ evidence: ["a run", `curl '${FAKE.urlToken}'`] }, "evidence", "a token in a URL"],
      [{ premise: `the config has ${FAKE.assigned}`, premise_option: "proposal", premise_check: "read the config" }, "premise", "a key, token or password"],
    ];
    for (const [over, field, kind] of cases) {
      const ws = warn(over);
      expect(ws).toEqual([`${field} looks like it holds a secret (${kind}): the record is committed with the code, so check it before the next commit`]);
    }
    expect(warn({}, `Background.\n\n${FAKE.assigned}\n`)).toEqual([expect.stringMatching(/^the body looks like it holds a secret \(a key, token or password\)/)]);
  });

  it("warns once per field, for each field that holds one", () => {
    const ws = warn({ rationale: `${FAKE.aws} and ${FAKE.github}`, crux_fact: FAKE.jwt }, FAKE.privateKey);
    expect(ws.map((w) => w.split(" looks like")[0])).toEqual(["crux_fact", "rationale", "the body"]);
  });

  it("leaves ordinary card text alone", () => {
    const ordinary = [
      "The token lives in an HttpOnly cookie; the API key is read from process.env.API_KEY at start.",
      "Set password = process.env.DB_PASSWORD in the config, and token: none.",
      "See https://example.com/docs?key=short and the -----BEGIN PUBLIC KEY----- header.",
      "Commit 7231fbaffdd91d3ba108a9565350c39de06ebaa2 built on it, on github_actions.",
      "An access key ID looks like AKIA followed by sixteen characters.",
    ];
    for (const text of ordinary) expect(warn({ crux_fact: text }, text)).toEqual([]);
    expect(warn({})).toEqual([]);
  });

  it("is said in the instructions agents read: AGENTS.md's block and the plugin's skill", () => {
    const skill = readFileSync(join(process.cwd(), "plugins", "baesian", "skills", "baesian", "SKILL.md"), "utf8");
    for (const text of [AGENTS_BLOCK, skill]) {
      expect(text.replace(/\*/g, "").replace(/\s+/g, " ")).toContain("record is committed with the code, so don't paste secrets, credentials or private output into a card");
    }
  });

  it("files the card anyway, and `baesian file` prints the warning without the secret", async () => {
    const { store, dir } = repo();
    const r = store.fileCard(draft({ crux_fact: `the key is ${FAKE.aws}` }), BODY, AGENT);
    expect(r.card.meta.id).toMatch(/^B-/);
    expect(r.warnings).toEqual([expect.stringContaining("crux_fact looks like it holds a secret (an AWS access key ID)")]);

    const out: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => out.push(l), stdin: () => draftFile({ topic: "storage/other", title: "Another store" }, `Background: ${FAKE.github}\n`), cwd: dir };
    expect(await main(["node", "baesian", "--agent", "claude-code", "file"], io)).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("note: the body looks like it holds a secret (a GitHub token)");
    expect(text).not.toContain(FAKE.github);
  });
});
