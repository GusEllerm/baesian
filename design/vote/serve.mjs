#!/usr/bin/env node
// Local server for the client mockup vote (D64). Serves design/ at http://127.0.0.1:8418/vote/ and
// saves each ballot POSTed to /api/vote as design/votes/ballot-<timestamp>.json. Node stdlib only;
// binds to localhost. Throwaway design tooling: nothing in src/ imports it.
//
//   node design/vote/serve.mjs [port]

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VOTES = join(ROOT, "votes");
const PORT = Number(process.argv[2] ?? 8418);
const MAX_BALLOT = 1_000_000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

async function saveBallot(req, res) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BALLOT) return send(res, 413, "Ballot is larger than 1 MB");
    chunks.push(chunk);
  }
  let ballot;
  try {
    ballot = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return send(res, 400, "Ballot is not valid JSON");
  }
  await mkdir(VOTES, { recursive: true });
  const name = `ballot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(join(VOTES, name), `${JSON.stringify(ballot, null, 2)}\n`);
  console.log(`saved ${name}`);
  send(res, 200, JSON.stringify({ saved: `design/votes/${name}` }), "application/json");
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/vote") return saveBallot(req, res);
  if (req.method !== "GET") return send(res, 405, "Only GET, and POST to /api/vote");
  let path = normalize(decodeURIComponent(url.pathname));
  if (path.endsWith(sep) || path.endsWith("/")) path += "index.html";
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return send(res, 403, "Outside design/");
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 404, `Not found: ${url.pathname}`);
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Vote at http://127.0.0.1:${PORT}/vote/  (Ctrl-C to stop)`);
});
