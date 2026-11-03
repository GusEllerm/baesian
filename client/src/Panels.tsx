import { type ReactNode, useEffect, useRef } from "react";
import type { ApiCard, ApiState } from "../../src/api";
import { type Spent, seconds, timeSpent } from "./calibration";
import type { NotifyStatus } from "./notify";
import { Prose } from "./Prose";

// M4 step 5e: the menu in the header, its two panels (your calibration, and the keys), and the empty desk.
// Round 5's, ported: design/explorations/round5/app.js (renderKeys, renderMirror, the menu, next()). M6 adds the
// deck's panel, opened from the breadcrumbs: its briefing, and its context notes from the vault.

export type PanelKind = "calibration" | "keys" | "deck";

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

function Panel({ label, onClose, children, id }: { label: string; onClose: () => void; children: ReactNode; id?: string }) {
  return (
    <aside className="panel" aria-label={label} {...(id ? { id } : {})}>
      <button type="button" className="panel-close" onClick={onClose}>
        Close <kbd>Esc</kbd>
      </button>
      <h4>{label}</h4>
      {children}
    </aside>
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

/** A card ID in text from the vault, which becomes a link to its card (P17 §8). */
const CARD_ID = /\b(B-[0-9a-hjkmnp-tv-z]{5})\b/;

/** Text with the IDs of cards the client knows as links to them. */
function withCardLinks(text: string, known: (id: string) => boolean, onOpen: (id: string) => void): ReactNode[] {
  return text.split(CARD_ID).map((part, i) =>
    i % 2 === 1 && known(part) ? (
      <button type="button" key={i} className="card-link" onClick={() => onOpen(part)}>
        {part}
      </button>
    ) : (
      part
    ),
  );
}

/**
 * The work a card belongs to: its deck's briefing, then the vault notes the deck links to, each with its summary line
 * (M6, P17 §8). Without a vault the links are plain text; with one, a note that isn't there says so.
 */
export function DeckPanel(p: { deck: ApiState["decks"][number]; known: (id: string) => boolean; onOpen: (id: string) => void; onClose: () => void }) {
  const { deck } = p;
  return (
    <Panel label={deck.meta.title} onClose={p.onClose} id="deck-panel">
      <p className="sub">The briefing for this work.</p>
      {!deck.body.trim() && <p className="sub">It has no briefing.</p>}
      <DeckBriefing deck={deck} known={p.known} onOpen={p.onOpen} />
    </Panel>
  );
}

/** A deck's briefing and its context notes, each with its summary line: in its panel, and on its briefing card. */
export function DeckBriefing(p: { deck: ApiState["decks"][number]; known: (id: string) => boolean; onOpen: (id: string) => void }) {
  const { deck } = p;
  return (
    <>
      {deck.body.trim() && (
        <div className="briefing">
          <Prose text={deck.body} />
        </div>
      )}
      {deck.notes.length > 0 && (
        <div className="context-notes">
          <h5>Context</h5>
          <ul>
            {deck.notes.map((n) => (
              <li key={n.link} title={n.path}>
                <b>{n.text}</b>
                {n.summary && <span className="note-summary">{withCardLinks(n.summary, p.known, p.onOpen)}</span>}
                {n.missing && <span className="missing">Not in the vault.</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Whether a deck gets a briefing card before its first card (B-j6b75): it has a briefing or context notes, and
 * isn't a branch's default deck, whose briefing is one generated line (D29).
 */
export const hasBriefing = (deck: ApiState["decks"][number] | undefined): deck is ApiState["decks"][number] =>
  !!deck && !deck.meta.id.startsWith("branch-") && (deck.body.trim() !== "" || deck.notes.length > 0);

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
