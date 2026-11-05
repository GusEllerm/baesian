import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { claudeMdMissesAgents, writeAgentsBlock } from "./agents.js";
import { installHooks, installPersonalHooks, uninstallPersonalHooks } from "./hooks.js";
import { CONFIG_PATH } from "./facts.js";
import { linkAck } from "./login.js";
import { excludeRecord, includeRecord, sharedAlready } from "./personal.js";
import { PERSONAL_CONFIG, RECORD_DIR, type Store, ValidationError } from "./store.js";
import { initVault, vaultGuidance } from "./vault.js";

// `baesian init`, in either mode (B-4rwyz). Shared mode, today's: the record, `.baesian/`, is committed with the code,
// Baesian's block goes into the repo's hooks, and AGENTS.md tells every agent. Personal mode: one person uses Baesian in a
// repo whose collaborators don't, and nothing of Baesian's is committed. A personal clone switches to shared mode with
// `baesian init --shared`; a repo whose record is committed is shared already, and never switches back.

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

/** Shared mode's setup, as `baesian init` has always done it: the live layer, the record's config, the vault, the hooks' block and AGENTS.md. */
export function setUpShared(s: Store, o: InitOptions): { lines: string[]; agents: boolean; hooksDir?: string } {
  const out: string[] = [];
  const created = s.init();
  if (created.length) {
    out.push(`live layer:  ${shown(s, s.live)}/  (shared by every worktree, not committed)`);
    out.push(`record:      ${shown(s, s.record)}/  (commit this)`);
  } else {
    out.push("already set up");
  }
  // M6: the vault adapter. An existing config gains the vault; Bases is turned on, and the Decision Log gets its query.
  if (o.vault !== undefined) out.push(...initVault(s, o.vault));
  let hooksDir: string | undefined;
  if (o.hooks) {
    const r = installHooks(s, o.fallback);
    const changed = Object.entries(r.files).filter(([, v]) => v !== "unchanged");
    const where = shown(s, r.dir);
    if (changed.length) out.push(`git gate:    ${changed.map(([k, v]) => `${k} ${v}`).join(", ")} in ${where}/`);
    if (r.setHooksPath) out.push("             core.hooksPath set to .githooks (each clone runs `baesian init` once)");
    if (!r.versioned) out.push(`note: ${where} isn't versioned, so other clones won't get the gate; CI still checks.`);
    else if (changed.length) hooksDir = where;
  }
  let agents = false;
  if (o.agents) {
    const result = writeAgentsBlock(s.repo.toplevel, vaultGuidance(s));
    if (result !== "unchanged") {
      out.push(`AGENTS.md:   instructions ${result}`);
      agents = true;
    }
    if (claudeMdMissesAgents(s.repo.toplevel)) {
      out.push("note: CLAUDE.md doesn't import AGENTS.md. Add a line `@AGENTS.md` so Claude Code reads the instructions.");
    }
  }
  return { lines: out, agents, ...(hooksDir ? { hooksDir } : {}) };
}

/**
 * `baesian init --personal` (B-4rwyz): the live layer with the clone's config in it, `/.baesian/` in the clone's
 * `info/exclude`, and the clone's own hooks, which run Baesian's gate and then the repo's. Nothing in the worktree
 * changes. Refused where the repo is shared already, and with a vault, whose notes are committed files.
 */
