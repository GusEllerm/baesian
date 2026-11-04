import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

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

/**
 * The website as an app (M9e step 2): its page names the manifest and the icons, which only the site's build has
 * (client/site-public/), so the local client's page doesn't ask for files it hasn't got.
 */
function installable(): Plugin {
  return {
    name: "baesian-installable",
    transformIndexHtml: () => [
      { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "32x32" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "icon", href: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "theme-color", content: "#d9d0da" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Baesian" }, injectTo: "head" },
    ],
  };
}

export default defineConfig(({ command, mode }) => {
  const server = command === "serve" ? runningServer() : undefined;
  // The website's build (M9e, `--mode site`): the same client, into dist/site/, which the Worker serves as its assets
  // (service/wrangler.jsonc), with the headers in client/site-public/_headers. It isn't in the npm package.
  const site = mode === "site";
  return {
    root: import.meta.dirname,
    plugins: [react(), ...(site ? [installable()] : [])],
    publicDir: site ? join(import.meta.dirname, "site-public") : false,
    build: { outDir: join(import.meta.dirname, "..", "dist", site ? "site" : "client"), emptyOutDir: true, chunkSizeWarningLimit: 600 },
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
