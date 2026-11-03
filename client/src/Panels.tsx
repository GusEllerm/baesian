import { type ReactNode, useEffect, useRef } from "react";
import type { ApiCard, ApiRouting, ApiState } from "../../src/api";
import { type Spent, seconds, timeSpent } from "./calibration";
import { agentOf } from "./model";
import type { NotifyStatus } from "./notify";
import { ROWS, ROW_NAMES, POSITION_NAMES, type Position, blindWords, reportLines, rowInSentence } from "./prefs";
import { Prose } from "./Prose";

// M4 step 5e: the menu in the header, its two panels (your calibration, and the keys), and the empty desk.
// Round 5's, ported: design/explorations/round5/app.js (renderKeys, renderMirror, the menu, next()). M6 adds the
// deck's panel, opened from the breadcrumbs: its briefing, and its context notes from the vault. M8b adds the held-back
// list, the record row by row beside your calibration, and your preferences (Preferences.tsx).

/** "path" is the path's sheet, on a phone (D130): it opens and closes as a panel does. */
export type PanelKind = "calibration" | "keys" | "deck" | "held" | "preferences" | "path";

const NOTIFY_WORDS: Record<NotifyStatus, string> = { on: "on", off: "off", blocked: "blocked", unsupported: "" };

/** "More": the panels, and notifications. It closes on Esc, on a click elsewhere, and once you've picked. */
export function MoreMenu(p: { open: boolean; notify: NotifyStatus; held: number; touch: boolean; onOpen: (open: boolean) => void; onPanel: (kind: PanelKind) => void; onNotify: () => void }) {
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
          <button type="button" role="menuitem" onClick={pick(() => p.onPanel("preferences"))}>
            Your preferences
          </button>
          <button type="button" role="menuitem" onClick={pick(() => p.onPanel("held"))}>
            Held back <span className="state">{p.held || "none"}</span>
          </button>
          <button type="button" role="menuitem" onClick={pick(() => p.onPanel("keys"))}>
            {p.touch ? (
              "Gestures"
            ) : (
              <>
                Keyboard shortcuts <kbd>?</kbd>
              </>
            )}
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

export function Panel({ label, onClose, children, id, wide }: { label: string; onClose: () => void; children: ReactNode; id?: string; wide?: boolean }) {
  return (
    <aside className={wide ? "panel wide" : "panel"} aria-label={label} {...(id ? { id } : {})}>
      <button type="button" className="panel-close" onClick={onClose}>
        Close <kbd>Esc</kbd>
      </button>
      <h4>{label}</h4>
      {children}
    </aside>
  );
}

/**
 * The keys, or on a screen you touch, the gestures (D130): the same answers, by swipe and tap. The path's sheet is
 * named only where there is one, on a phone.
 */
export function KeysPanel({ touch, phone, onClose }: { touch: boolean; phone: boolean; onClose: () => void }) {
  if (touch) {
    return (
      <Panel label="Gestures" onClose={onClose}>
        <dl>
          <dt>Swipe ← →</dt>
          <dd>Choose an option, or tap it. Then confirm, once you've seen the agent's pick; on mythic cards, press and hold.</dd>
          <dt>Swipe ↑</dt>
          <dd>Write an answer</dd>
          <dt>Swipe ↓</dt>
          <dd>Say you can't judge it</dd>
          <dt>Undo</dt>
          <dd>In the note that comes up, for 5 seconds</dd>
          {phone && (
            <>
              <dt>Your path</dt>
              <dd>The bar at the foot of the screen: tap it, or pull it up</dd>
            </>
          )}
        </dl>
        <p className="sub after">On a card longer than the screen, swiping up or down scrolls it; Other answer and Can't judge, at the card's foot, do the same as those swipes.</p>
      </Panel>
    );
  }
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
export function CalibrationPanel({ spent, superseded, routing, onClose }: { spent: Spent[]; superseded: string[]; routing: ApiRouting; onClose: () => void }) {
  const t = timeSpent(spent);
  return (
    <Panel label="Your calibration" onClose={onClose} wide>
      <div className="panel-cols">
        <section>
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
        </section>
        <RowRecord routing={routing} />
      </div>
    </Panel>
  );
}

/**
 * What your settings did, row by row (P14 section 3), beside your calibration: pooled first, then each row, with what
 * reached you and what was held back, the audits, and the misses with their upper bound (B-87tkc). From the record.
 */
export function RowRecord({ routing }: { routing: ApiRouting }) {
  const r = routing.report;
  const rows = Object.keys(r.rows).sort((a, b) => order(a) - order(b));
  const blind = blindWords(r.pooled);
  return (
    <section className="record" aria-labelledby="record-h">
      <h5 id="record-h">What reached you, row by row</h5>
      <p className="sub">
        {routing.settings.mode === "shadow" ? "In shadow, nothing is held back: “would have been held back” is what your settings would hold." : "Holding back is on."} A miss is an
        answer that overturned the agent, or “you should have asked me”.
      </p>
      <dl>
        <dt>All rows</dt>
        <dd className="lines">
          {reportLines(r.pooled).map((l) => (
            <span key={l}>{l}</span>
          ))}
          {blind && <span>{blind}</span>}
        </dd>
        {rows.map((row) => (
          <RowLines key={row} row={row} report={r.rows[row]!} />
        ))}
      </dl>
      {r.beforeGate > 0 && <p className="sub after">{r.beforeGate === 1 ? "One card was" : `${r.beforeGate} cards were`} filed before this record began, and count as reaching you.</p>}
    </section>
  );
}

const order = (row: string) => {
  const i = (ROWS as readonly string[]).indexOf(row);
  return i < 0 ? ROWS.length + row.charCodeAt(0) : i;
};

function RowLines({ row, report }: { row: string; report: ApiRouting["report"]["rows"][string] }) {
  return (
    <>
      <dt>
        {(ROW_NAMES as Record<string, string>)[row] ?? row}
        {report.position && <span className="pos">{POSITION_NAMES[report.position as Position]}</span>}
      </dt>
      <dd className="lines">
        {reportLines(report).map((l) => (
          <span key={l}>{l}</span>
        ))}
      </dd>
    </>
  );
}

/**
 * The cards your settings held back, whose agents went ahead (D150): any of them opens on the desk, to answer blind
 * first, like an audit (D151). Newest first.
 */
export function HeldPanel({ held, mode, onOpen, onClose }: { held: ApiCard[]; mode: ApiRouting["settings"]["mode"]; onOpen: (id: string) => void; onClose: () => void }) {
  return (
    <Panel label="Held back" onClose={onClose} id="held-panel">
      <p className="sub">
        {held.length
          ? "Your settings held these back, and their agents went ahead. Any can be answered: you choose first, then see what was done."
          : mode === "shadow"
            ? "Nothing is held back: in shadow, every card reaches you."
            : "Nothing is held back."}
      </p>
      {held.length > 0 && (
        <div className="held-list">
          {held.map((c) => (
            <HeldRow key={c.meta.id} card={c} onOpen={onOpen} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function HeldRow({ card, onOpen }: { card: ApiCard; onOpen: (id: string) => void }) {
  const row = card.gate ? rowInSentence(card.gate.row) : "";
  return (
    <button type="button" className="parked-row" onClick={() => onOpen(card.meta.id)}>
      <span className="nm">{card.meta.title}</span>
      <span className="st">
        {agentOf(card)} went ahead{row ? `, on ${row}` : ""}.
      </span>
      <span className="go">Answer it</span>
    </button>
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
/** The held-back cards the empty desk lists itself; the rest are in the menu's list. */
const HELD_ON_DESK = 4;

export function EmptyDesk(p: { recap: string; parked: ApiCard[]; held: ApiCard[]; notify: NotifyStatus; onNotify: () => void; onOpen: (id: string) => void; onAllHeld: () => void }) {
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
      {/* Held back (D150): their agents went ahead, and any can be answered after all. */}
      {p.held.length > 0 && (
        <div className="parked">
          <p className="parked-h">Held back</p>
          {p.held.slice(0, HELD_ON_DESK).map((c) => (
            <HeldRow key={c.meta.id} card={c} onOpen={p.onOpen} />
          ))}
          {p.held.length > HELD_ON_DESK && (
            <button type="button" className="more-held" onClick={p.onAllHeld}>
              All {p.held.length} held back
            </button>
          )}
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
