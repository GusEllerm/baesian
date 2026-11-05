import { type CSSProperties, Fragment, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ApiCard } from "../../src/api";
import { type BCard, type BranchesState, CHILD_Y, type Commit, FORK_Y, type Lane, type Live, MARK_Y, type Merge, type Model, type Row, SOURCE_Y, type Stroke, TARGET_Y, branchModel, columnsOf, dayKey, daysOf, endWords, linkedKeys, listRows, openingKey, plural, saidOf, statusOf, strokesOf } from "./lanes";

/** What a merge brought, in words: its cards, and the commits citing cards that came with it (B-w41p7). */
const broughtWords = (m: { cards: string[]; commits?: string[] | undefined }) => {
  const commits = m.commits?.length ?? 0;
  if (!m.cards.length && commits) return `${plural(commits, "commit")} citing cards`;
  return `${plural(m.cards.length, "card")}${commits ? ` and ${plural(commits, "commit")} citing cards` : ""}`;
};

// D181, redrawn: "Your decisions, by branch" as a list, newest first, a row per card, merge, branch start, commit and
// day, with each branch a line in a gutter of fixed columns beside the rows (B-tgq5p). On a computer it's a drawer from
// the right (B-v8jzy): the Branches button in the header, the menu's item, or the B key opens it; the desk moves aside and
// stays whole under a faint veil; Wider puts each row on one line; a handle drags it, or takes the arrow keys. On a phone
// the same list fills the screen. Picking a card lights the commits that cite it, and lists them (B-vfdhz): no lines are
// drawn from commits to cards. The same on the local desk and the website: both serve the state it's drawn from.

const dayW = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const hm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const when = (t: number) => `${dayW(t)}, ${hm(t)}`;
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The drawer's widths, in px: its narrowest, where it opens, where rows go onto one line, and Wider's. */
const MIN_W = 440;
const NARROW_W = 480;
const WIDE_AT = 680;
const maxW = (vw: number) => Math.max(MIN_W, Math.min(960, vw - 520));
const wideW = (vw: number) => Math.min(880, vw - 560);
/** Below this, the desk beside the drawer folds its path away, so the card stays whole. */
const DESK_ROOM = 900;
const WIDTH_KEY = "baesian:drawer-width";
/** The one row detail open at a time, which the row that opened it names (`aria-controls`). */
const DETAIL_ID = "br-detail";

const FILTERS: [key: string, label: string, test: (c: BCard) => boolean][] = [
  ["all", "Every card", () => true],
  ["against", "You chose otherwise", (c) => c.state === "against"],
  ["waiting", "Waiting for you", (c) => c.forYou],
  ["hard", "Hard", (c) => c.hard],
  ["gone", "Withdrawn", (c) => c.state === "gone"],
];

/** A card's state in a row's few words: coloured by its mark, never by colour alone. */
function stateWords(c: ApiCard, st: BCard["state"]): string {
  switch (c.status) {
    case "returned":
      return "Returned to its agent";
    case "rerouted":
      return "Passed on";
    case "superseded":
      return "Superseded";
    case "deferred":
      return "Deferred: settled at merge";
    case "held":
      return "Held back: settled at merge";
    default:
      return { with: "Agent's pick", against: "You chose otherwise", waiting: "Waiting for you", aside: "Held back: settled at merge", gone: "Withdrawn" }[st];
  }
}

function useWindowWidth(): number {
  return useSyncExternalStore(
    (changed) => {
      addEventListener("resize", changed);
      return () => removeEventListener("resize", changed);
    },
    () => innerWidth,
  );
}

const readWidth = () => {
  try {
    return Number(localStorage.getItem(WIDTH_KEY)) || NARROW_W;
  } catch {
    return NARROW_W;
  }
};
const saveWidth = (w: number) => {
  try {
    localStorage.setItem(WIDTH_KEY, String(w));
  } catch {
    // A browser that keeps nothing opens it at 480 px next time.
  }
};

// ------------------------------------------------------------------------------------------------ marks, drawn one way

