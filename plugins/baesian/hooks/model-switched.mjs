// PostModelSwitch, in Claude Code (B-k0w7d): when a session switches model (/model, or another change), the plugin
// notes the new one, `to_model`, where `baesian file` finds it for the cards the session files from then on. Codex has
// no such event: it names the model to every hook, and new-verdicts.mjs notes it with your next message. It prints
// nothing, and never fails the switch.
import { pathToFileURL } from "node:url";
import { noteModel, runHook } from "./baesian.mjs";

/** Note the model the session switched to; no output. */
export async function onModelSwitched(input) {
  noteModel(input);
  return "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(onModelSwitched);
