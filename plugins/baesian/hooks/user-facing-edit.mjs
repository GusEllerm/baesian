// The PreToolUse hook on edits (B-qrdhh): when the agent is about to edit a file the repo declares user-facing (the
// globs in its config's `user_facing`), it gets a one-line reminder that a decision there goes to the person as a
// card. It never blocks, and reminds once a session for each file. Claude Code's Edit, Write and NotebookEdit give a
// path; Codex's apply_patch, which the `Edit|Write` matcher also matches there, gives a patch that names its files.
// It reads the config without running the CLI, since it runs on every edit; outside a repo that uses Baesian, or with
// no globs declared, it says nothing.
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { repoOf, runHook, sessionMemory } from "./baesian.mjs";

/** A path glob as the commit gate reads one (`globToRegExp()` in src/globs.ts): `**` crosses folders, `*` and `?` don't. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** The files an edit touches, as the tool names them: a path, or the files a patch adds, updates, deletes or moves to. */
export function editedPaths(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== "object") return [];
  if (toolName === "apply_patch") {
    const patch = typeof toolInput.command === "string" ? toolInput.command : typeof toolInput.input === "string" ? toolInput.input : "";
    return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+?)\s*$/gm)].map((m) => m[1]);
  }
  const path = toolInput.file_path ?? toolInput.notebook_path;
  return typeof path === "string" && path ? [path] : [];
}

/** The one line the agent is told. */
export function reminderFor(paths) {
  const named = paths.map((p) => `\`${p}\``).join(", ");
  return `Baesian: ${named} ${paths.length > 1 ? "are" : "is"} user-facing in this repo. If this edit decides how something looks, reads or behaves for the person, put that decision to them as a card (\`baesian file\`) before building on it; a change that only restores what a card or rule decided cites it instead.`;
}

/** The plugin's memory of the files each session has been reminded about (`sessionMemory()`). */
export function remindedOfFiles(dir) {
  return sessionMemory("user-facing", dir);
}

/** The hook's output for the harness's input, or nothing. */
export async function onEdit(input, reminded = remindedOfFiles(), repo = repoOf) {
  if (input?.hook_event_name !== "PreToolUse") return undefined;
  const paths = editedPaths(input.tool_name, input.tool_input);
  if (!paths.length) return undefined;
  const r = repo(input.cwd);
  const globs = Array.isArray(r?.config.user_facing) ? r.config.user_facing.filter((g) => typeof g === "string" && g) : [];
  if (!globs.length) return undefined;
  const res = globs.map(globToRegExp);
  const cwd = typeof input.cwd === "string" ? input.cwd : r.toplevel;
  // git gives the top folder with links resolved, so the file's folder is resolved too, when it exists.
  const real = (p) => {
    try {
      return join(realpathSync(dirname(p)), basename(p));
    } catch {
      return p;
    }
  };
  const inRepo = paths
    .map((p) => relative(r.toplevel, real(isAbsolute(p) ? p : resolve(cwd, p))).split(sep).join("/"))
    .filter((p) => p && !p.startsWith("../") && !isAbsolute(p));
  const session = typeof input.session_id === "string" ? input.session_id : "";
  const seen = reminded.read(session);
  const fresh = [...new Set(inRepo)].filter((p) => res.some((re) => re.test(p)) && !seen.has(p));
  if (!fresh.length) return undefined;
  reminded.write(session, new Set([...seen, ...fresh]));
  return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: reminderFor(fresh) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(onEdit);
