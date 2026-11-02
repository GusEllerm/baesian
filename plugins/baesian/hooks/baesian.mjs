// Running the CLI from the plugin's hooks. `missing` means it isn't installed, so the hook says nothing.
import { spawnSync } from "node:child_process";

export function baesian(args, input, cwd) {
  const r = spawnSync("baesian", args, { input, cwd, encoding: "utf8" });
  if (r.error) return { missing: r.error.code === "ENOENT", status: 1, stdout: "", stderr: String(r.error.message) };
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Read the hook's input from stdin, and write its output, if any, as Claude Code's JSON. */
export async function runHook(handle) {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  try {
    const out = await handle(JSON.parse(text));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    // Any exit but 2 is a non-blocking error: Claude Code shows it, and the session carries on.
    process.stderr.write(`baesian: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
