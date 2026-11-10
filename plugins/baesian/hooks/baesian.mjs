// Running the CLI from the plugin's hooks. `missing` means it isn't installed, so the hook says nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function baesian(args, input, cwd) {
  const r = spawnSync("baesian", args, { input, cwd, encoding: "utf8" });
  if (r.error) return { missing: r.error.code === "ENOENT", status: 1, stdout: "", stderr: String(r.error.message) };
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * The repo the hook runs in, if it uses Baesian, read without running the CLI, for hooks that run on every edit: its
 * top folder and its config, the clone's own in personal mode (B-4rwyz, `.git/baesian/config.json`), else the
 * committed `.baesian/config.json`, as the store reads it. An unreadable config reads as empty.
 */
export function repoOf(cwd) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.error || r.status !== 0) return undefined;
  const [toplevel, commonDir] = r.stdout.trim().split("\n");
  if (!toplevel || !commonDir) return undefined;
  for (const path of [join(commonDir, "baesian", "config.json"), join(toplevel, ".baesian", "config.json")]) {
    if (!existsSync(path)) continue;
    try {
      const config = JSON.parse(readFileSync(path, "utf8"));
      return { toplevel, config: config && typeof config === "object" && !Array.isArray(config) ? config : {} };
    } catch {
      return { toplevel, config: {} };
    }
  }
  return undefined;
}

/**
 * What each session has already been told, as keys, in a file of its own under the system's temporary folder: the
 * plugin's own memory, not Baesian's, so the hooks say a thing once a session. Nothing kept means it may say it again;
 * it never fails the hook.
 */
export function sessionMemory(kind, dir = join(tmpdir(), "baesian-plugin")) {
  const file = (session) => join(dir, `${kind}-${createHash("sha256").update(session).digest("hex").slice(0, 32)}.json`);
  return {
    read(session) {
      try {
        const keys = JSON.parse(readFileSync(file(session), "utf8"));
        return new Set(Array.isArray(keys) ? keys : []);
      } catch {
        return new Set();
      }
    },
    write(session, keys) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file(session), JSON.stringify([...keys]));
      } catch {
        // no memory of it: it may be said again
      }
    },
  };
}

/** `feat/run-store` to `feat-run-store`: the names Baesian gives its files, as its own `slug()` makes them (src/git.ts). */
export function slug(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}

/** The clone's live layer, `<git common dir>/baesian`, if the clone uses Baesian: what it keeps outside the record. */
export function liveDirOf(cwd) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.error || r.status !== 0) return undefined;
  const dir = join(r.stdout.trim(), "baesian");
  return existsSync(dir) ? dir : undefined;
}

/**
 * The model a hook's input names (B-k0w7d): Claude Code's `PostModelSwitch` gives `to_model`, and its `SessionStart`
 * gives `model`, which it may leave out (after /clear, for one); Codex gives every hook `model`.
 */
export function modelOf(input) {
  for (const value of [input?.to_model, input?.model]) {
    const model = typeof value === "string" ? value.trim() : "";
    if (model && model.length <= 200) return model;
  }
  return undefined;
}

/**
 * Keep the session's model where `baesian file` finds it (B-k0w7d): `models/<session>.json` in the live layer, by the
 * session ID the harness gives the hook, which it also gives the commands an agent runs. Neither harness tells those
 * commands the model, so the plugin keeps it for them. Written when it changes, replaced whole, never committed; it
 * never fails the hook. The file is Baesian's `SessionModel` (src/schema.ts). Returns whether it wrote.
 */
