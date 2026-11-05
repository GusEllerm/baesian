import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { claudeMdMissesAgents, writeAgentsBlock } from "./agents.js";
import { cite } from "./cite.js";
import { type HookName, installHooks, installPersonalHooks, uninstallPersonalHooks } from "./hooks.js";
import { CONFIG_PATH } from "./facts.js";
import { linkAck } from "./login.js";
import { excludeRecord, includeRecord, sharedAlready } from "./personal.js";
import { PERSONAL_CONFIG, RECORD_DIR, type Store, ValidationError } from "./store.js";
import { type Field, type Line, type Piece, attention, cmd, fields, head, next, note, warning } from "./style.js";
import { initVault, vaultGuidance } from "./vault.js";

// `baesian init`, in either mode (B-4rwyz). Shared mode, today's: the record, `.baesian/`, is committed with the code,
// Baesian's block goes into the repo's hooks, and AGENTS.md tells every agent. Personal mode: one person uses Baesian in a
// repo whose collaborators don't, and nothing of Baesian's is committed. A personal clone switches to shared mode with
// `baesian init --shared`; a repo whose record is committed is shared already, and never switches back. Each prints a
// headline, what it set up as fields, and the next steps: the client, and in shared mode the commit to make (B-eyrt5).

export interface InitOptions {
  vault?: string;
  /** Write AGENTS.md's block (shared mode only). */
  agents: boolean;
  /** Install the gate's hooks. */
  hooks: boolean;
  /** How hooks run Baesian when it isn't on PATH (D48). */
  fallback: readonly string[];
}

