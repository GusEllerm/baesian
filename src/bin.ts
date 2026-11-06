#!/usr/bin/env node
import { main } from "./cli.js";

// A reader that stops early (`baesian show B-x | head -1`) closes the pipe it reads: what's left to write has nowhere to
// go, so the command ends there, quietly, as a shell's own tools do, rather than with Node's unhandled EPIPE. Any other
// failure to write is still one.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(0);
    throw e;
  });
}

process.exitCode = await main();