export function CardMark({ c }: { c: { state: BCard["state"]; hard: boolean } }) {
  const r = c.hard;
  return (
    <>
      {r && <circle r={9.6} className="m-hard" />}
      {c.state === "with" && <circle r={r ? 5.6 : 6.5} className="m-with" />}
      {c.state === "against" && <rect x={-5.4} y={-5.4} width={10.8} height={10.8} transform="rotate(45)" className="m-against" />}
      {c.state === "waiting" && <circle r={r ? 5 : 5.8} className="m-waiting" />}
      {c.state === "aside" && (
        <>
          <circle r={r ? 5.6 : 6.3} className="m-aside" />
          <line x1={-1.7} x2={-1.7} y1={-2.6} y2={2.6} className="m-aside-bar" />
          <line x1={1.7} x2={1.7} y1={-2.6} y2={2.6} className="m-aside-bar" />
        </>
      )}
      {c.state === "gone" && <circle r={r ? 5 : 5.6} className="m-gone" />}
    </>
  );
}
const arrowUp = (x: number, y: number) => <path d={`M${x - 5.5},${y + 5} L${x},${y - 4} L${x + 5.5},${y + 5} Z`} className="m-merge" />;
const arrowRight = (x: number, y: number) => <path d={`M${x - 8},${y - 5.5} L${x + 1},${y} L${x - 8},${y + 5.5} Z`} className="m-merge" />;
/** A mark in a line of text. */
const Sw = ({ children, w = 26, h = 22 }: { children: ReactNode; w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden="true">
    {children}
  </svg>
);

// ------------------------------------------------------------------------------------------------ the drawer

export interface DrawerProps {
  state: BranchesState;
  nowMs: number;
  open: boolean;
  /** A phone (PHONE): the list fills the screen. A screen you touch (TOUCH): no key hints. */
  phone: boolean;
  touch: boolean;
  onClose: () => void;
  /** "Open it on the desk": the drawer closes, and the card is on the desk. */
  onOpenCard: (id: string) => void;
}

export function BranchesDrawer(p: DrawerProps) {
  const vw = useWindowWidth();
  const [stored, setStored] = useState(readWidth);
  const width = Math.round(Math.max(MIN_W, Math.min(maxW(vw), stored)));
  const wide = !p.phone && width >= WIDE_AT;
  const [resizing, setResizing] = useState(false);
  // Its content is built the first time it opens, and kept: what you'd opened is there when you come back.
  const [built, setBuilt] = useState(p.open);
  if (p.open && !built) setBuilt(true);

  // The desk moves aside by the drawer's width, and keeps its card whole: a narrow desk folds its path away.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--dw", p.phone ? "100vw" : `${width}px`);
    document.body.classList.toggle("drawer-open", p.open);
    document.body.classList.toggle("drawer-squeeze", p.open && !p.phone && vw - width < DESK_ROOM);
    document.body.classList.toggle("drawer-resizing", resizing);
  }, [p.open, p.phone, width, vw, resizing]);
  useLayoutEffect(
    () => () => {
      document.body.classList.remove("drawer-open", "drawer-squeeze", "drawer-resizing");
    },
    [],
  );

  // Focus goes in to the list's tab stop as it opens, and back to what opened it as it closes.
  const opener = useRef<HTMLElement | null>(null);
  const toDesk = useRef(false);
  const drawer = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  // What last had focus outside it: a menu item picked has gone by the time the drawer opens.
  const lastFocus = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const seen = (e: FocusEvent) => {
      if (e.target instanceof Element && !e.target.closest(".drawer")) lastFocus.current = e.target;
    };
    addEventListener("focusin", seen);
    return () => removeEventListener("focusin", seen);
  }, []);
  useLayoutEffect(() => {
    if (p.open && !wasOpen.current) {
      const a = document.activeElement && document.activeElement !== document.body ? document.activeElement : lastFocus.current;
      // From the menu, focus goes back to "More": the item it was picked from is gone.
      opener.current = a instanceof HTMLElement ? (a.closest(".menu") ? document.querySelector<HTMLElement>(".menu-btn") : a) : null;
      toDesk.current = false;
      requestAnimationFrame(() => {
        const t = drawer.current?.querySelector<HTMLElement>(".br-list [tabindex='0']") ?? drawer.current?.querySelector<HTMLElement>(".drawer-close");
        t?.focus({ preventScroll: true });
        const box = drawer.current?.querySelector(".drawer-scroll")?.getBoundingClientRect();
        const r = t?.getBoundingClientRect();
        if (t && box && r && (r.top < box.top || r.bottom > box.bottom)) t.scrollIntoView({ block: "center" });
      });
    } else if (!p.open && wasOpen.current && !toDesk.current) {
      const back = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(".bar-btn.branches");
      back?.focus({ preventScroll: true });
    }
    wasOpen.current = p.open;
  }, [p.open]);

  const setWidth = (w: number, save = true) => {
    const n = Math.round(Math.max(MIN_W, Math.min(maxW(vw), w)));
    setStored(n);
    if (save) saveWidth(n);
  };
  const grip = useRef<HTMLDivElement>(null);
  const onGripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    grip.current?.setPointerCapture(e.pointerId);
    setResizing(true);
  };
  const onGripMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (resizing) setWidth(innerWidth - e.clientX, false);
  };
  const onGripUp = () => {
    if (!resizing) return;
    setResizing(false);
    saveWidth(width);
  };
  const onGripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 160 : 40;
    const to = ({ ArrowLeft: width + step, ArrowRight: width - step, Home: MIN_W, End: maxW(vw) } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setWidth(to);
  };
  const [said, setSaid] = useState("");
  const say = useCallback((s: string) => {
    setSaid("");
    requestAnimationFrame(() => setSaid(s));
  }, []);
  const toggleWide = () => {
    setWidth(wide ? NARROW_W : wideW(vw));
    say(wide ? "Narrower." : "Wider: a row's time, title and what you chose on one line.");
  };

  return (
    <>
      <div className="drawer-veil" aria-hidden="true" onClick={p.onClose} />
      <aside ref={drawer} className={`drawer${wide ? " wide" : ""}`} id="branches-drawer" role="dialog" aria-modal={p.open ? "true" : undefined} aria-labelledby="drawer-h" aria-describedby="drawer-status" inert={!p.open}>
        {!p.phone && (
          <div
            ref={grip}
            className="drawer-grip"
            role="separator"
            aria-orientation="vertical"
            aria-controls="branches-drawer"
            aria-label="The drawer's width: drag, or use the left and right arrow keys"
            aria-valuemin={MIN_W}
            aria-valuemax={maxW(vw)}
            aria-valuenow={width}
            aria-valuetext={`${width} pixels${wide ? ", wide: one line a row" : ""}`}
            tabIndex={0}
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onKeyDown={onGripKey}
            onDoubleClick={toggleWide}
          />
        )}
        <div className="drawer-head">
          <h2 id="drawer-h">Your decisions, by branch</h2>
          {!p.phone && (
            <button type="button" className="drawer-wider" aria-pressed={wide} disabled={!wide && wideW(vw) < WIDE_AT} onClick={toggleWide}>
              <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
                <path d="M1 6h16M5 2 1 6l4 4M13 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Wider
            </button>
          )}
          <button type="button" className="panel-close drawer-close" aria-keyshortcuts="Escape" onClick={p.onClose}>
            Close <kbd aria-hidden="true">Esc</kbd>
          </button>
        </div>
        <div className="drawer-scroll">
          {built && (
            <History
              {...p}
              wide={wide}
              say={say}
              onOpenCard={(id) => {
                toDesk.current = true;
                p.onOpenCard(id);
              }}
            />
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </aside>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ the history

type View = { from: string; key: string } | null;

/**
 * A row's room above it as it scrolls into view: its day's sticky header, as tall as it is now (on a narrow phone its
 * counts wrap to a second line, IF-13), and a little more. Rows outside a day (the Now row's) keep the stylesheet's.
 */
function fitMargin(el: HTMLElement) {
  const head = el.closest(".br-day")?.querySelector(".br-row.is-day");
  if (head) el.style.scrollMarginTop = `${Math.ceil(head.getBoundingClientRect().height) + 11}px`;
}

function History(p: DrawerProps & { wide: boolean; say: (s: string) => void }) {
  // Built again when the state changes, and once a minute: what's idle, and the "Now" row, don't need the clock finer.
  const minute = Math.floor(p.nowMs / 60_000);
  const model = useMemo(() => branchModel(p.state, { nowMs: p.nowMs }), [p.state.cards, p.state.commits, p.state.merges, p.state.defaultBranch, minute]);
  const columns = useMemo(() => columnsOf(model), [model]);
  const first = useMemo(() => openingKey(model), []);
  const firstWaiting = !!first && !!model.cardById.get(first.slice(5))?.forYou;

  const [filter, setFilter] = useState("all");
  const [commits, setCommits] = useState(false);
  const days = useMemo(() => daysOf(model, { commits }), [model, commits]);
  // A card waiting for you is open as the drawer first opens; its day, or the latest card's, is unfolded.
  const [sel, setSel] = useState<string | null>(firstWaiting ? first : null);
  const [view, setView] = useState<View>(null);
  const [tab, setTab] = useState<string | null>(first);
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set(first ? [dayKey(model.cardById.get(first.slice(5))!.t)] : []));
  const [moreOf, setMoreOf] = useState<Set<string>>(new Set());
  const list = useRef<HTMLOListElement>(null);
  /**
   * After the next render: focus a row, or a control in its detail (`inner`: what took the place of the one pressed), and
   * bring it (and its detail) into view; or go to a day (`day`): its first row takes the tab stop and focus, and the day
   * starts at the top of the list.
   */
  const after = useRef<{ key?: string; day?: string; inner?: string; focus: boolean; scroll: boolean } | null>(firstWaiting && first ? { key: first, focus: false, scroll: true } : null);

  const test = FILTERS.find((f) => f[0] === filter)![2];
  const P = useMemo(() => listRows(model, columns, { commits, filter: filter === "all" ? undefined : test, open: openDays }), [model, columns, commits, filter, openDays]);
  const lit = useMemo(() => new Set(linkedKeys(model, sel)), [model, sel]);
  const L = (name: string) => model.lanes.get(name)!;
  const sn = (name: string) => model.short.get(name) ?? name;

  // The rows you can reach with the arrow keys, in order; one of them holds the tab stop.
  const keys: string[] = [];
  for (const r of P.rows) {
    if (r.kind === "now") {
      if (r.tags.length || model.trunk) keys.push(...r.tags.map((n) => `lane:${n}`));
    } else if (r.kind === "fold" || r.kind === "more") keys.push(r.key);
    else if (r.kind === "end") keys.push(`lane:${r.lane}`);
    else if (r.kind === "event" && r.e.kind !== "fork") keys.push(r.key);
  }
  const tabKey = tab && keys.includes(tab) ? tab : (keys.find((k) => k.startsWith("card:")) ?? keys[0]);

  useLayoutEffect(() => {
    const a = after.current;
    if (!a || !list.current) return;
    after.current = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (a.day) {
      // The day's group, not its header: a sticky header above the view sits at the bottom of its group (IF-1).
      const group = list.current.querySelector(`.is-day[data-day="${CSS.escape(a.day)}"]`)?.closest<HTMLElement>(".br-day");
      const row = group?.querySelector<HTMLElement>(".br-rb[data-row]");
      if (a.scroll) group?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
      if (row) {
        setTab(row.dataset.row!);
        if (a.focus) row.focus({ preventScroll: true });
      }
      return;
    }
    const b = a.key ? list.current.querySelector<HTMLElement>(`[data-row="${CSS.escape(a.key)}"]`) : null;
    if (!b) return;
    const det = b.closest("li")?.nextElementSibling;
    const inner = a.inner && det?.classList.contains("is-detail") ? det.querySelector<HTMLElement>(a.inner) : null;
    if (inner) inner.focus({ preventScroll: true });
    else if (a.focus) b.focus({ preventScroll: true });
    if (a.scroll) {
      fitMargin(b);
      if (det?.classList.contains("is-detail")) det.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      b.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  });

  /** Open a row's detail, or close it. */
  const select = (key: string | null, o: { focus?: boolean; scroll?: boolean } = {}) => {
    setSel(key);
    setView(null);
    if (key) setTab(key);
    if (key) after.current = { key, focus: o.focus ?? true, scroll: o.scroll ?? true };
  };
  /** Go to a card's own row: its day unfolded, the filter cleared if it hides it. */
  const goCard = (id: string) => {
    const c = model.cardById.get(id);
    if (!c) return;
    setOpenDays((s) => new Set([...s, dayKey(c.t)]));
    if (filter !== "all" && !test(c)) setFilter("all");
    select(`card:${id}`);
  };
  const aboutLane = (name: string) => {
    if (sel?.startsWith("card:") || sel?.startsWith("merge:")) {
      setView({ from: sel, key: `lane:${name}` });
      // Focus goes to what took the button's place: "← Back" (IF-2).
      after.current = { key: sel, inner: ".br-back", focus: false, scroll: true };
      return;
    }
    select(`lane:${name}`);
  };
  const back = () => {
    const from = view?.from;
    setView(null);
    if (from) after.current = { key: from, focus: true, scroll: true };
  };
  const setFilterTo = (k: string) => {
    setFilter(k);
    const n = model.cards.filter(FILTERS.find((f) => f[0] === k)![2]).length;
    p.say(k === "all" ? "Showing every card." : `${plural(n, "card")} match; the rest are folded.`);
  };

  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    const ol = list.current;
    if (!ol) return;
    const btns = [...ol.querySelectorAll<HTMLElement>(".br-rb, .is-now .br-endtag")];
    const cur = e.target as HTMLElement;
    const i = btns.indexOf(cur);
    if (i < 0) return;
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = btns[i + 1];
    else if (e.key === "ArrowUp") next = btns[i - 1];
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const b = cur.dataset.branch;
      const same = btns.filter((x) => b && x.dataset.branch === b);
      next = same[same.indexOf(cur) + (e.key === "ArrowRight" ? 1 : -1)];
      if (!next) p.say(b ? `Nothing ${e.key === "ArrowRight" ? "older" : "newer"} on ${sn(b)} here.` : "This row isn't on a branch.");
    } else if (e.key === "Home") next = btns[0];
    else if (e.key === "End") next = btns.at(-1);
    else if (e.key === "PageDown" || e.key === "PageUp") {
      const heads = [...ol.querySelectorAll<HTMLElement>(".is-day")];
      const mine = heads.filter((d) => d.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
      // Above every day (the Now row) nothing is newer: Page Up stays (IF-10).
      if (!mine && e.key === "PageUp") {
        e.preventDefault();
        return;
      }
      const j = mine ? heads.indexOf(mine) + (e.key === "PageDown" ? 1 : -1) : e.key === "PageDown" ? 0 : -1;
      const d = heads[Math.max(0, Math.min(heads.length - 1, j))];
      next = d ? btns.find((x) => d.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) : undefined;
    } else return;
    e.preventDefault();
    if (!next?.dataset.row) return;
    setTab(next.dataset.row);
    fitMargin(next);
    next.focus();
  };

  // ---------------------------------------------------------------------------------------------- the gutter
  const cols = P.cols + (P.loose ? 1 : 0);
  const PITCH = cols <= 5 ? (p.wide ? 18 : 14) : Math.max(10, Math.floor((p.wide ? 100 : 70) / Math.max(1, cols - 1)));
  const cx = (c: number) => 11 + c * PITCH;
  const gw = cx(Math.max(0, cols - 1)) + 13;
  const MY = MARK_Y;
  const quiet = (name: string, t: number) => {
    const e = L(name).end;
    return e.kind === "trunk" && e.quietSince < t ? "quiet" : undefined;
  };
  const line = (k: string, c: number, y1: number | string, y2: number | string, cls?: string) => <line key={k} x1={cx(c)} x2={cx(c)} y1={y1} y2={y2} className={cls} />;
  const liveLines = (live: Live, t: number, skip: (number | null | undefined)[] = []) => [...live].filter(([c]) => !skip.includes(c)).map(([c, name]) => line(`l${c}`, c, 0, "100%", quiet(name, t)));
  const gutter = (children: ReactNode) => (
    <svg className="br-g" width={gw} aria-hidden="true">
      {children}
    </svg>
  );
  // A fork's dashed curve, from its parent's line to its branch's; a merge's, from its branch's line up into its target's.
  const forkD = (from: number, to: number) => `M${cx(from)},${FORK_Y} C${cx(from)},${FORK_Y - 9} ${cx(to)},${FORK_Y - 9} ${cx(to)},${CHILD_Y}`;
  const mergeD = (from: number, to: number) => `M${cx(from)},${SOURCE_Y} C${cx(from)},${MY + 9} ${cx(to)},${MY + 11} ${cx(to)},${TARGET_Y}`;
  /** A row's strokes (`strokesOf()`), drawn in order; the marks are the row's own to draw. A halo under a curve shows the branch it passes going under (B-tgq5p). */
  const draw = (strokes: Stroke[] | null, t: number) =>
    (strokes ?? []).map((s, i) => {
      if (s.k === "line") return <line key={i} x1={cx(s.col)} x2={cx(s.col)} y1={s.y1} y2={s.y2} className={quiet(s.lane, t)} />;
      if (s.k === "cap") return <line key={i} x1={cx(s.col) - s.half} x2={cx(s.col) + s.half} y1={s.y} y2={s.y} className="cap" />;
      if (s.k === "halo") return <path key={i} d={s.curve === "fork" ? forkD(s.from, s.to) : mergeD(s.from, s.to)} className="halo" />;
      if (s.k === "fork") return <path key={i} d={forkD(s.from, s.to)} className="fork" />;
      if (s.k === "merge")
        return (
          <Fragment key={i}>
            <path d={mergeD(s.from, s.to)} />
            {arrowUp(cx(s.to), MY - 1)}
          </Fragment>
        );
      return null;
    });

  // ---------------------------------------------------------------------------------------------- details
  const commitBtn = (c: Commit, ctx?: BCard) => {
    const what = c.folded ? "the merge's commit" : c.branch === ctx?.branch ? "this branch" : sn(c.branch);
    return (
      <button key={c.hash} type="button" className="br-lnk" onClick={() => (sel ? (setView({ from: sel, key: `commit:${c.hash}` }), (after.current = { key: sel, inner: ".br-back", focus: false, scroll: true })) : select(`commit:${c.hash}`))}>
        <code>{c.short}</code>
        <span>
          {hm(c.t)} · {what}
        </span>
      </button>
    );
  };
  const cardBtn = (id: string, i = 0) => {
    const c = model.cardById.get(id);
    if (!c) return null;
    return (
      <button key={id} type="button" className="br-lnk title" data-more-first={i === 6 || undefined} onClick={() => goCard(id)}>
        <Sw w={20} h={20}>
          <CardMark c={c} />
        </Sw>
        {c.title}
      </button>
    );
  };
  const endOf = (Ln: Lane) => {
    const e = Ln.end;
    if (e.kind === "merged") return `merged into ${sn(e.into)} on ${dayW(Date.parse(e.at))}`;
    if (e.kind === "trunk") return `is the trunk${model.trunkKnown ? ", the repo's default branch" : ""}: everything merges into it`;
    return endWords(Ln).replace(/^No merge recorded/, "has no merge recorded");
  };
  const said = (c: BCard) => {
    const s = saidOf(c.card, p.nowMs);
    return (
      <span className={`br-said ${c.state}`}>
        <Sw w={22} h={22}>
          <CardMark c={c} />
        </Sw>
        <span>{cap1(s.words)}</span>
      </span>
    );
  };
  function detail(key: string): ReactNode {
    const i = key.indexOf(":");
    const kind = key.slice(0, i);
    const id = key.slice(i + 1);
    if (kind === "card") {
      const c = model.cardById.get(id);
      if (!c) return null;
      const by = model.citedBy.get(c.id) ?? [];
      return (
        <>
          {said(c)}
          <span className="br-meta">
            {c.agent} on <b>{c.branch}</b> · filed {when(c.t)} · <code>{c.id}</code> · {c.hard ? "hard" : c.card.meta.level}. The branch {endOf(L(c.branch))}.
          </span>
          {by.length ? (
            <div className="br-links">
              <span className="br-list-h">Cited by {plural(by.length, "commit")}:</span>
              {by.map((x) => commitBtn(x, c))}
            </div>
          ) : (
            <span className="br-meta">No commit cites it yet.</span>
          )}
          <div className="br-acts">
            <button type="button" className="br-btn" onClick={() => p.onOpenCard(c.id)}>
              Open it on the desk
            </button>
            <button type="button" className="br-btn soft" onClick={() => aboutLane(c.branch)}>
              About this branch
            </button>
          </div>
        </>
      );
    }
    if (kind === "commit") {
      const c = model.commitByHash.get(id);
      if (!c) return null;
      const own = model.lanes.get(c.branch);
      return (
        <>
          <h3 className="br-h">
            Commit <code>{c.short}</code>
          </h3>
          <span className="br-said plain">
            <Sw w={16} h={18}>
              <circle r={3.6} className="m-commit" />
            </Sw>
            <span>Cites {plural(c.cards.length, "card")}</span>
          </span>
          <span className="br-meta">
            on <b>{c.branch}</b>
            {own ? "" : ", a branch with no cards of its own and no merge recorded"} · {when(c.t)}
          </span>
          {c.folded && (
            <span className="br-meta">
              Git recorded it as the merge of {sn(c.folded.branch)} into {sn(c.folded.into)}: it's drawn as that merge.
            </span>
          )}
          <div className="br-links">{c.cards.map(cardBtn)}</div>
        </>
      );
    }
    if (kind === "merge") {
      const mg = model.merges.find((m) => m.key === key);
      if (!mg) return null;
      const Ln = L(mg.branch);
      const all = moreOf.has(key);
      // The commits citing cards it brought (B-w41p7), as a card's detail lists those that cite it.
      const brought = (mg.commits ?? []).flatMap((h) => model.commitByHash.get(h) ?? []);
      return (
        <>
          <span className="br-said plain">
            <Sw w={18} h={16}>
              {arrowRight(5, 0)}
            </Sw>
            <span>
              {when(mg.gitT)} · at commit <code>{mg.commit.slice(0, 7)}</code>
            </span>
          </span>
          <span className="br-meta">
            {mg.branch} · {broughtWords(mg)} it brought
            {mg.ends ? "" : `. It ended nothing: ${mg.branch === model.trunk || Ln.end.kind === "trunk" ? `${sn(mg.branch)} is the trunk` : `more happened on ${sn(mg.branch)} after it`}`}
          </span>
          {mg.cards.length > 0 && (
            <div className="br-links">
              {(all ? mg.cards : mg.cards.slice(0, 6)).map((id, i) => cardBtn(id, i))}
              {!all && mg.cards.length > 6 && (
                <button
                  type="button"
                  className="br-lnk"
                  onClick={() => {
                    setMoreOf((s) => new Set([...s, key]));
                    // Focus goes to the first of the cards it showed, which took its place (IF-2).
                    after.current = { key, inner: "[data-more-first]", focus: false, scroll: false };
                  }}
                >
                  and {mg.cards.length - 6} more
                </button>
              )}
            </div>
          )}
          {brought.length > 0 && (
            <div className="br-links">
              <span className="br-list-h">{brought.length === 1 ? "Its commit citing cards:" : `Its ${brought.length} commits citing cards:`}</span>
              {brought.map((c) => commitBtn(c))}
            </div>
          )}
          {mg.own && (
            <span className="br-meta">
              Its commit, <code>{mg.own.short}</code>, cites {plural(mg.own.cards.length, "card")}.
            </span>
          )}
          {mg.ends && Ln.parentWhy === "merged" && (
            <span className="br-note">
              Where {sn(mg.branch)} began isn't recorded: it's drawn, dashed, from {sn(mg.into)}, which it merged into, just before its first card or commit.
            </span>
          )}
          <div className="br-acts">
            <button type="button" className="br-btn soft" onClick={() => aboutLane(mg.branch)}>
              About this branch
            </button>
          </div>
        </>
      );
    }
    if (kind === "lane") return laneDetail(id);
    return null;
  }
  function laneDetail(name: string): ReactNode {
    const Ln = model.lanes.get(name);
    if (!Ln) return null;
    const cs = Ln.cards;
    const n = (st: BCard["state"]) => cs.filter((c) => c.state === st).length;
    const kids = [...model.lanes.values()].filter((o) => o.parent === name).map((o) => o.short);
    const began = Ln.parent
      ? `from ${sn(Ln.parent)}${Ln.parentWhy === "merged" ? ", which it merged into" : ": a guess, nothing records it (the branch busiest before it)"}`
      : name === model.trunk
        ? "it's the trunk"
        : "not known";
    const counts = [n("with") && `the agent's pick on ${n("with")}`, n("against") && `otherwise on ${n("against")}`, n("waiting") && `${n("waiting")} waiting`, n("aside") && `${n("aside")} held back`, n("gone") && `${n("gone")} withdrawn`].filter(Boolean).join(", ");
    return (
      <>
        <h3 className="br-h">
          <span className="br-nm">{name}</span>
        </h3>
        <span className="br-meta">{cap1(endOf(Ln).replace(/^is /, "it's ").replace(/^has /, "it has "))}</span>
        <dl className="br-facts">
          <dt>Cards</dt>
          <dd>{cs.length ? `${cs.length}${counts ? `: ${counts}` : ""}; ${cs.filter((c) => c.hard).length} hard` : "none of its own"}</dd>
          {cs.length > 0 && (
            <>
              <dt>When</dt>
              <dd>
                {when(cs[0]!.t)} to {when(cs.at(-1)!.t)}
              </dd>
            </>
          )}
          <dt>Commits</dt>
          <dd>{Ln.commits.length ? `${plural(Ln.commits.length, "commit")} made on it cite cards` : "none cite cards"}</dd>
          <dt>Began</dt>
          <dd>{began}</dd>
          {kids.length > 0 && (
            <>
              <dt>From it</dt>
              <dd>{kids.join(", ")}</dd>
            </>
          )}
        </dl>
        {sel === `lane:${name}` && (
          <div className="br-acts">
            <button
              type="button"
              className="br-btn soft"
              onClick={() => {
                select(null);
                // Focus goes back to the branch's end, which opened this (IF-2).
                after.current = { key: `lane:${name}`, focus: true, scroll: false };
              }}
            >
              Close this
            </button>
          </div>
        )}
      </>
    );
  }
  const detailRow = (live: Live, t: number, inner: ReactNode, extra?: ReactNode) => (
    <li className="br-row is-detail" id={DETAIL_ID}>
      {gutter(
        <>
          {liveLines(live, t)}
          {extra}
        </>,
      )}
      <div className="br-callout">{inner}</div>
    </li>
  );
  const viewOf = (key: string) =>
    view && view.from === key ? (
      <>
        <button type="button" className="br-btn soft br-back" onClick={back}>
          ← Back
        </button>
        {detail(view.key)}
      </>
    ) : (
      detail(key)
    );

  // ---------------------------------------------------------------------------------------------- rows
  const endTag = (Ln: Lane, inRow = false) => (
    <button
      key={Ln.name}
      type="button"
      className={`br-endtag ${Ln.end.kind === "open" && Ln.end.waiting ? "held" : "ready"}`}
      data-row={`lane:${Ln.name}`}
      data-branch={Ln.name}
      tabIndex={inRow ? (tabKey === `lane:${Ln.name}` ? 0 : -1) : undefined}
      aria-expanded={sel === `lane:${Ln.name}`}
      aria-controls={sel === `lane:${Ln.name}` ? DETAIL_ID : undefined}
      onClick={() => (sel === `lane:${Ln.name}` ? select(null, { scroll: false }) : select(`lane:${Ln.name}`))}
    >
      <span>
        <b>{Ln.short}</b> · {endWords(Ln)}
      </span>
    </button>
  );

  function rowOf(r: Row): ReactNode {
    if (r.kind === "now") {
      if (!r.tags.length && !model.trunk) return null;
      const open = r.tags.find((n) => sel === `lane:${n}`);
      return (
        <>
          <li className="br-row is-now">
            {gutter(draw(strokesOf(r, P, model), r.t))}
            <span className="br-nowh">Now, {hm(model.nowT)}</span>
            {r.tags.length > 0 && <div className="br-tags">{r.tags.map((n) => endTag(L(n), true))}</div>}
          </li>
          {open && detailRow(r.live, r.t, laneDetail(open))}
        </>
      );
    }
    if (r.kind === "fold") {
      const g = draw(strokesOf(r, P, model), r.t);
      const bits = [plural(r.cards, "card") + (r.against ? `, ${r.against} you chose otherwise` : "") + (r.gone ? `, ${r.gone} withdrawn` : "")];
      if (r.began.length) bits.push(`${plural(r.began.length, "branch", "branches")} began${r.merged ? ` and ${r.merged} merged` : ""} (${r.began.slice(0, 3).join(", ")}${r.began.length > 3 ? ", …" : ""})`);
      else if (r.merged) bits.push(`${plural(r.merged, "branch", "branches")} merged`);
      return (
        <li className="br-row is-fold">
          {gutter(g)}
          <button
            type="button"
            className="br-rb"
            data-row={r.key}
            tabIndex={tabKey === r.key ? 0 : -1}
            onClick={() => {
              setOpenDays((s) => new Set([...s, r.dk]));
              // The fold goes as the day opens: its first row takes the tab stop and focus (IF-2).
              after.current = { day: r.dk, focus: true, scroll: false };
            }}
          >
            {bits.join("; ")}. <u>Show the day</u>
          </button>
        </li>
      );
    }
    if (r.kind === "more") {
      return (
        <li className="br-row is-more">
          {gutter(draw(strokesOf(r, P, model), r.t))}
          <button
            type="button"
            className="br-rb"
            data-row={r.key}
            tabIndex={tabKey === r.key ? 0 : -1}
            onClick={() => {
              setFilter("all");
              const k = r.keys[0]!;
              setTab(k);
              after.current = { key: k, focus: true, scroll: true };
            }}
          >
            {[r.cards ? plural(r.cards, "other card") : "", r.commits ? plural(r.commits, "commit") : ""].filter(Boolean).join(", ")}. <u>Show them</u>
          </button>
        </li>
      );
    }
    if (r.kind === "end") {
      const Ln = L(r.lane);
      const k = `lane:${r.lane}`;
      return (
        <>
          <li className="br-row is-end">
            {gutter(draw(strokesOf(r, P, model), r.t))}
            <button type="button" className="br-rb" data-row={k} data-branch={r.lane} tabIndex={tabKey === k ? 0 : -1} aria-expanded={sel === k} aria-controls={sel === k ? DETAIL_ID : undefined} onClick={() => (sel === k ? select(null, { scroll: false }) : select(k))}>
              <span className="br-rs">{Ln.short}</span>
              <span className="br-rm">
                <span className={`st ${Ln.end.kind === "open" && Ln.end.waiting ? "waiting" : "with"}`}>{endWords(Ln)}</span>
              </span>
            </button>
          </li>
          {sel === k && detailRow(r.live, r.t, laneDetail(r.lane), line("own", r.col, 0, "100%"))}
        </>
      );
    }
    if (r.kind !== "event") return null;
    const e = r.e;
    if (e.kind === "fork") {
      return (
        <li className="br-row is-fork">
          {gutter(draw(strokesOf(r, P, model), r.t))}
          <span className="br-tx">
            {L(e.lane).short} began, from {sn(e.from)}
            {e.guess ? " (a guess: nothing records it)" : ""}
          </span>
        </li>
      );
    }
    const isLit = lit.has(e.key);
    const litWords = sel?.startsWith("card:") ? "cites the selected card" : sel?.startsWith("commit:") ? "cited by the selected commit" : "linked to the selected merge";
    let g: ReactNode = null;
    let text: ReactNode = null;
    let label = "";
    let branch: string | undefined;
    if (e.kind === "card") {
      const c = e.card;
      const col = r.col!;
      branch = c.branch;
      g = (
        <>
          {draw(strokesOf(r, P, model), r.t)}
          <g transform={`translate(${cx(col)},${MY})`}>
            {isLit && <circle r={11.5} className="lit-ring" />}
            <CardMark c={c} />
          </g>
        </>
      );
      const n = model.citedBy.get(c.id)?.length ?? 0;
      const words = stateWords(c.card, c.state);
      text = (
        <>
          <span className="br-tm">{hm(c.t)}</span>
          <span className="br-rt">{c.title}</span>
          <span className="br-rm">
            <span className={`st ${c.state}`}>{words}</span> · {sn(c.branch)}
            <span className="br-nar"> · {hm(c.t)}</span>
            {c.hard ? " · hard" : ""}
            {n ? ` · cited by ${plural(n, "commit")}` : ""}
            {isLit && (
              <>
                {" · "}
                <span className="br-lk">↳ {litWords}</span>
              </>
            )}
          </span>
        </>
      );
      label = `${c.title}. ${words}.${c.hard ? " Hard." : ""} ${sn(c.branch)}, ${when(c.t)}.${n ? ` Cited by ${plural(n, "commit")}.` : ""}${isLit ? ` ${cap1(litWords)}.` : ""}`;
    } else if (e.kind === "commit") {
      const c = e.commit;
      branch = c.branch;
      const col = r.col ?? P.cols;
      g = (
        <>
          {draw(strokesOf(r, P, model), r.t)}
          {r.col === null && <path d={`M${cx(col)},${MY} L${cx(col) - 6},${MY + 9}`} className="stub" />}
          <circle cx={cx(col)} cy={MY} r={isLit ? 4.2 : 3.2} className={`m-commit${isLit ? " lit" : ""}`} />
        </>
      );
      const firstCard = model.cardById.get(c.cards[0]!);
      text = (
        <>
          <span className="br-tm">{hm(c.t)}</span>
          <span className="br-rs">
            <code>{c.short}</code> cites “{firstCard?.title ?? c.cards[0]}”{c.cards.length > 1 ? ` and ${plural(c.cards.length - 1, "more card")}` : ""}
          </span>
          <span className="br-rm">
            {r.col === null ? `on ${sn(c.branch)}, no cards of its own` : sn(c.branch)}
            <span className="br-nar"> · {hm(c.t)}</span>
            {isLit && (
              <>
                {" · "}
                <span className="br-lk">↳ {litWords}</span>
              </>
            )}
          </span>
        </>
      );
      label = `Commit ${c.short} on ${sn(c.branch)}, ${when(c.t)}, cites ${plural(c.cards.length, "card")}.${isLit ? ` ${cap1(litWords)}.` : ""}`;
    } else {
      const mg: Merge = e.merge;
      branch = mg.branch;
      g = draw(strokesOf(r, P, model), r.t);
      text = (
        <>
          <span className="br-tm">{hm(mg.gitT)}</span>
          <span className="br-rs">
            {sn(mg.branch)} merged into {sn(mg.into)}
          </span>
          <span className="br-rm">
            <span className="br-nar">{hm(mg.gitT)} · </span>
            {broughtWords(mg)}
            {mg.own ? ` · its commit cites ${plural(mg.own.cards.length, "card")}` : ""}
            {isLit && (
              <>
                {" · "}
                <span className="br-lk">↳ {litWords}</span>
              </>
            )}
          </span>
        </>
      );
      label = `${sn(mg.branch)} merged into ${sn(mg.into)}, ${when(mg.gitT)}, with ${broughtWords(mg)}.${mg.own ? ` Its commit cites ${plural(mg.own.cards.length, "card")}.` : ""}${isLit ? ` ${cap1(litWords)}.` : ""}`;
    }
    const open = sel === e.key;
    return (
      <>
        <li className={`br-row is-${e.kind}${open ? " sel" : ""}${isLit ? " linked" : ""}`}>
          {gutter(g)}
          <button
            type="button"
            className="br-rb"
            data-row={e.key}
            data-branch={branch}
            tabIndex={tabKey === e.key ? 0 : -1}
            aria-expanded={open}
            aria-controls={open ? DETAIL_ID : undefined}
            aria-label={label}
            onClick={() => (open ? (setSel(null), setView(null), setTab(e.key)) : select(e.key))}
          >
            {text}
          </button>
        </li>
        {open && detailRow(r.below, r.t - 1, viewOf(e.key))}
      </>
    );
  }

  // Rows grouped by day, each group with its own sticky header.
  const groups: { head?: Extract<Row, { kind: "day" }>; rows: Row[] }[] = [{ rows: [] }];
  for (const r of P.rows) {
    if (r.kind === "day") groups.push({ head: r, rows: [] });
    else groups.at(-1)!.rows.push(r);
  }
  const st = statusOf(model);
  const waiting = model.cards.filter((c) => c.forYou).sort((a, b) => a.t - b.t);
  const touch = p.touch;

  return (
    <>
      <p className="br-status">
        {/* The dialog's description is the words, not the button beside them (IF-15). */}
        <span id="drawer-status">
          <b>{st.lead}</b> {st.body}
        </span>
        {waiting.length > 0 && (
          <>
            {" "}
            <button type="button" className="br-go" onClick={() => goCard(waiting[0]!.id)}>
              Show the oldest
            </button>
          </>
        )}
      </p>
      <div className="br-controls">
        <div className="br-chips" role="group" aria-label="Show">
          {FILTERS.map(([k, label, f]) => {
            const n = model.cards.filter(f).length;
            return (
              <button key={k} type="button" className="br-chip" aria-pressed={filter === k} disabled={!n && filter !== k} onClick={() => setFilterTo(k)}>
                {k !== "all" && (
                  <Sw w={20} h={20}>
                    <CardMark c={{ state: k === "hard" ? "with" : k === "waiting" ? "waiting" : (k as BCard["state"]), hard: k === "hard" }} />
                  </Sw>
                )}
                {label} <span className="n">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="br-ctl br-fsel">
          Show
          <select value={filter} onChange={(e) => setFilterTo(e.target.value)}>
            {FILTERS.map(([k, label, f]) => {
              const n = model.cards.filter(f).length;
              return (
                <option key={k} value={k} disabled={!n && filter !== k}>
                  {label} · {n}
                </option>
              );
            })}
          </select>
        </label>
        <div className="br-ctl-end">
          <label className="br-ctl">
            Go to
            <select
              // It names no day of its own, so the same day can be picked again (IF-12); the list goes there, its first row
              // focused (IF-8), the day at the top (IF-1).
              value=""
              onChange={(e) => {
                const dk = e.target.value;
                if (!dk) return;
                setOpenDays((s) => new Set([...s, dk]));
                after.current = { day: dk, focus: true, scroll: true };
              }}
            >
              <option value="" disabled hidden>
                a day
              </option>
              {[...days].reverse().map((d) => (
                <option key={d.key} value={d.key}>
                  {dayW(d.t)} · {plural(d.cards, "card")}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="br-switch" role="switch" aria-checked={commits} onClick={() => setCommits((v) => !v)}>
            <span className="box" />
            Commits
          </button>
        </div>
      </div>
      <details className="br-key">
        <summary>What the marks mean</summary>
        <div className="br-key-grid">
          {(
            [
              [<CardMark key="k" c={{ state: "with", hard: false }} />, "You chose the agent's pick"],
              [<CardMark key="k" c={{ state: "against", hard: false }} />, "You chose otherwise"],
              [<CardMark key="k" c={{ state: "waiting", hard: false }} />, "Waiting for you"],
              [<CardMark key="k" c={{ state: "aside", hard: false }} />, <>Held back or deferred <span className="fine">(settled at merge)</span></>],
              [<CardMark key="k" c={{ state: "gone", hard: false }} />, "Withdrawn by its agent"],
              [<CardMark key="k" c={{ state: "with", hard: true }} />, <>A hard card <span className="fine">(the outer ring)</span></>],
              [
                <>
                  <line x1={0} x2={0} y1={-11} y2={11} className="key-line" />
                  <circle r={3.2} className="m-commit" />
                </>,
                <>A commit citing cards <span className="fine">(the Commits switch shows them; pick a card: which)</span></>,
              ],
              [
                <>
                  <path d="M6,11 C6,4 -6,4 -6,-4" className="key-curve" />
                  {arrowUp(-6, -6)}
                </>,
                <>A merge <span className="fine">(recorded)</span></>,
              ],
              [<path key="k" d="M-6,11 C-6,2 6,2 6,-9" className="key-curve fork" />, <>Where a branch began <span className="fine">(not recorded: placed just before its first event)</span></>],
            ] as [ReactNode, ReactNode][]
          ).map(([g, t], i) => (
            <div key={i}>
              <Sw w={28} h={24}>
                {g}
              </Sw>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </details>
      {!touch && (
        <p className="drawer-keys">
          <kbd>↑</kbd>
          <kbd>↓</kbd> rows · <kbd>←</kbd>
          <kbd>→</kbd> along a branch · <kbd>PgUp</kbd>
          <kbd>PgDn</kbd> days · <kbd>Enter</kbd> opens
        </p>
      )}
      {model.lanes.size === 0 ? (
        <p className="br-empty">No branches yet: a branch appears here once an agent files a card on it.</p>
      ) : (
        <ol className="br-list" ref={list} aria-label="Your decisions by branch, newest first" style={{ "--pad": `${gw + 4}px` } as CSSProperties} onKeyDown={onKey}>
          {groups.map((grp, gi) =>
            grp.head ? (
              <li key={grp.head.key} className="br-day" aria-label={dayW(grp.head.t)}>
                <ol className="br-dayrows">
                  <li className="br-row is-day" data-day={grp.head.dk}>
                    {gutter(liveLines(grp.head.live, grp.head.t))}
                    <h3>
                      {dayW(grp.head.t)}{" "}
                      <span>
                        {[plural(grp.head.cards, "card"), grp.head.waiting ? `${grp.head.waiting} waiting` : "", grp.head.against ? `${grp.head.against} otherwise` : "", grp.head.merges ? plural(grp.head.merges, "merge") : ""].filter(Boolean).join(" · ")}
                      </span>
                    </h3>
                  </li>
                  {grp.rows.map((r) => (
                    <Fragment key={r.key}>{rowOf(r)}</Fragment>
                  ))}
                </ol>
              </li>
            ) : (
              grp.rows.map((r) => <Fragment key={`${gi}:${r.key}`}>{rowOf(r)}</Fragment>)
            ),
          )}
        </ol>
      )}
      <p className="br-foot">
        {st.cites ? `${st.cites} ` : ""}
        Merges are found by Baesian's command line on the machine where they happen: at a merge, a pull, a squash's commit or a rebase; one made on GitHub shows once a machine with Baesian pulls it. Git doesn't record where a branch began, so each one starts, dashed, just before its first card
        or commit: from the branch it merged into, or, if it hasn't merged, the branch busiest in the hours before. The commits shown are those whose messages cite a card; their messages never leave your machine.
        {model.offLane ? ` ${plural(model.offLane, "card")} filed on Baesian's own branch or a detached HEAD ${model.offLane === 1 ? "isn't" : "aren't"} shown.` : ""}
      </p>
    </>
  );
}
