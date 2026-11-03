import { type AnimationPlaybackControls, type MotionValue, animate } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OptionKind } from "../../src/schema";
import { Mark } from "./Mark";
import type { Rarity, Relation } from "./model";

// M4 step 5d: the path beside the card (round 5's "path", design/explorations/round5/app.js renderHood, alignPath
// and drawPath). A spine of the decisions you've answered this session, oldest first; the current card's node,
// joined to the card; its relationships hanging off that node, worded from its side; then what's next. Lines are
// measured from the layout and drawn as SVG elements. Leaning toward an option lights what it would do to each
// relationship. The card is measured where it rests, never where its motion has carried it, and the line into it
// follows the card frame by frame as it's dragged, leans, shakes or springs back.

export interface TrailStep {
  key: string;
  id: string;
  name: string;
  /** "you chose “X”", and so on. */
  state: string;
  rarity: Rarity;
  /** How the current card relates to it, when it does: drawn as an arc, not listed twice. */
  link?: Relation;
}
export interface NextStep {
  id: string;
  name: string;
  rarity: Rarity;
  stopped: boolean;
  /** Not on the desk yet since it arrived: tagged "new". */
  fresh: boolean;
  /** How the current card relates to it, when it does: shown on its row, not listed twice. */
  link?: Relation;
}
/** The card's own motion: where its drag, lean or swipe has moved it from where it rests, and how far it has turned. */
export interface CardMotion {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
}
export interface PathProps {
  trail: TrailStep[];
  current: { id: string; name: string; rarity: Rarity; stopped: boolean; conflict: boolean } | undefined;
  /** Opens the list of every answer this session, the ones folded into "N earlier answers" included. */
  onEarlier?: (at: DOMRect) => void;
  earlierOpen?: boolean;
  relations: Relation[];
  upcoming: NextStep[];
  more: number;
  /** The option you're leaning toward, if any. */
  lean: OptionKind | undefined;
  /** An option as the path names it: its key and its name, "← “In a cookie”". */
  optionLabel: (kind: OptionKind) => string;
  onGoTo: (id: string) => void;
  /** Bumped whenever the card's layout may have changed, so the path lines up again. */
  layoutKey: string;
  /** The card in play's motion, for the line into it. */
  card?: CardMotion;
  /** The card in play: the drum turns when it changes (an answer, or going to another card), and settles otherwise. */
  turnKey?: string;
  /** Your choice, flying from the card into its new row on the path. */
  fly?: { key: string; from: { x: number; y: number }; text: string };
  onFlown?: () => void;
}

/** The answers shown above the card's row; older ones fold into "N earlier answers". About what the drum shows. */
const TRAIL_MAX = 3;
/**
 * The drum (the user's design, 2026-11-03): the path is drawn as if wrapped round a cylinder turning on a horizontal
 * axis, its front at the current card's row. A row's distance from the front, along the path, becomes an angle round
 * the drum: the row moves along the curve, tilts, shrinks with depth and fades as it turns away. The rows still sit
 * in their layout; only how they're drawn changes, so clicks land where they're seen.
 */
const DRUM_R = 130;
/** Past this angle a row has turned out of sight: further round, it would be too small to read or to click. */
const DRUM_EDGE = (58 * Math.PI) / 180;
/** The labels at either end ("N earlier answers", "N more after these") sit just past the last row drawn, this much smaller. */
const LABEL_SCALE = 0.92;
/** "you chose …" fades out between these angles, where it gets too small to read. */
const CHOSE_FADE = [(44 * Math.PI) / 180, (54 * Math.PI) / 180] as const;
/** How long the drum takes to turn to a new arrangement, landing before your choice's flight does. */
const TURN_MS = 420;
/** The turn: a spring, so the drum has some weight and settles into place, slightly past it and back. */
const TURN_SPRING = { type: "spring", visualDuration: 0.34, bounce: 0.1 } as const;
/** How far away the drum is seen from: the smaller, the more a row shrinks as it turns away. */
const DEPTH = 360;
const LABELS = new Set(["earlier", "more"]);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The line into the card: from the node's edge, at the node's height, to the card at rest (its centre and width). */
interface Join {
  x1: number;
  y: number;
  cx: number;
  cy: number;
  w: number;
}
/** A piece of the spine between two nodes, as wide, as strong and (ahead) as finely dotted as the drum has them there. */
interface Segment {
  d: string;
  w: number;
  o: number;
  dash: number;
}
interface Lines {
  width: number;
  height: number;
  done: Segment[];
  ahead: Segment[];
  join?: Join;
  /** The drum's front: a soft band, fixed while the drum turns through it, from the path's left edge to the card. */
  band?: { x: number; y: number; w: number };
  arcs: { d: string; head: string; conflict: boolean; id: string }[];
}

