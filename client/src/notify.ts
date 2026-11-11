import { useEffect, useRef, useState } from "react";
import type { ApiCard, ApiState } from "../../src/api";
import { load, save, storageKey } from "./local";
import { keyOf } from "./model";
import { type Team, sentToMe } from "./team";

// Notifications (D40): when a blocking or hard card arrives while you're elsewhere, the browser says so, and
// clicking the notification opens the card. They're off until you turn them on, and the browser's permission is
// asked only then, on your click, never on load.

export type NotifyStatus = "unsupported" | "off" | "on" | "blocked";

/**
 * Cards an agent stops for until you answer: open, and blocking or hard. In a project with members (P20), only those
 * sent to you: the member a card was sent to is the one told at once (B-tzdjn); the rest are on your desk when you look.
 */
export const stopping = (state: ApiState, team?: Team): ApiCard[] =>
  state.cards.filter((c) => c.status === "open" && (c.meta.level === "blocking" || c.meta.level === "hard") && (!team || sentToMe(c, team)));

/** The stopping cards in `state` that weren't in `before`, by revision: a revised card is a new question. */
export function arrivals(before: ReadonlySet<string>, state: ApiState, team?: Team): ApiCard[] {
  return stopping(state, team).filter((c) => !before.has(keyOf(c)));
}

export function useNotifications(state: ApiState, open: (id: string) => void, team?: Team) {
  const supported = typeof Notification !== "undefined";
  const key = storageKey(state.project.name, "notify");
  const [wanted, setWanted] = useState(() => load(key, false));
  const [permission, setPermission] = useState<NotificationPermission>(() => (supported ? Notification.permission : "denied"));
  const status: NotifyStatus = !supported ? "unsupported" : permission === "denied" ? "blocked" : wanted && permission === "granted" ? "on" : "off";

  const openRef = useRef(open);
  openRef.current = open;
  const known = useRef<ReadonlySet<string>>(undefined);
  useEffect(() => {
    const before = known.current;
    known.current = new Set(stopping(state, team).map(keyOf));
    // The first snapshot only sets what's known: a card already there when you open the page isn't news.
    if (!before || status !== "on") return;
    // You're looking at the desk: the card arrives in front of you.
    if (!document.hidden && document.hasFocus()) return;
    for (const c of arrivals(before, state, team)) {
      const n = new Notification(`${c.meta.source_agent} is waiting for you`, { body: c.meta.question, tag: c.meta.id });
      n.onclick = () => {
        window.focus();
        openRef.current(c.meta.id);
        n.close();
      };
    }
  }, [state, status]);

  /** Turns them on or off; turning them on asks the browser first, if it hasn't been asked. */
  const toggle = async (): Promise<NotifyStatus> => {
    if (!supported) return "unsupported";
    if (status === "on") {
      save(key, false);
      setWanted(false);
      return "off";
    }
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(p);
    if (p !== "granted") return p === "denied" ? "blocked" : "off";
    save(key, true);
    setWanted(true);
    return "on";
  };

  return { status, toggle };
}