export function noteModel(input, now = () => new Date().toISOString()) {
  try {
    const model = modelOf(input);
    const session = typeof input?.session_id === "string" ? input.session_id.trim() : "";
    if (!model || !session) return false;
    const live = liveDirOf(typeof input.cwd === "string" && input.cwd ? input.cwd : undefined);
    if (!live) return false;
    const file = join(live, "models", `${slug(session)}.json`);
    try {
      if (JSON.parse(readFileSync(file, "utf8")).model === model) return false;
    } catch {
      // none yet, or unreadable: write it
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ type: "session-model", format: 1, model, at: now() })}\n`);
    renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/** This plugin's release, from its manifest, which each release commit sets to the CLI's (D114, B-3femd). */
export function pluginVersion(manifest = new URL("../.claude-plugin/plugin.json", import.meta.url)) {
  try {
    const version = JSON.parse(readFileSync(manifest, "utf8")).version;
    return typeof version === "string" && version ? version : undefined;
  } catch {
    return undefined;
  }
}

/** `1.2.3` as numbers, a pre-release's or a build's suffix ignored, or undefined for anything else. */
const releaseOf = (version) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return m ? m.slice(1).map(Number) : undefined;
};

/** Whether release `a` is older than `b`, newer, or neither can be told. */
function compareReleases(a, b) {
  const [x, y] = [releaseOf(a), releaseOf(b)];
  if (!x || !y) return undefined;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? "older" : "newer";
  return undefined;
}

/**
 * What to tell the agent when the `baesian` on PATH isn't this plugin's release (B-pw9ak): the plugin runs the command
 * line on PATH, so one session runs one release, the agent's commands, the git hooks and the plugin's alike; when they
 * differ, or there's none, the agent hears it once, at the session's start, to ask the person to install or update.
 * Nothing when they match, outside a repo that uses Baesian, or when either version can't be read.
 */
export async function versionNote(input, run = baesian, memory = sessionMemory("version"), plugin = pluginVersion()) {
  if (input?.hook_event_name !== "SessionStart" || !plugin || !repoOf(input?.cwd)) return "";
  const r = await run(["--version"], "", input?.cwd);
  const cli = r.missing ? undefined : r.status === 0 ? r.stdout.trim().split("\n")[0]?.trim() : "";
  if (cli === "" || cli === plugin) return "";
  const session = typeof input?.session_id === "string" ? input.session_id : "";
  const key = `${cli ?? "missing"} ${plugin}`;
  const told = session ? memory.read(session) : new Set();
  if (told.has(key)) return "";
  if (session) memory.write(session, new Set([...told, key]));
  const install = `npm install -g baesian@${plugin}`;
  const plugins = "in Claude Code `claude plugin update baesian@baesian`, in Codex `codex plugin add baesian@baesian`, then a new session";
  if (cli === undefined) {
    return `Baesian's plugin is release ${plugin}, but there's no \`baesian\` command on PATH, so Baesian's hooks, its MCP tools and its commit gate can't run. Ask the user to install it: \`${install}\`.\n`;
  }
  const which = compareReleases(cli, plugin);
  const ask =
    which === "older"
      ? `Ask the user to update the command line to the plugin's release: \`${install}\`.`
      : which === "newer"
        ? `Ask the user to update the plugin to the command line's release: ${plugins}.`
        : `Ask the user to install the same release of both: the command line with \`${install}\`, or the plugin (${plugins}).`;
  return `The \`baesian\` on PATH is release ${cli}, but Baesian's plugin is ${plugin}: the plugin's hooks and MCP tools run the \`baesian\` on PATH, and may expect commands or flags another release lacks. ${ask}\n`;
}

/** The session reading the inbox, so each session on a branch keeps its own place (B-ghhym). Both harnesses give it. */
export function sessionArgs(input) {
  return typeof input?.session_id === "string" && input.session_id ? ["--session", input.session_id] : [];
}

/**
 * Read the hook's input from stdin, and write its output, if any: an object as the harness's JSON, a string as plain
 * text, which `SessionStart` and `UserPromptSubmit` add to the agent's context in both harnesses.
 */
export async function runHook(handle) {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  try {
    const out = await handle(JSON.parse(text));
    if (typeof out === "string") process.stdout.write(out);
    else if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    // Any exit but 2 is a non-blocking error: Claude Code shows it, and the session carries on.
    process.stderr.write(`baesian: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