export function setUpPersonal(s: Store, o: InitOptions): string[] {
  if (o.vault !== undefined) {
    throw new ValidationError("--vault: the vault's notes are committed files, and personal mode commits nothing (B-4rwyz). Give the vault when the repo switches to shared mode: `baesian init --shared --vault <path>`.");
  }
  const was = s.personal;
  if (!was) {
    const why = sharedAlready(s);
    if (why) throw new ValidationError(why);
  }
  const out: string[] = [
    was
      ? "personal mode, as before (B-4rwyz): nothing of Baesian's is committed from this clone"
      : "personal mode (B-4rwyz): this clone uses Baesian, and nothing of Baesian's is committed, so the repo's collaborators see no change",
  ];
  const created = s.init({}, { personal: true });
  if (created.length) out.push(`live layer:  ${shown(s, s.live)}/  (this clone's cards, answers, ledger and config, in place of a committed record)`);
  if (excludeRecord(s)) out.push(`git ignores: ${RECORD_DIR}/, in this clone only (.git/info/exclude), so a stray record is never committed`);
  if (o.hooks) {
    const r = installPersonalHooks(s, o.fallback);
    if (r.wasReset) out.push(`git gate:    on again: something had set core.hooksPath to ${r.repo.shown}, which turned it off`);
    if (r.pointed) {
      out.push(`git gate:    this clone's own hooks, in ${shown(s, r.dir)}/ (its core.hooksPath), run Baesian's gate, then the repo's own hooks from ${r.repo.shown}/, which are unchanged`);
      out.push("             commits keep no Baesian trailers: the gate takes them out of the message, into this clone's ledger");
    } else out.push(`git gate:    this clone's own hooks, refreshed in ${shown(s, r.dir)}/, then the repo's from ${r.repo.shown}/`);
  }
  if (!was) {
    out.push("agents:      AGENTS.md is left as it is: agents hear of Baesian from its plugin, for Claude Code or Codex, at the start of each session");
    out.push("to share it: `baesian init --shared` writes this branch's record, the hooks' block and AGENTS.md into the repo, for you to commit");
  }
  return out;
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
 * branch's record is written from the live layer, the clone's own hooks go and Baesian's block goes into the repo's,
 * `core.hooksPath` goes back to what it was, AGENTS.md gets its block, and `info/exclude` no longer hides `.baesian/`.
 * Nothing is committed: the lines end with the commit to make, and the gate facts it raises. Elsewhere, shared mode's
 * setup, as `baesian init` does it, and this branch's cards into its record when they aren't there.
 */
export function initShared(open: () => Store, o: InitOptions): string[] {
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
  const { lines, agents, hooksDir } = setUpShared(s, o);
  const out = switching ? ["shared mode (B-4rwyz): this clone's Baesian goes into the repo, for you to commit", ...lines.filter((l) => l !== "already set up")] : lines;
  if (!o.hooks && switching) out.push("git gate:    none: with --no-hooks, this clone's own hooks are gone and none were put in the repo's");
  // This branch's record, from the live layer: what personal mode kept there in its place.
  const ids = cardsForBranch(s);
  const added = s.syncRecord(ids);
  if (added.length || switching) out.push(`record:      ${shown(s, s.record)}/  (${ids.length} card${ids.length === 1 ? "" : "s"} of this branch's, ${added.length} file${added.length === 1 ? "" : "s"} written)`);
  const others = s.cards().filter((c) => !ids.includes(c.meta.id));
  if (others.length) {
    const branches = [...new Set(others.map((c) => c.meta.source_branch))].sort();
    out.push(
      `note: ${others.length === 1 ? "1 card" : `${others.length} cards`} filed on ${branches.length === 1 ? "another branch" : "other branches"} (${branches.join(", ")}) ${others.length === 1 ? "stays" : "stay"} in the live layer: run \`baesian init --shared\` on ${branches.length === 1 ? "that branch" : "each"} to write ${others.length === 1 ? "it" : "them"} into its record`,
    );
  }
  if (switching) {
    const paths = [RECORD_DIR, ...(agents ? ["AGENTS.md"] : []), ...(hooksDir ? [hooksDir] : [])];
    const ack = config.service && config.project ? linkAck(config.service, config.project) : undefined;
    out.push(`Commit it when you're ready; nothing is committed yet. The commit gate ${ack ? `asks an ack for the link, ${`infra:${CONFIG_PATH}`} (B-w4g6c)` : "sees no decision in it"}: Baesian's own block in the repo's hooks isn't one (B-g6ywj). This commits it${ack ? " with the ack" : ""}:`);
    out.push(`  git add ${paths.join(" ")} && git commit -m "Use Baesian in this repo"${ack ? ` -m "${ack}"` : ""}`);
  }
  return out;
}
