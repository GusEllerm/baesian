import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The client's build (D50, D98): `client/` builds into `dist/client/`, which `baesian serve` serves. In
// development (`npm run dev:client`), Vite serves the client with hot reload and passes /api/ to the running
// `baesian serve`, signing each request in with the server file's token. Development only: it never ships.

function runningServer(): { port: number; token: string } | undefined {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
    const path = join(common, "baesian", "server.json");
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  } catch {
    return undefined;
  }
}

export default defineConfig(({ command }) => {
  const server = command === "serve" ? runningServer() : undefined;
  return {
    root: import.meta.dirname,
    plugins: [react()],
    build: { outDir: join(import.meta.dirname, "..", "dist", "client"), emptyOutDir: true },
    server: {
      port: 5317,
      strictPort: true,
      proxy: server
        ? {
            "/api": {
              target: `http://127.0.0.1:${server.port}`,
              changeOrigin: true,
              headers: { authorization: `Bearer ${server.token}` },
            },
          }
        : {},
    },
  };
});