/** A path as people read it: relative to the worktree when it's inside it. */
function shown(store: Store, path: string): string {
  const rel = relative(store.repo.toplevel, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

/** "a, b and c". */
const listed = (items: string[]): string => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** The hooks a setup wrote, by what it did to each: "pre-commit and commit-msg", or "pre-commit created; commit-msg updated". */
function hooksWritten(files: Record<HookName, string>): string {
  const changed = Object.entries(files).filter(([, v]) => v !== "unchanged");
  const by = new Map<string, string[]>();
  for (const [name, what] of changed) by.set(what, [...(by.get(what) ?? []), name]);
  if (by.size === 1 && by.has("created")) return listed(by.get("created")!);
  return [...by].map(([what, names]) => `${listed(names)} ${what}`).join("; ");
}

/** The preferences field: none yet means the client's setup survey suggests them (B-5na1k); only the client writes them (D147). */
function preferences(s: Store): Field | undefined {
  if (s.inForce().name) return undefined;
  return { label: "preferences", value: attention("none yet"), why: "the client suggests them, from a few example decisions" };
}

const SERVE = next("baesian serve", "open the client, and choose how much should reach you");

/** What shared mode's setup did, for `init`, `init --shared`, and a personal clone switching. */
interface Setup {
  /** Whether it set anything up, rather than finding it all done. */
  fresh: boolean;
  fields: Field[];
  notes: Line[];
  /** What a commit takes: the record, the hooks' folder (when it's versioned and changed), AGENTS.md (when changed). */
  paths: string[];
}

/** Shared mode's setup, as `baesian init` has always done it: the live layer, the record's config, the vault, the hooks' block and AGENTS.md. */
export function setUpShared(s: Store, o: InitOptions): Setup {
  const out: Field[] = [];
  const notes: Line[] = [];
  const paths: string[] = [];
  const created = s.init();
  if (created.length) {
    out.push({ label: "live layer", value: `${shown(s, s.live)}/`, why: "shared by every worktree, never committed" });
    out.push({ label: "record", value: `${shown(s, s.record)}/`, why: "committed with the code" });
    paths.push(RECORD_DIR);
  }
  // M6: the vault adapter. An existing config gains the vault; Bases is turned on, and the Decision Log gets its query.
  if (o.vault !== undefined) {
    const v = initVault(s, o.vault);
    out.push(v.field);
    notes.push(...v.notes);
    if (v.changed && !paths.includes(RECORD_DIR)) paths.push(RECORD_DIR);
  }
  if (o.hooks) {
    const r = installHooks(s, o.fallback);
    const changed = Object.values(r.files).some((v) => v !== "unchanged");
    const where = shown(s, r.dir);
    if (changed || r.setHooksPath) {
      const written = hooksWritten(r.files);
      const why: Piece[] = [written];
      if (r.setHooksPath) why.push(written ? "; " : "", "core.hooksPath points here, so each clone runs ", cmd("baesian init"), " once");
      out.push({ label: "git gate", value: `${where}/`, why });
    }
    if (!r.versioned) notes.push(note(`${where} isn't versioned, so other clones won't get the gate; CI still checks.`));
    else if (changed) paths.push(where);
  }
  if (o.agents) {
    const result = writeAgentsBlock(s.repo.toplevel, vaultGuidance(s));
    if (result !== "unchanged") {
      out.push({ label: "agents", value: "AGENTS.md", why: `instructions ${result === "created" ? "added" : result}` });
      paths.push("AGENTS.md");
    }
    if (claudeMdMissesAgents(s.repo.toplevel)) {
      notes.push(note("CLAUDE.md doesn't import AGENTS.md. Add a line ", cmd("@AGENTS.md"), " so Claude Code reads the instructions."));
    }
  }
  // Anything set up now (the layers, the hooks, AGENTS.md) makes it a setup; nothing, and it was set up already.
  return { fresh: created.length > 0 || paths.length > 0 || out.some((f) => f.label === "git gate"), fields: out, notes, paths };
}

/** `baesian init`, shared mode: what it set up, the client, and the commit to make. */
export function initSharedMode(s: Store, o: InitOptions): Line[] {
  const r = setUpShared(s, o);
  const out: Line[] = [head("done", r.fresh ? "set up Baesian in this repo, in shared mode" : "Baesian is set up in this repo already, in shared mode")];
  out.push(...fields([...r.fields, preferences(s)]), ...r.notes);
  if (!s.inForce().name) out.push(SERVE);
  if (r.paths.length) out.push(next(`git add ${r.paths.join(" ")} && git commit -m "Use Baesian"`));
  return out;
}

/**
 * `baesian init --personal` (B-4rwyz): the live layer with the clone's config in it, `/.baesian/` in the clone's
 * `info/exclude`, and the clone's own hooks, which run Baesian's gate and then the repo's, named by a config file of
 * Baesian's that the clone's `.git/config` includes last. Nothing in the worktree changes. Refused where the repo is
 * shared already, and with a vault, whose notes are committed files.
 */
export function setUpPersonal(s: Store, o: InitOptions): Line[] {
  if (o.vault !== undefined) {
    throw new ValidationError(`--vault: the vault's notes are committed files, and personal mode commits nothing${cite("B-4rwyz")}`, [
      { command: "baesian init --shared --vault <path>", why: "give the vault when the repo switches to shared mode" },
    ]);
  }
  const was = s.personal;
  if (!was) {
    const why = sharedAlready(s);
    if (why) throw new ValidationError(why);
  }
  const out: Field[] = [];
  const created = s.init({}, { personal: true });
  if (created.length) out.push({ label: "live layer", value: `${shown(s, s.live)}/`, why: "this clone's cards, answers, ledger and config, in place of a committed record" });
  if (excludeRecord(s)) out.push({ label: "git ignores", value: `${RECORD_DIR}/`, why: "in this clone only (.git/info/exclude), so a stray record is never committed" });
  const notes: Line[] = [];
  if (o.hooks) {
    const r = installPersonalHooks(s, o.fallback);
    const dir = `${shown(s, r.dir)}/`;
    const why: string[] = [];
    if (r.moved) why.push(`moved out of the clone's core.hooksPath, which names the repo's own hooks again (${r.repo.shown}), into ${shown(s, r.config)}, so a setup script that sets core.hooksPath no longer turns it off`);
    if (r.wasOff) why.push(`on again (it was off: ${r.wasOff})`);
    if (r.pointed) {
      why.push(
        `this clone's own hooks: Baesian's gate, then the repo's own hooks from ${r.repo.shown}/, which are unchanged. Git finds them through ${shown(s, r.config)}, which the clone's .git/config includes last, so a setup script that sets core.hooksPath leaves the gate on. Commits keep no Baesian trailers: the gate takes them out of the message, into this clone's ledger`,
      );
    } else why.push(`this clone's own hooks, refreshed, then the repo's from ${r.repo.shown}/`);
    // A field each: what moved, that it's on again, and what the hooks are.
    for (const w of why) out.push({ label: "git gate", value: dir, why: w });
    if (r.stillOff) notes.push(warning(`git doesn't run them here yet: ${r.stillOff}. Take that setting out, and the gate is on.`));
  }
  if (!was) out.push({ label: "agents", value: "AGENTS.md", why: "left as it is: agents hear of Baesian from its plugin, for Claude Code or Codex, at the start of each session" });
  const lines: Line[] = [
    head(
      "done",
      was
        ? `Baesian is set up in this clone already, in personal mode${cite("B-4rwyz")}: nothing of Baesian's is committed from this clone`
        : `set up Baesian in this clone alone, in personal mode${cite("B-4rwyz")}: nothing of Baesian's is committed, so the repo's collaborators see no change`,
    ),
    ...fields([...out, preferences(s)]),
    ...notes,
  ];
  if (!s.inForce().name) lines.push(SERVE);
  if (!was) lines.push(next("baesian init --shared", "to share it later: writes this branch's record, the hooks' block and AGENTS.md into the repo, for you to commit"));
  return lines;
}

/**
 * The cards a branch's record holds when a personal clone switches to shared mode (B-4rwyz): those filed on it or
 * attached to it, and those its merges brought (D181), through the branches merged into it in turn.
 */
export function cardsForBranch(s: Store, branch: string = s.repo.branch): string[] {
  const ids = new Set(s.branchCards(branch).map((c) => c.meta.id));
  const merges = s.merges();
  const into = new Set([branch]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const m of merges) {
      if (!into.has(m.into)) continue;
      for (const id of m.cards) ids.add(id);
      if (!into.has(m.branch)) {
        into.add(m.branch);
        grew = true;
      }
    }
  }
  return [...ids].sort();
}

/**
 * `baesian init --shared` (B-4rwyz). In a personal clone, the switch: the clone's config becomes the record's, this
 * branch's record is written from the live layer, the clone's own hooks go (with the include of Baesian's setting in the
 * clone's `.git/config`, so `core.hooksPath` is the repo's again) and Baesian's block goes into the repo's, AGENTS.md
 * gets its block, and `info/exclude` no longer hides `.baesian/`.
 * Nothing is committed: the lines end with the commit to make, and the gate facts it raises. Elsewhere, shared mode's
 * setup, as `baesian init` does it, and this branch's cards into its record when they aren't there.
 */
export function initShared(open: () => Store, o: InitOptions): Line[] {
  let s = open();
  const switching = s.personal;
  const config = switching ? s.config() : {};
  if (switching) {
    if (existsSync(s.record)) {
      throw new ValidationError(`this worktree has a ${RECORD_DIR}/ already, which personal mode never writes: delete it, then run \`baesian init --shared\` again, which writes the record from this clone's live layer`);
    }
    // The clone's config becomes the record's, before anything else changes: it holds the link.
    mkdirSync(s.record, { recursive: true });
    copyFileSync(join(s.live, PERSONAL_CONFIG), join(s.record, "config.json"));
    rmSync(join(s.live, PERSONAL_CONFIG));
    uninstallPersonalHooks(s);
    includeRecord(s);
    s = open();
  }
  const r = setUpShared(s, o);
  const rows = [...r.fields];
  if (!o.hooks && switching) rows.push({ label: "git gate", value: "none", why: "with --no-hooks, this clone's own hooks are gone and none were put in the repo's" });
  // This branch's record, from the live layer: what personal mode kept there in its place.
  const ids = cardsForBranch(s);
  const added = s.syncRecord(ids);
  if (added.length || switching) {
    const record = { label: "record", value: `${shown(s, s.record)}/`, why: `${ids.length} card${ids.length === 1 ? "" : "s"} of this branch's, ${added.length} file${added.length === 1 ? "" : "s"} written` };
    const at = rows.findIndex((f) => f.label === "record");
    if (at >= 0) rows[at] = record;
    else rows.push(record);
  }
  const notes = [...r.notes];
  const others = s.cards().filter((c) => !ids.includes(c.meta.id));
  if (others.length) {
    const branches = [...new Set(others.map((c) => c.meta.source_branch))].sort();
    notes.push(
      note(
        `${others.length === 1 ? "1 card" : `${others.length} cards`} filed on ${branches.length === 1 ? "another branch" : "other branches"} (${branches.join(", ")}) ${others.length === 1 ? "stays" : "stay"} in the live layer: run `,
        cmd("baesian init --shared"),
        ` on ${branches.length === 1 ? "that branch" : "each"} to write ${others.length === 1 ? "it" : "them"} into its record`,
      ),
    );
  }
  const out: Line[] = [
    head(
      "done",
      switching
        ? `switched this clone to shared mode${cite("B-4rwyz")}: its Baesian goes into the repo, for you to commit`
        : r.fresh
          ? "set up Baesian in this repo, in shared mode"
          : "Baesian is set up in this repo already, in shared mode",
    ),
    ...fields([...rows, preferences(s)]),
    ...notes,
  ];
  if (!s.inForce().name) out.push(SERVE);
  if (switching) {
    const paths = [RECORD_DIR, ...r.paths.filter((p) => p !== RECORD_DIR)];
    const ack = config.service && config.project ? linkAck(config.service, config.project) : undefined;
    out.push(
      note(
        `nothing is committed yet. The commit gate ${ack ? `asks an ack for the link, infra:${CONFIG_PATH}${cite("B-w4g6c")}` : "sees no decision in it"}: Baesian's own block in the repo's hooks isn't one${cite("B-g6ywj")}.`,
      ),
    );
    out.push(next(`git add ${paths.join(" ")} && git commit -m "Use Baesian in this repo"${ack ? ` -m "${ack}"` : ""}`));
  } else if (added.length && !r.paths.includes(RECORD_DIR)) out.push(next(`git add ${RECORD_DIR} && git commit -m "This branch's decisions"`));
  else if (r.paths.length) out.push(next(`git add ${r.paths.join(" ")} && git commit -m "Use Baesian"`));
  return out;
}
