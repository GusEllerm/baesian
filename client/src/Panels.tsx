import { type ReactNode, useEffect, useRef } from "react";
import type { ApiCard } from "../../src/api";
import { type Spent, seconds, timeSpent } from "./calibration";
import type { NotifyStatus } from "./notify";

// M4 step 5e: the menu in the header, its two panels (your calibration, and the keys), and the empty desk.
// Round 5's, ported: design/explorations/round5/app.js (renderKeys, renderMirror, the menu, next()).

export type PanelKind = "calibration" | "keys" | "answers";

const NOTIFY_WORDS: Record<NotifyStatus, string> = { on: "on", off: "off", blocked: "blocked", unsupported: "" };

/** "More": the panels, and notifications. It closes on Esc, on a click elsewhere, and once you've picked. */
export function MoreMenu(p: { open: boolean; notify: NotifyStatus; onOpen: (open: boolean) => void; onPanel: (kind: PanelKind) => void; onNotify: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.open) return;
    menu.current?.querySelector<HTMLElement>("button")?.focus();
    const away = (e: PointerEvent) => !(e.target instanceof Element && e.target.closest(".menu-wrap")) && p.onOpen(false);
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [p.open]);
  const pick = (f: () => void) => () => {
    p.onOpen(false);
    f();
  };
  return (
    <div className="menu-wrap">
      <button type="button" className="menu-btn" aria-haspopup="menu" aria-expanded={p.open} aria-controls="menu" onClick={() => p.onOpen(!p.open)}>
        More
      </button>
      {p.open && (
        <div className="menu" id="menu" role="menu" ref={menu}>
          <button type="button" role="menuitem" onClick={pick(() => p.onPanel("calibration"))}>
            Your calibration
          </button>
          <button type="button" role="menuitem" onClick={pick(() => p.onPanel("keys"))}>
            Keyboard shortcuts <kbd>?</kbd>
          </button>
          {p.notify !== "unsupported" && (
            <button type="button" role="menuitemcheckbox" aria-checked={p.notify === "on"} onClick={pick(p.onNotify)}>
              Notify me when an agent stops <span className={`state ${p.notify}`}>{NOTIFY_WORDS[p.notify]}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Moves focus through the open menu with the arrow keys, as a menu should. */
export function moveInMenu(dir: "up" | "down") {
  const items = [...document.querySelectorAll<HTMLElement>("#menu [role^=menuitem]")];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[(i + (dir === "down" ? 1 : items.length - 1) + items.length) % items.length]!.focus();
}

function Panel({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="panel" aria-label={label}>
      <button type="button" className="panel-close" onClick={onClose}>
        Close <kbd>Esc</kbd>
      </button>
      <h4>{label}</h4>
      {children}
    </aside>
  );
}

/** Every answer this session, newest first: the path shows only the last few, round its drum. */
export function AnswersPanel({ answers, onOpen, onClose }: { answers: { key: string; id: string; name: string; state: string }[]; onOpen: (id: string) => void; onClose: () => void }) {
  return (
    <Panel label="Your answers" onClose={onClose}>
      <p className="sub">This session, newest first. Open one to see it, or change your answer.</p>
      <ol className="answers">
        {[...answers].reverse().map((a) => (
          <li key={a.key}>
            <button type="button" onClick={() => onOpen(a.id)}>
              <span className="nm">{a.name}</span>
              <span className="st">{a.state}</span>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function KeysPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel label="Keyboard shortcuts" onClose={onClose}>
      <dl>
        <dt>
          <kbd>←</kbd>
          <kbd>→</kbd>
        </dt>
        <dd>Choose an option, then press it again to confirm, once you've seen the agent's pick; on mythic cards, hold to confirm. Hold to lean first.</dd>
        <dt>
          <kbd>↑</kbd>
        </dt>
        <dd>Write an answer</dd>
        <dt>
          <kbd>↓</kbd>
        </dt>
        <dd>Say you can't judge it</dd>
        <dt>
          <kbd>j</kbd>
          <kbd>k</kbd>
        </dt>
        <dd>Next or previous card</dd>
        <dt>
          <kbd>Z</kbd>
        </dt>
        <dd>Undo, for 5 seconds</dd>
        <dt>
          <kbd>Esc</kbd>
        </dt>
        <dd>Back one step</dd>
        <dt>
          <kbd>?</kbd>
        </dt>
        <dd>These shortcuts</dd>
      </dl>
      <p className="sub after">You can also drag the card, or swipe with two fingers.</p>
    </Panel>
  );
}

/**
 * Your calibration, from what can be stood behind (D71): how long you spend by stakes, and the decisions you
 * settled that were later superseded. Practice cards join it when they exist (D83).
 */
export function CalibrationPanel({ spent, superseded, onClose }: { spent: Spent[]; superseded: string[]; onClose: () => void }) {
  const t = timeSpent(spent);
  return (
    <Panel label="Your calibration" onClose={onClose}>
      <p className="sub">Judged by what happened afterwards, not by how often you agreed with the agents.</p>
      <dl>
        <dt>Time spent</dt>
        <dd className="tiers">
          <span>The median on a card, by its stakes:</span>
          <span>
            Mythic and rare: <b>{seconds(t.high)}</b>
          </span>
          <span>
            Uncommon: <b>{seconds(t.uncommon)}</b>
          </span>
          <span>
            Common: <b>{seconds(t.common)}</b>
          </span>
        </dd>
        <dt>Later superseded</dt>
        <dd>
          {superseded.length
            ? `${superseded.map((s) => `“${s}”`).join(", ")}: settled here, then superseded by a later decision.`
            : "None of the decisions you settled here has been superseded."}
        </dd>
      </dl>
      <p className="sub after">Time spent is counted in this browser only.</p>
    </Panel>
  );
}

const PARKED_WORDS: Partial<Record<ApiCard["status"], string>> = { rerouted: "You said it's outside your expertise.", deferred: "You deferred it." };

/**
 * Nothing to answer: what you did this session, what's been put aside, and a way to hear when there's more. If
 * the browser blocks notifications, it says so in the menu, not here: whoever blocked them meant it.
 */
export function EmptyDesk(p: { recap: string; parked: ApiCard[]; notify: NotifyStatus; onNotify: () => void; onOpen: (id: string) => void }) {
  return (
    <>
      <p className="big">All caught up.</p>
      {p.recap && <p className="recap">{p.recap}</p>}
      {p.parked.length > 0 && (
        <div className="parked">
          <p className="parked-h">Put aside</p>
          {p.parked.map((c) => (
            <button type="button" key={c.meta.id} className="parked-row" onClick={() => p.onOpen(c.meta.id)}>
              <span className="nm">{c.meta.title}</span>
              <span className="st">{PARKED_WORDS[c.status] ?? ""}</span>
              <span className="go">Answer it now</span>
            </button>
          ))}
        </div>
      )}
      {p.notify === "off" && (
        <button type="button" className="ghost" onClick={p.onNotify}>
          Notify me when an agent stops
        </button>
      )}
      {p.notify === "on" && <p className="small">Keep this page open: you'll be notified when an agent stops for you.</p>}
    </>
  );
}
