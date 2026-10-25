import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { UserConfig, describeError } from "./schema.js";
import type { Card } from "./store.js";

/** `$BAESIAN_CONFIG`, else `$XDG_CONFIG_HOME/baesian/config.json`, else `~/.config/baesian/config.json`. */
export function userConfigPath(): string {
  if (process.env.BAESIAN_CONFIG) return process.env.BAESIAN_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "baesian", "config.json");
}

export function userConfig(path: string = userConfigPath()): UserConfig {
  if (!existsSync(path)) return {};
  const result = UserConfig.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!result.success) throw new Error(`${path} is not valid:\n${describeError(result.error)}`);
  return result.data;
}

export interface NotifyPayload {
  id: string;
  title: string;
  question: string;
  level: string;
  proposal: string;
  deck: string;
  branch: string;
}

export function payloadFor(card: Card): NotifyPayload {
  const m = card.meta;
  return { id: m.id, title: m.title, question: m.question, level: m.level, proposal: m.proposal, deck: m.deck, branch: m.source_branch };
}

/** Only cards that make an agent wait interrupt the reviewer (D40). */
export function shouldNotify(card: Card): boolean {
  return card.meta.level === "blocking" || card.meta.level === "hard";
}

function osNotifyEnabled(config: UserConfig): boolean {
  if (process.env.BAESIAN_OS_NOTIFY === "0") return false;
  return config.os_notify ?? true;
}

/** Start a process and forget it. Notification failures must never fail the filing. */
function fire(command: string, args: string[], input?: string, env?: NodeJS.ProcessEnv): void {
  try {
    const child = spawn(command, args, { detached: true, stdio: [input ? "pipe" : "ignore", "ignore", "ignore"], env });
    child.on("error", () => {});
    if (input && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
    child.unref();
  } catch {
    // ignore
  }
}

function osNotification(p: NotifyPayload): void {
  const title = `Baesian: ${p.level} card ${p.id}`;
  const message = p.question;
  if (process.platform === "darwin") {
    // Text goes in as arguments, never interpolated into the script.
    fire("osascript", [
      "-e",
      "on run argv",
      "-e",
      "display notification (item 2 of argv) with title (item 1 of argv)",
      "-e",
      "end run",
      title,
      message,
    ]);
  } else if (process.platform === "linux") {
    fire("notify-send", [title, message]);
  }
}

/**
 * Tell the reviewer a blocking or hard card is waiting: an OS notification, and the user's `notify`
 * command with the card as JSON on stdin. The link to the card comes with the client (M4).
 */
export function notifyFiled(card: Card, config: UserConfig = userConfig()): { os: boolean; command: boolean } {
  if (!shouldNotify(card)) return { os: false, command: false };
  const payload = payloadFor(card);
  const os = osNotifyEnabled(config);
  if (os) osNotification(payload);
  if (config.notify) {
    fire("/bin/sh", ["-c", config.notify], `${JSON.stringify(payload)}\n`, {
      ...process.env,
      BAESIAN_CARD_ID: payload.id,
      BAESIAN_CARD_LEVEL: payload.level,
      BAESIAN_CARD_TITLE: payload.title,
    });
  }
  return { os, command: Boolean(config.notify) };
}
