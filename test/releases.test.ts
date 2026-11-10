import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import { afterAll, describe, expect, it } from "vitest";
import { parseDoc } from "../src/frontmatter.js";
import { openRepo } from "../src/git.js";
import { CHANGED_BLOCKS, type HookName, RELEASED_BLOCKS, blockDigest } from "../src/hookblock.js";
import {
  Attachment,
  CardMeta,
  Config,
  DeckMeta,
  Fallback,
  FILE_KINDS,
  type FileKind,
  type FileKindName,
  GateRecord,
  LedgerMeta,
  PasskeyProof,
  Preferences,
  RuleMeta,
  RuleRetirement,
  TopicAlias,
  Verdict,
  Withdrawal,
  upgradeFile,
} from "../src/schema.js";
import { parseSignature } from "../src/sshsig.js";
import type { Store } from "../src/store.js";
import { readTrustFile } from "../src/trust.js";
import { RecordAt } from "../src/verify.js";
import { VERSION, compareReleases } from "../src/version.js";

// What this Baesian keeps reading from every release before it, checked against the release tags of this repo, which
// has used Baesian on itself since before v0.1.0. Each tag joins the tests as it's made.
//
// Finding 1 of the formats review before v1 (docs/vault/Design/Release v1.md): format 1 is everything 0.1.x wrote, and
// that's how it freezes. So this Baesian reads the record committed at every release tag with its own schemas: every
// file, each as its kind, and then the record whole, as CI reads a commit's record (`RecordAt`). A later release that
// changes a format in place, rather than adding one with an upgrade (D156), fails here.
//
// B-np6af: the hook blocks each release's `baesian init` wrote are Baesian's own to the gate, by their digests in
// `RELEASED_BLOCKS`; each tag's are worked out by running that release's own `hookBlock()`.

const ROOT = join(import.meta.dirname, "..");

