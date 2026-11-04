import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_BLOCK } from "../src/agents.js";
import { main } from "../src/cli.js";
import { CardDraft, filingWarnings } from "../src/schema.js";
import { LooksLikeSecret } from "../src/store.js";
import { BODY, REVIEWER, cleanup, draft, draftFile, repo } from "./helpers.js";

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

describe("in a hosted repo, a card that looks like it holds a secret is refused unless given a reason (B-jfkv9)", () => {
  /** A repo linked to a project: its config names the service and the project. */
  function hostedRepo() {
    const r = repo();
    r.store.setLink({ service: "https://baesian.example", project: "proj-secrets", first_commit: "0".repeat(40) });
    return r;
  }

  async function cli(dir: string, args: string[], stdin: string) {
    const out: string[] = [];
    const err: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), stdin: () => stdin, cwd: dir, notify: () => {} };
    const code = await main(["node", "baesian", "--agent", "claude-code", ...args], io);
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  it("writes nothing, and names the field and the kind of secret, never the text", async () => {
    const { store, dir } = hostedRepo();
    expect(() => store.fileCard(draft({ crux_fact: `the key is ${FAKE.aws}` }), BODY, AGENT)).toThrow(LooksLikeSecret);
    expect(store.cards()).toEqual([]);
    const r = await cli(dir, ["file"], draftFile({}, `Background: ${FAKE.github}\n`));
    expect(r.code).toBe(1);
    expect(r.err).toContain("nothing filed: in a hosted repo a card goes to the service as it's filed, and this one looks like it holds a secret (B-jfkv9)");
    expect(r.err).toContain("  - the body looks like it holds a GitHub token");
    expect(r.err).toContain('--secret-reason "<why>"');
    expect(r.err).not.toContain(FAKE.github);
    expect(store.cards()).toEqual([]);
    expect(existsSync(join(store.record, "cards"))).toBe(false);
  });

  it("files it with --secret-reason, keeping the reason on the card, where `baesian show` shows it", async () => {
    const { store, dir } = hostedRepo();
    const r = await cli(dir, ["file", "--secret-reason", "a made-up key, from the docs' example", "--json"], draftFile({ crux_fact: `the key is ${FAKE.aws}` }));
    expect(r.code, r.err).toBe(0);
    const id = JSON.parse(r.out).card.meta.id as string;
    expect(store.card(id)?.meta.secret_reason).toBe("a made-up key, from the docs' example");
    const shown = await cli(dir, ["show", id], "");
    expect(shown.out).toContain('secret_reason (filed though it looks like it holds a secret, B-jfkv9) by claude-code on main (an agent): "a made-up key, from the docs\' example"');
    // A revision is refused the same way, and takes the same reason.
    store.addVerdict({ card: id, revision: 1, response: "reject", comment: "Say more.", ...REVIEWER });
    const refused = await cli(dir, ["revise", id], draftFile({ proposal: `use ${FAKE.slack}` }));
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("proposal looks like it holds a Slack token");
    const revised = await cli(dir, ["revise", id, "--secret-reason", "a placeholder from the vendor's docs"], draftFile({ proposal: `use ${FAKE.slack}` }));
    expect(revised.code, revised.err).toBe(0);
    expect(store.card(id)?.meta).toMatchObject({ revision: 2, secret_reason: "a placeholder from the vendor's docs" });
  });

  it("leaves a repo that isn't hosted with the warning alone (D136)", async () => {
    const { store, dir } = repo();
    const r = await cli(dir, ["file"], draftFile({ crux_fact: `the key is ${FAKE.aws}` }));
    expect(r.code).toBe(0);
    expect(r.out).toContain("note: crux_fact looks like it holds a secret (an AWS access key ID)");
    expect(store.cards()).toHaveLength(1);
    expect(store.cards()[0]!.meta.secret_reason).toBeUndefined();
  });
});
