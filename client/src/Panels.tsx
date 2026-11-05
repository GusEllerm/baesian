import { type ReactNode, useEffect, useRef } from "react";
import type { ApiCard, ApiRemovedCard, ApiRouting, ApiState } from "../../src/api";
import { type Spent, seconds, timeSpent } from "./calibration";
import { agentOf, dayOf } from "./model";
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
export function MoreMenu(p: { open: boolean; notify: NotifyStatus; held: number; touch: boolean; site?: boolean; onOpen: (open: boolean) => void; onPanel: (kind: PanelKind) => void; onNotify: () => void }) {
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
          {/* On the website (M9e): the site's own pages. */}
          {p.site && (
            <>
              <a role="menuitem" href="/" className="menu-link">
                Your projects
              </a>
              <a role="menuitem" href="/account" className="menu-link">
                Your account
              </a>
            </>
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
 * The keys, or on a screen you touch, the gestures (D130, B-yfehp): the same answers, by holding the card and dragging
 * it, or by a tap. The path's sheet is named only where there is one, on a phone.
 */
export function KeysPanel({ touch, phone, onClose }: { touch: boolean; phone: boolean; onClose: () => void }) {
  // B-yfehp: a drag scrolls, a hold lifts the card, and a lifted card is dragged to an answer.
  if (touch) {
    return (
      <Panel label="Gestures" onClose={onClose}>
        <dl>
          <dt>Drag</dt>
          <dd>Scrolls, wherever you touch the card</dd>
          <dt>Hold, then drag</dt>
          <dd>
            Hold the card still until it lifts, and each answer is named at its edge of the screen: left or right for an option, up to write an answer, down to say you can't judge it. Drag the card
            to one and let go when it says to, or let go anywhere else to put it down.
          </dd>
          <dt>Tap</dt>
          <dd>An option, or Other answer or Can't judge at the card's foot, does the same. Then confirm, once you've seen the agent's pick; on mythic cards, press and hold.</dd>
          <dt>Undo</dt>
          <dd>In the note that comes up, for 5 seconds</dd>
          {phone && (
            <>
              <dt>Your path</dt>
              <dd>The bar at the foot of the screen: tap it, or pull it up</dd>
            </>
          )}
        </dl>
        <p className="sub after">The setup survey's examples and a deck's briefing are held and dragged the same way.</p>
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
export function HeldPanel({ held, gone = [], mode, onOpen, onClose }: { held: ApiCard[]; gone?: ApiRemovedCard[]; mode: ApiRouting["settings"]["mode"]; onOpen: (id: string) => void; onClose: () => void }) {
  return (
    <Panel label="Held back" onClose={onClose} id="held-panel">
      <p className="sub">
        {held.length
          ? "Your settings held these back, and their agents went ahead. Any can be answered: you choose first, then see what was done."
          : gone.length
            ? "Nothing held back is waiting to be answered."
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
      {/* Held back, never answered, and past 90 days (B-ec3kj, M9f): the service keeps only when and at what level. */}
      {gone.length > 0 && (
        <>
          <p className="sub held-gone-h">
            {gone.length === 1 ? "One more was" : `${gone.length} more were`} held back over 90 days ago and never answered, so the service removed {gone.length === 1 ? "its" : "their"} text. Your repo's record keeps {gone.length === 1 ? "it" : "them"}.
          </p>
          <ul className="held-list held-gone">
            {gone.map((r) => (
              <li key={r.id} className="parked-row">
                <span className="nm">Held back {dayOf(r.settled)}</span>
                <span className="st">
                  {r.level[0]!.toUpperCase() + r.level.slice(1)}; its text was removed {dayOf(r.removed)}.
                </span>
              </li>
            ))}
          </ul>
        </>
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

/** A card ID in text from the vault (P17 §8). */
const CARD_ID = /\bB-[0-9a-hjkmnp-tv-z]{5}\b/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Text from the vault with the cards the client knows as links to them (P17 §8), each named by its title, never by its
 * ID (D69), which is the link's tooltip. A decision note's summary already starts with its card's title ("Title: answer
 * (B-7f3kq)."), so there the title becomes the link and the bracketed ID goes. An ID the client doesn't know stays as
 * written: there's no title to name it by.
 */
function withCardLinks(text: string, titleOf: (id: string) => string | undefined, onOpen: (id: string) => void): ReactNode[] {
  const named = new Map<string, string>();
  let t = text;
  for (const id of new Set(text.match(CARD_ID))) {
    const title = titleOf(id);
    if (!title || !t.includes(title)) continue;
    named.set(title, id);
    t = t.replace(new RegExp(`\\s*\\(${id}\\)`, "g"), "");
  }
  const link = (id: string, title: string, key: number) => (
    <button type="button" key={key} className="card-link" title={id} onClick={() => onOpen(id)}>
      {title}
    </button>
  );
  const out: ReactNode[] = [];
  let at = 0;
  const pattern = new RegExp([...[...named.keys()].map(escape), CARD_ID.source].join("|"), "g");
  for (const m of t.matchAll(pattern)) {
    const id = named.get(m[0]) ?? m[0];
    const title = named.has(m[0]) ? m[0] : titleOf(m[0]);
    if (!title) continue;
    out.push(t.slice(at, m.index), link(id, title, m.index));
    at = m.index + m[0].length;
  }
  out.push(t.slice(at));
  return out;
}

/**
 * The work a card belongs to: its deck's briefing, then the vault notes the deck links to, each with its summary line
 * (M6, P17 §8). Without a vault the links are plain text; with one, a note that isn't there says so.
 */
export function DeckPanel(p: { deck: ApiState["decks"][number]; titleOf: (id: string) => string | undefined; onOpen: (id: string) => void; onClose: () => void }) {
  const { deck } = p;
  return (
    <Panel label={deck.meta.title} onClose={p.onClose} id="deck-panel">
      <p className="sub">The briefing for this work.</p>
      {!deck.body.trim() && <p className="sub">It has no briefing.</p>}
      <DeckBriefing deck={deck} titleOf={p.titleOf} onOpen={p.onOpen} />
    </Panel>
  );
}

/** A deck's briefing and its context notes, each with its summary line: in its panel, and on its briefing card. */
export function DeckBriefing(p: { deck: ApiState["decks"][number]; titleOf: (id: string) => string | undefined; onOpen: (id: string) => void }) {
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
                {n.summary && <span className="note-summary">{withCardLinks(n.summary, p.titleOf, p.onOpen)}</span>}
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