/** Release tags, `vX.Y.Z`, oldest first. A clone fetched without its tags has none, and the test says so. */
function releaseTags(): string[] {
  let out = "";
  try {
    out = execFileSync("git", ["tag", "--list", "v*", "--sort=v:refname"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return [];
  }
  return out.split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
}

/** The releases before v1, whose records format 1 is: every one must be here once any tag is. */
const BEFORE_V1 = Array.from({ length: 11 }, (_, n) => `v0.1.${n}`);

const TAGS = releaseTags();

/** A Markdown file's frontmatter, or a JSON file's fields, read as one kind, upgraded as the store upgrades it. */
const md = (kind: FileKindName, schema: z.ZodType) => (text: string, rel: string) => schema.parse(upgradeFile(kind, parseDoc(text).meta, rel));
const json = (kind: FileKindName, schema: z.ZodType) => (text: string, rel: string) => schema.parse(upgradeFile(kind, JSON.parse(text), rel));

const ID = "[0-9a-hjkmnp-tv-z]{5}";
const AT = String.raw`\d{8}T\d{6}\.\d{3}Z`;

/**
 * Every kind of file a record holds, by where it is, as the store finds it (src/store.ts): its revisions, gate records,
 * withdrawal and fallbacks in a card's folder; answers, with their signatures and passkey proofs; the ledger, decks,
 * rules and their retirements, topic merges, attachments, preference files and the service's keys. A file the test
 * doesn't know fails it: a new kind of file joins this list, and File Formats, when it's added.
 */
const KINDS: { where: RegExp; read: (text: string, rel: string) => unknown }[] = [
  { where: /^config\.json$/, read: json("config", Config) },
  { where: new RegExp(`^cards/B-${ID}/r\\d+\\.md$`), read: md("card", CardMeta) },
  { where: new RegExp(`^cards/B-${ID}/gate-r\\d+-(cli|relay)\\.json$`), read: json("gate", GateRecord) },
  { where: new RegExp(`^cards/B-${ID}/withdrawn\\.json$`), read: json("withdrawal", Withdrawal) },
  { where: new RegExp(`^cards/B-${ID}/fallback-[^/]+\\.json$`), read: json("fallback", Fallback) },
  { where: /\.sig$/, read: (text, rel) => parseSignature(text, rel) },
  { where: /^(verdicts|preferences)\/[^/]+\.passkey\.json$/, read: json("passkey-proof", PasskeyProof) },
  { where: new RegExp(`^verdicts/${AT}-B-${ID}-r\\d+-[0-9a-z]+\\.json$`), read: json("verdict", Verdict) },
  { where: new RegExp(`^ledger/B-${ID}-[0-9a-z]+\\.md$`), read: md("ledger", LedgerMeta) },
  { where: /^decks\/[a-z0-9][a-z0-9-]*\.md$/, read: md("deck", DeckMeta) },
  { where: new RegExp(`^rules/R-${ID}\\.md$`), read: md("rule", RuleMeta) },
  { where: new RegExp(`^rules/R-${ID}-retired\\.json$`), read: json("rule-retirement", RuleRetirement) },
  { where: /^topics\/[^/]+\.json$/, read: json("topic-alias", TopicAlias) },
  { where: /^attachments\/[^/]+\.json$/, read: json("attachment", Attachment) },
  { where: new RegExp(`^preferences/${AT}-${ID}\\.json$`), read: json("preferences", Preferences) },
  { where: /^trust\/[^/]+\.json$/, read: (text, rel) => readTrustFile(JSON.parse(text), rel) },
];

/** Every file under a directory, relative to it. */
function walk(root: string, at = root): string[] {
  if (!existsSync(at)) return [];
  return readdirSync(at).flatMap((name) => {
    const path = join(at, name);
    return statSync(path).isDirectory() ? walk(root, path) : [relative(root, path)];
  });
}

/** What the store makes of a whole record, as CI and the client read it: each card with its status, and the rest. */
function readWhole(store: Store) {
  return store.view(() => ({
    config: store.config(),
    hosted: store.hosted() !== undefined,
    cards: store.cardIds().map((id) => ({
      id,
      revisions: store.revisions(id).length,
      status: store.status(id),
      level: store.levelOf(id),
      gate: store.gateRecords(id).length,
      verdicts: store.verdicts(id).length,
      withdrawn: store.withdrawal(id) !== undefined,
      fallbacks: store.fallbacks(id).length,
      ledger: store.ledger(id).length,
      decision: store.decision(id),
    })),
    decks: store.decks().length,
    rules: store.rules().length,
    aliases: store.aliases().length,
    attachments: store.attachments().length,
    preferences: store.preferenceNames().length,
    inForce: store.inForce(),
    trust: store.trustFiles(),
  }));
}

const records = new RecordAt(openRepo(ROOT), { pinned: null });
afterAll(() => records.dispose());

describe("every release's record, read by this Baesian (Release v1, finding 1)", () => {
  // CI's checkout fetches them with the whole history (fetch-depth: 0); a clone without them skips the rest.
  it.runIf(TAGS.length === 0)("needs the release tags, which this clone doesn't have (git fetch --tags)", () => {
    expect(process.env.CI, "CI's checkout has no release tags: check out with fetch-depth: 0").toBeFalsy();
  });

  it.runIf(TAGS.length > 0)("has every release before v1, from v0.1.0 to v0.1.10", () => {
    expect(TAGS).toEqual(expect.arrayContaining(BEFORE_V1));
  });

  describe.each(TAGS)("%s", (tag) => {
    const store = records.store(tag);

    it("holds only files of a kind Baesian knows, and each reads as its kind", () => {
      const files = walk(store.record);
      expect(files.length).toBeGreaterThan(0);
      const problems: string[] = [];
      for (const rel of files) {
        const kind = KINDS.find((k) => k.where.test(rel));
        if (!kind) {
          problems.push(`${rel}: not a kind of file the test knows`);
          continue;
        }
        try {
          kind.read(readFileSync(join(store.record, rel), "utf8"), rel);
        } catch (e) {
          problems.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it("reads whole, as CI reads a commit's record, with nothing refused", () => {
      const whole = readWhole(store);
      expect(whole.cards.length).toBeGreaterThan(0);
      const reported: { path: string; error: string }[] = [];
      store.view(() => readWhole(store), (path, error) => reported.push({ path, error }));
      expect(reported).toEqual([]);
    });
  });
});

const sources: string[] = [];
afterAll(() => {
  for (const dir of sources.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A release's own `src/`, as it was tagged, in a folder of its own, to run its code. */
function sourceAt(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), "baesian-release-"));
  sources.push(dir);
  const tar = execFileSync("git", ["archive", "--format=tar", tag, "src"], { cwd: ROOT, maxBuffer: 64 << 20 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  return join(dir, "src");
}

describe("every release's hook blocks, which the gate counts as Baesian's own (B-np6af)", () => {
  it.each(TAGS)("%s's, each listed for its hook", async (tag) => {
    const released = (await import(pathToFileURL(join(sourceAt(tag), "hookblock.ts")).href)) as { HOOKS: readonly string[]; hookBlock: (name: string) => string };
    const unlisted = released.HOOKS.filter((name) => !RELEASED_BLOCKS[name as HookName]?.includes(blockDigest(released.hookBlock(name))));
    expect(unlisted, `add each one's digest to RELEASED_BLOCKS: ${unlisted.map((n) => `${n} ${blockDigest(released.hookBlock(n))}`).join(", ")}`).toEqual([]);
  });
});

describe("the releases a rollout names, which were released (B-4p43b, B-amxkp)", () => {
  // A new format, or a changed hook block, names the release that first has it (`since`); the release after writes it.
  // One that names a release before this one that was never tagged would have the new one written at once.
  const named = [
    ...Object.entries(FILE_KINDS).flatMap(([kind, k]) => (k as FileKind).formats.map((f, i) => ({ what: `${kind} format ${i + 2}`, since: f.since }))),
    ...Object.entries(CHANGED_BLOCKS).map(([hook, c]) => ({ what: `${hook}'s changed block`, since: c!.since })),
  ].filter((n) => compareReleases(n.since, VERSION) < 0);

  it.runIf(TAGS.length > 0)("each one before this release is a release tag", () => {
    expect(named.filter((n) => !TAGS.includes(`v${n.since}`)).map((n) => `${n.what}: ${n.since}`)).toEqual([]);
  });
});
