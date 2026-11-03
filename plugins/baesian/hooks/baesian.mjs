// Running the CLI from the plugin's hooks. `missing` means it isn't installed, so the hook says nothing.
import { spawnSync } from "node:child_process";

export function baesian(args, input, cwd) {
  const r = spawnSync("baesian", args, { input, cwd, encoding: "utf8" });
  if (r.error) return { missing: r.error.code === "ENOENT", status: 1, stdout: "", stderr: String(r.error.message) };
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