export function Path(p: PathProps) {
  const hood = useRef<HTMLElement>(null);
  const path = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(0);
  const [lines, setLines] = useState<Lines>();
  const [shift, setShift] = useState(0);
  const [hot, setHot] = useState<string>();
  // Next rows the drum has turned past its lower edge: counted into "N more after these".
  const [hiddenNext, setHiddenNext] = useState(0);
  const more = p.more + hiddenNext;
  const shown = p.trail.slice(Math.max(0, p.trail.length - TRAIL_MAX + folded));
  const hidden = p.trail.length - shown.length;
  const linked = new Set([...shown, ...p.upcoming].flatMap((s) => (s.link ? [s.id] : [])));
  const rels = p.relations.filter((r) => !linked.has(r.id));
  // Where each row sits round the drum (its distance from the front, by its data-flip key), and, while the drum
  // turns, where it was when the turn began (undefined for a row that's new, which fades in).
  // `wasFront`: the rows, this turn, that were the card at the front when it began (the card just answered).
  const drum = useRef({ to: new Map<string, number>(), from: new Map<string, number | undefined>(), start: 0, wasFront: new Set<string>() });

  // Line the current node up with the card's question; fold the oldest answers away if the node would fall below
  // the card. Then measure the lines. Runs after every render, and whenever the desk resizes or the fonts arrive;
  // state is only set when something actually moved, so it settles.
  const [tick, setTick] = useState(0);
  useLayoutEffect(() => {
    const el = path.current, h = hood.current;
    if (!el || !h) return;
    const desk = h.closest(".desk") as HTMLElement | null;
    const card = desk?.querySelector<HTMLElement>(".stage article.card:not([data-leaving])");
    const h1 = card?.querySelector("h1");
    const now = el.querySelector<HTMLElement>(".row.now .node");
    let next = 0;
    if (card && h1 && now) {
      // Where the card rests, not where a drag or its entrance has it now, and where the rows sit by layout, not
      // where a glide has them: so the path doesn't follow the motion around.
      const rest = restRect(card);
      const hr = h.getBoundingClientRect();
      const top = hr.top + 4;
      // The current row stays inside the path's top edge; the rows above it curve away on the drum, and any that
      // would rise above the edge are hidden, so they don't push the current row out of line with the question.
      const nowTop = hr.top + offsetIn(el.querySelector<HTMLElement>(".row.now") ?? now, h).top;
      const at = hr.top + offsetIn(now, h).top + now.offsetHeight / 2;
      next = Math.round(Math.max(rest.top + offsetIn(h1, card).top + 17 - at, top - nowTop));
      if (at + next > rest.top + rest.height - 36 && shown.length > 0 && folded < p.trail.length) {
        setFolded((f) => f + 1);
        return;
      }
    }
    if (next !== shift) {
      setShift(next);
      return;
    }
    // The arrangement has settled: put every row on the drum, turning it from where the rows were if they moved.
    // The lines are measured from where things are drawn, so they follow the drum as it turns.
    const { hiddenAbove, hiddenBelow } = turnDrum(el, h, shift);
    if (hiddenBelow !== undefined && hiddenBelow !== hiddenNext) setHiddenNext(hiddenBelow);
    // A settled answer that rose past the top edge is folded into "N earlier answers", so it's counted, not lost.
    if (hiddenAbove && shown.length > 0) {
      setFolded((f) => f + 1);
      return;
    }
    const nowRow = el.querySelector<HTMLElement>(":scope > .row.now");
    const frontY = nowRow ? h.getBoundingClientRect().top + offsetIn(nowRow, h).top + shift + nowRow.offsetHeight / 2 : undefined;
    const measured = desk ? measure(desk, el, card ?? undefined, frontY, h) : undefined;
    if (JSON.stringify(measured) !== JSON.stringify(lines)) setLines(measured);
    if (p.fly) {
      const row = el.querySelector<HTMLElement>(`.row.past[data-key="${CSS.escape(p.fly.key)}"]`);
      if (row) flyInto(p.fly, row, h, shift);
      p.onFlown?.();
    }
  });
  /** Where each top-level row sits round the drum, and draws it there; starts a turn when the arrangement changed. */
  const turnDrum = (el: HTMLElement, h: HTMLElement, shift: number) => {
    const rows = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.flip !== undefined);
    const mid = (r: HTMLElement) => offsetIn(r, h).top + r.offsetHeight / 2;
    const nowRow = el.querySelector<HTMLElement>(":scope > .row.now");
    const front = nowRow ? mid(nowRow) : undefined;
    // What the current card relates to stays flat at the front, beside it; the drum carries on curving below it.
    const relsBox = el.querySelector<HTMLElement>(":scope > .rels");
    const relsEnd = relsBox ? offsetIn(relsBox, h).top + relsBox.offsetHeight : undefined;
    const to = new Map<string, number>();
    for (const r of rows) {
      const m = mid(r);
      to.set(r.dataset.flip!, front === undefined ? 0 : relsEnd !== undefined && m > relsEnd ? m - relsEnd + 20 : m - front);
    }
    // Read live: Motion's own hook reads the setting once, when it mounts.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The drum is for a desktop with a pointer; on a phone or a touch screen, the path is a flat list.
    const flatList = !matchMedia("(min-width: 900px) and (hover: hover)").matches;
    const d = drum.current;
    // How far the turn has got, eased, as Motion last set it: never read from the clock here, since renders within
    // a frame must draw the same, or measuring the lines would always find a change and render again, without end.
    const where = (key: string, p: number) => {
      const end = d.to.get(key)!;
      const from = d.from.get(key);
      return from === undefined ? end : from + (end - from) * p;
    };
    const moved = d.to.size > 0 && (to.size !== d.to.size || [...to].some(([k, v]) => d.to.get(k) === undefined || Math.abs(d.to.get(k)! - v) > 0.5));
    // The drum turns for a new card in play; any other change (a card arriving, a resize) settles at once, so the
    // list doesn't move under you while you read. A change during a turn carries the turn on to it.
    const newCard = lastTurnKey.current !== undefined && p.turnKey !== lastTurnKey.current;
    lastTurnKey.current = p.turnKey;
    const midTurn = d.from.size > 0 && turned.current < 1;
    if (moved && !reduced && (newCard || midTurn)) {
      // Turn from wherever each row is now, even mid-turn; the answered card's row turns from its node's old place.
      const p = d.from.size ? turned.current : 1;
      const from = new Map<string, number | undefined>();
      const wasFront = new Set<string>();
      for (const r of rows) {
        const key = r.dataset.flip!;
        const was = d.to.has(key) ? key : r.dataset.from && d.to.has(r.dataset.from) ? r.dataset.from : undefined;
        from.set(key, was === undefined ? undefined : where(was, p));
        if (was !== undefined && was !== key) wasFront.add(key);
      }
      drum.current = { to, from, start: 0, wasFront };
      turned.current = 0;
      turn.current?.stop();
      turn.current = animate(0, 1, {
        ...TURN_SPRING,
        onUpdate: (v) => {
          turned.current = v;
          setTick((t) => t + 1);
        },
        onComplete: () => {
          turned.current = 1;
          setTick((t) => t + 1);
        },
      });
    } else if (moved || d.to.size === 0) {
      drum.current = { to, from: new Map(), start: 0, wasFront: new Set() };
    }
    const turning = drum.current;
    const done = turning.from.size ? turned.current : 1;
    const shown = Math.max(0, Math.min(1, done));
    let hiddenAbove = false;
    let hiddenBelow = 0;
    // How far the drawn rows reach above and below the front, for the labels to sit just beyond.
    let reachUp = 0, reachDown = 0;
    const labels: HTMLElement[] = [];
    for (const r of rows) {
      const key = r.dataset.flip!;
      if (flatList) {
        place(r, 0, 0, 1, 1);
        continue;
      }
      if (LABELS.has(key)) {
        labels.push(r);
        continue;
      }
      const fresh = turning.from.has(key) && turning.from.get(key) === undefined;
      const drawn = place(r, turning.from.size ? where(key, done) : turning.to.get(key)!, turning.to.get(key)!, fresh ? shown : 1, front === undefined ? 0 : front + shift);
      if (drawn.seen) {
        reachUp = Math.min(reachUp, drawn.top);
        reachDown = Math.max(reachDown, drawn.bottom);
      }
      if (!drawn.seen && done >= 1 && r.classList.contains("past")) hiddenAbove = true;
      if (!drawn.seen && r.classList.contains("next")) hiddenBelow++;
      // Names cross-fade as the drum turns: the card coming to the front loses its name to the card itself, and
      // the card just answered gets its name back as it turns away.
      const midway = turning.from.size > 0 && done < 1;
      r.style.setProperty("--name", r.classList.contains("now") ? (midway ? (1 - shown).toFixed(3) : "0") : midway && turning.wasFront.has(key) ? Math.min(1, 2.5 * shown).toFixed(3) : "1");
    }
    for (const r of labels) {
      const up = r.dataset.flip === "earlier";
      const half = (r.offsetHeight / 2) * LABEL_SCALE;
      const centre = up ? reachUp - 3 - half : reachDown + 3 + half;
      const at = turning.to.get(r.dataset.flip!)!;
      const seen = front === undefined || front + shift + centre - half >= 0;
      r.style.setProperty("--dy", `${(centre - at).toFixed(2)}px`);
      r.style.setProperty("--sx", String(LABEL_SCALE));
      r.style.setProperty("--sy", String(LABEL_SCALE));
      r.style.setProperty("--o", seen ? "1" : "0");
      r.style.visibility = seen ? "" : "hidden";
    }
    if (done < 1) el.dataset.turning = "";
    else delete el.dataset.turning;
    // Hover's easing comes on only after the first placement, so the rows don't slide into the drum as it loads.
    if (el.dataset.placed === undefined) requestAnimationFrame(() => (el.dataset.placed = ""));
    // The count below is only settled once the drum has stopped.
    return { hiddenAbove, hiddenBelow: done >= 1 ? hiddenBelow : undefined };
  };
  // The turn itself is Motion's: it eases the turn's progress from 0 to 1, and each step draws and measures again.
  const turn = useRef<AnimationPlaybackControls | undefined>(undefined);
  const turned = useRef(1);
  const lastTurnKey = useRef<string | undefined>(undefined);
  useEffect(() => () => turn.current?.stop(), []);
  useLayoutEffect(() => {
    const desk = hood.current?.closest(".desk");
    if (!desk) return;
    const again = () => setTick((t) => t + 1);
    const ro = new ResizeObserver(() => requestAnimationFrame(again));
    ro.observe(desk);
    addEventListener("resize", again);
    void document.fonts?.ready.then(again);
    return () => {
      ro.disconnect();
      removeEventListener("resize", again);
    };
  }, []);
  // A new card: start again from the full trail.
  useLayoutEffect(() => setFolded(0), [p.layoutKey]);
  void tick;

  // The line into the card is drawn outside React, on every frame the card moves, from where it rests plus its motion.
  const joinEl = useRef<SVGPathElement>(null);
  const join = useRef<Join | undefined>(undefined);
  join.current = lines?.join;
  const card = useRef(p.card);
  card.current = p.card;
  const drawJoin = useRef(() => {
    const el = joinEl.current, g = join.current, m = card.current;
    if (!el || !g) return;
    el.setAttribute("d", joinPath(g, m?.x.get() ?? 0, m?.y.get() ?? 0, m?.rotate.get() ?? 0));
    // It appears with the card: a card still arriving is faint, and the line to it with it.
    const shown = el.closest(".desk")?.querySelector<HTMLElement>(".stage article.card:not([data-leaving])");
    el.style.opacity = shown ? getComputedStyle(shown).opacity : "0";
  }).current;
  useLayoutEffect(drawJoin);
  useEffect(() => {
    const m = p.card;
    if (!m) return;
    const offs = [m.x.on("change", drawJoin), m.y.on("change", drawJoin), m.rotate.on("change", drawJoin)];
    return () => offs.forEach((off) => off());
  }, [p.card, drawJoin]);

  return (
    <>
      <svg className="path-lines" width={lines?.width ?? 0} height={lines?.height ?? 0} aria-hidden="true">
        <defs>
          <linearGradient id="band-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="band-h" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="band-fade" maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill="url(#band-h)" />
          </mask>
        </defs>
        {lines?.band && <rect className="band" x={lines.band.x} y={lines.band.y - 23} width={lines.band.w} height={46} rx={10} fill="url(#band-v)" mask="url(#band-fade)" />}
        {lines?.done.map((s) => <path key={s.d} className="spine done" d={s.d} style={{ strokeWidth: s.w, opacity: s.o }} />)}
        {lines?.ahead.map((s) => <path key={s.d} className="spine ahead" d={s.d} style={{ strokeWidth: s.w, opacity: s.o, strokeDasharray: `${2 * s.dash} ${5 * s.dash}` }} />)}
        {lines?.join && <path className="join" ref={joinEl} />}
        {lines?.arcs.map((a) => (
          <g key={a.id}>
            <path className={`arc${a.conflict ? " conflict" : ""}${hot === a.id ? " hot" : ""}`} d={a.d} />
            <path className={`arc-head${a.conflict ? " conflict" : ""}`} d={a.head} />
          </g>
        ))}
      </svg>
      <aside className="hood" ref={hood} aria-label="Your path through the decisions, and what this one is connected to" data-lean={p.lean ?? ""}>
        <div className="path" ref={path} style={{ transform: `translateY(${shift}px)` }} data-glide={drum.current.to.size ? "" : undefined}>
          {hidden > 0 && (
            <button type="button" className="earlier" data-flip="earlier" aria-expanded={p.earlierOpen ?? false} aria-controls="answers-panel" onClick={(e) => p.onEarlier?.(e.currentTarget.getBoundingClientRect())}>
              {hidden === 1 ? "1 earlier answer" : `${hidden} earlier answers`}
            </button>
          )}
          {shown.map((s) => (
            <button type="button" key={s.key} className="row past" data-id={s.id} data-key={s.key} data-flip={`past:${s.key}`} data-from={`id:${s.id}`} onClick={() => p.onGoTo(s.id)} onPointerEnter={() => setHot(s.id)} onPointerLeave={() => setHot(undefined)}>
              <span className="lbl">
                <span className="nm">{s.name}</span>
                <span className="st">{s.state}</span>
                {s.link && <span className={`tag link${s.link.kind === "conflict" || s.link.kind === "rule" ? " c" : ""}`}>{linkWords(s.link)}</span>}
              </span>
              <span className="node">
                <Mark kind={s.rarity} size={16} answered />
              </span>
            </button>
          ))}
          {p.current && (
            <div className="row now" data-id={p.current.id} data-flip={`id:${p.current.id}`}>
              {/* Its name shows only as it turns to the front: the card beside it says the rest. */}
              <span className="lbl" aria-hidden="true">
                <span className="nm">{p.current.name}</span>
              </span>
              <span className="node">
                <Mark kind={p.current.rarity} size={22} stopped={p.current.stopped} />
              </span>
            </div>
          )}
          {rels.length > 0 && (
            <div className="rels">
              {p.current?.conflict && (
                <p className="group-h" data-flip="group-h">
                  Your answer keeps one, replaces the other
                </p>
              )}
              {rels.map((r) => (
                <RelationRow key={r.id} rel={r} lean={p.lean} optionLabel={p.optionLabel} conflictCard={p.current?.conflict ?? false} />
              ))}
            </div>
          )}
          {p.upcoming.length > 0 && (
            <p className="next-h" data-flip="next-h">
              Next
            </p>
          )}
          {p.upcoming.map((n) => (
            <button type="button" key={n.id} className="row next" data-id={n.id} data-flip={`id:${n.id}`} onClick={() => p.onGoTo(n.id)}>
              <span className="lbl">
                <span className="nm">
                  {n.fresh && <span className="new-tag">new</span>}
                  {n.name}
                </span>
                {n.link && <span className={`tag link${n.link.kind === "conflict" || n.link.kind === "rule" ? " c" : ""}`}>{linkWords(n.link)}</span>}
              </span>
              <span className="node">
                <Mark kind={n.rarity} size={16} stopped={n.stopped} />
              </span>
            </button>
          ))}
          {more > 0 && (
            <p className="earlier ahead" data-flip="more">
              {more} more after these
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

/** The one sequenced movement (round 5): your choice flies from the card along the line into its row, lands as
 * "you chose …", and the node pulses. Web Animations, so nothing is written into the page's styles. It aims at
 * where the row settles (its layout, plus the path's shift), since the row is still gliding there. */
function flyInto(fly: { from: { x: number; y: number }; text: string }, row: HTMLElement, hood: HTMLElement, shift: number) {
  const st = row.querySelector<HTMLElement>(".st");
  if (!st) return;
  const MOVE = 700;
  const chip = document.createElement("span");
  chip.className = "fly";
  chip.textContent = fly.text;
  document.body.append(chip);
  const hr = hood.getBoundingClientRect(), at = offsetIn(st, hood), w = chip.offsetWidth;
  const end = { x: hr.left + at.left + st.offsetWidth - w, y: hr.top + at.top + shift - 3 };
  // It lands at 0.62, once the drum has turned the row into place.
  st.animate([{ opacity: 0 }, { opacity: 0, offset: 0.62 }, { opacity: 1, offset: 0.72 }], { duration: MOVE });
  row.querySelector(".node")?.animate([{ transform: "scale(1)" }, { transform: "scale(1)", offset: 0.52 }, { transform: "scale(1.35)", offset: 0.62 }, { transform: "scale(1)", offset: 0.77 }], { duration: MOVE });
  chip
    .animate(
      [
        { transform: `translate(${fly.from.x}px, ${fly.from.y}px) scale(1.2)`, opacity: 1 },
        { transform: `translate(${fly.from.x - 40}px, ${end.y - 5}px) scale(1)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 0, offset: 0.72 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 0 },
      ],
      { duration: MOVE, easing: "cubic-bezier(.3,.7,.3,1)" },
    )
    .finished.then(() => chip.remove(), () => chip.remove());
}

/** How an earlier answer on the path relates to this card, worded on that answer's row. */
function linkWords(rel: Relation): string {
  if (rel.kind === "builds-on") return "this card builds on it";
  if (rel.kind === "relies-on-this") return "it relies on this card";
  if (rel.kind === "precedent") return "your precedent";
  return rel.label;
}

/** A relationship, off the spine. Leaning toward an option turns its label into what that option does to it. */
function RelationRow({ rel, lean, optionLabel, conflictCard }: { rel: Relation; lean: OptionKind | undefined; optionLabel: (k: OptionKind) => string; conflictCard: boolean }) {
  const fx = lean ? rel.effect?.[lean] : undefined;
  const cls = fx ? (fx.bad ? " fx-bad" : " fx-good") : "";
  const label = fx ? `${fx.bad ? "✗" : "✓"} ${cap(fx.text)}` : conflictCard && rel.keptBy ? `kept if you choose ${optionLabel(rel.keptBy)}` : rel.label;
  const hurts = !conflictCard && rel.effect ? (Object.entries(rel.effect) as [OptionKind, { text: string; bad: boolean }][]).filter(([, v]) => v.bad) : [];
  const conflict = rel.kind === "conflict" || rel.kind === "rule";
  return (
    <div className={`row rel${cls}`} data-id={rel.id} data-flip={`rel:${rel.id}`}>
      <span className="lbl">
        <span className={`tag${conflict ? " c" : ""}${rel.kind === "precedent" ? " p" : ""}`}>{label}</span>
        <span className="nm">{rel.name}</span>
        <span className="st">{rel.state}</span>
        {hurts.length > 0 && <span className="hurt">{hurts.map(([k, v]) => `${optionLabel(k)} ${v.text}`).join("; ")}</span>}
      </span>
      <span className="mk-l">
        <i className={`rdot${conflict ? " c" : ""}`} />
      </span>
    </div>
  );
}

/**
 * Draw one row on the drum. `d` is how far along the path it is from the front right now (mid-turn, it's on its
 * way), `at` how far its layout has it, so it's moved from there. `top` is the front's height in the path's box.
 */
function place(r: HTMLElement, d: number, at: number, alpha: number, top: number): { seen: boolean; top: number; bottom: number } {
  const th = d / DRUM_R;
  const c = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th));
  const y = DRUM_R * Math.sin(c);
  // Out of sight past the drum's edge, or if it would rise above the path's top.
  const gone = Math.abs(th) > DRUM_EDGE || top + y - (r.offsetHeight / 2) * Math.cos(c) < 0;
  // Drawn flat, not in 3D, so the text never shears: it shrinks with depth about its node, which keeps the spine
  // straight, and flattens as it turns, though less than a real drum's would, so it stays readable.
  const depth = DEPTH / (DEPTH + DRUM_R * (1 - Math.cos(c)));
  const flat = 0.55 + 0.45 * Math.cos(c);
  const a = Math.abs(c);
  r.style.setProperty("--chose", a <= CHOSE_FADE[0] ? "1" : a >= CHOSE_FADE[1] ? "0" : ((CHOSE_FADE[1] - a) / (CHOSE_FADE[1] - CHOSE_FADE[0])).toFixed(3));
  // As custom properties, so style.css can lay a row flat at full strength on hover and focus.
  r.style.setProperty("--dy", `${(y - at).toFixed(2)}px`);
  r.style.setProperty("--sx", depth.toFixed(4));
  r.style.setProperty("--sy", (depth * flat).toFixed(4));
  // Depth shows in size and shape more than in fading, so what's drawn stays readable against the desk.
  // ...and fades out over the last 12° before the edge, rather than popping out at full strength.
  const edge = Math.max(0, Math.min(1, (DRUM_EDGE - Math.abs(th)) / ((12 * Math.PI) / 180)));
  const seen = gone ? 0 : alpha * (0.8 + 0.2 * Math.cos(c)) * edge;
  r.style.setProperty("--o", seen.toFixed(3));
  r.style.visibility = seen < 0.03 ? "hidden" : "";
  const half = (r.offsetHeight / 2) * depth * flat;
  return { seen: seen >= 0.03, top: y - half, bottom: y + half };
}

/** Where an element sits with no transform of its own: its layout box, which the card's motion doesn't move. */
function restRect(el: HTMLElement): { left: number; top: number; width: number; height: number } {
  const parent = el.offsetParent as HTMLElement | null;
  const p = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { left: p.left + (parent?.clientLeft ?? 0) + el.offsetLeft, top: p.top + (parent?.clientTop ?? 0) + el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}

/** An element's offset inside an ancestor, by layout: transforms don't count. */
function offsetIn(el: HTMLElement, root: HTMLElement): { left: number; top: number } {
  let left = 0, top = 0;
  for (let e: HTMLElement | null = el; e && e !== root; e = e.offsetParent as HTMLElement | null) {
    left += e.offsetLeft;
    top += e.offsetTop;
  }
  return { left, top };
}

/**
 * The line from the card's node to the card's left edge, wherever the card has been moved (dx, dy) and turned (deg)
 * from where it rests. It never runs backwards: with the card over the node, there's no line.
 */
export function joinPath(g: Join, dx: number, dy: number, deg: number): string {
  const th = (deg * Math.PI) / 180, half = g.w / 2;
  // The card turns about its centre: its left edge's points (−w/2, t) land at x = −w/2·cos θ − t·sin θ and
  // y = −w/2·sin θ + t·cos θ. Solve for the t at the line's height, then take that x.
  const t = (g.y - (g.cy + dy) + half * Math.sin(th)) / Math.cos(th);
  const end = g.cx + dx - half * Math.cos(th) - t * Math.sin(th) + 2;
  return end > g.x1 + 1 ? `M ${g.x1.toFixed(1)} ${g.y.toFixed(1)} H ${end.toFixed(1)}` : "";
}

/** The spine (solid through your answers, dotted through what's next), the line into the card, and the arcs. */
function measure(desk: HTMLElement, path: HTMLElement, card: HTMLElement | undefined, frontY?: number, hood?: HTMLElement): Lines {
  const base = desk.getBoundingClientRect();
  const at = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
  };
  const nodes = (sel: string) => [...path.querySelectorAll<HTMLElement>(sel)];
  const past = nodes(".row.past .node"), now = path.querySelector<HTMLElement>(".row.now .node"), ahead = nodes(".row.next .node");
  // The spine stops short of each node, so nothing has to be painted over it.
  const radius = (el: HTMLElement) => (el === now ? 15 : (el.querySelector(".mk")?.getBoundingClientRect().height ?? 16) / 2) + 4;
  // How the drum has drawn a node's row: its flattening and its strength, from the properties place() sets.
  const drawn = (el: HTMLElement) => {
    const row = el.closest<HTMLElement>("[data-flip]");
    const v = (name: string) => Number(row?.style.getPropertyValue(name) || 1);
    return { sy: v("--sy"), o: v("--o") };
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const segments = (list: HTMLElement[]) => {
    const out: Segment[] = [];
    for (let i = 1; i < list.length; i++) {
      const a = at(list[i - 1]!), b = at(list[i]!), y1 = a.y + radius(list[i - 1]!), y2 = b.y - radius(list[i]!);
      if (y2 <= y1 + 2) continue;
      const da = drawn(list[i - 1]!), db = drawn(list[i]!);
      out.push({ d: `M ${a.x.toFixed(1)} ${y1.toFixed(1)} V ${y2.toFixed(1)}`, w: r2(da.sy + db.sy), o: r2(Math.min(da.o, db.o)), dash: r2((da.sy + db.sy) / 2) });
    }
    return out;
  };
  const lines: Lines = { width: Math.round(base.width), height: Math.round(base.height), done: segments([...past, ...(now ? [now] : [])]), ahead: segments([...(now ? [now] : []), ...ahead]), arcs: [] };
  if (card && frontY !== undefined && hood) {
    // Where the front settles, by layout: the band stays put while rows turn through it.
    const nowNode = path.querySelector<HTMLElement>(".row.now .node");
    const left = nowNode ? nowNode.getBoundingClientRect().left - base.left - 150 : hood.getBoundingClientRect().left - base.left;
    lines.band = { x: Math.round(left), y: Math.round(frontY - base.top), w: Math.round(restRect(card).left - base.left - left + 4) };
  }
  if (now && card) {
    const n = at(now), c = restRect(card);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    // Whole pixels, so the line is crisp.
    lines.join = { x1: r1(n.x + 15), y: Math.round(n.y), cx: r1(c.left - base.left + c.width / 2), cy: r1(c.top - base.top + c.height / 2), w: c.width };
    // A link back to an earlier answer: an arc to the right of the spine, into this card's ring from above.
    for (const row of path.querySelectorAll<HTMLElement>(".row.past")) {
      const tag = row.querySelector(".tag.link");
      const node = row.querySelector<HTMLElement>(".node");
      if (!tag || !node) continue;
      const pt = at(node), r = radius(node);
      const ex = n.x + 15 * Math.cos(-Math.PI / 3), ey = n.y + 15 * Math.sin(-Math.PI / 3);
      lines.arcs.push({
        id: row.dataset.id!,
        conflict: tag.classList.contains("c"),
        d: `M ${(pt.x + r).toFixed(1)} ${pt.y.toFixed(1)} C ${(pt.x + 30).toFixed(1)} ${pt.y.toFixed(1)}, ${(ex + 18).toFixed(1)} ${(ey - 26).toFixed(1)}, ${(ex + 1).toFixed(1)} ${(ey - 2).toFixed(1)}`,
        head: `M ${(ex + 1).toFixed(1)} ${(ey - 2).toFixed(1)} l 2.5 -7.5 M ${(ex + 1).toFixed(1)} ${(ey - 2).toFixed(1)} l 7.2 -2.8`,
      });
    }
  }
  return lines;
}
