import type { MotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OptionKind } from "../../src/schema";
import { Mark } from "./Mark";
import type { Rarity, Relation } from "./model";

// M4 step 5d: the path beside the card (round 5's "path", design/explorations/round5/app.js renderHood, alignPath
// and drawPath). A spine of the decisions you've answered this session, oldest first; the current card's node,
// joined to the card; its relationships hanging off that node, worded from its side; then what's next. Lines are
// measured from the layout and drawn as SVG elements. Leaning toward an option lights what it would do to each
// relationship. The card is measured where it rests, never where its motion has carried it, and the line into it
// follows the card frame by frame as it's dragged, leans, shakes or springs back. On a phone (D130), the same path
// lies in a sheet you pull up (Sheet.tsx): nothing beside it to line up with, so it names the card in play instead.

export interface TrailStep {
  key: string;
  id: string;
  name: string;
  /** "you chose “X”", and so on. */
  state: string;
  rarity: Rarity;
  /** On the website, an answer waiting for your passkey (B-a6xpc). */
  waiting?: boolean;
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
  /** In a project with members (P20): whom it was sent to, when that isn't you, "sent to ana" or "passed on by ana". */
  sent?: string;
}
/** The card's own motion: where its drag, lean or swipe has moved it from where it rests, and how far it has turned. */
export interface CardMotion {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
}
export interface PathProps {
  trail: TrailStep[];
  /** The card in play. Its name shows only in the sheet, where the card isn't beside it. */
  current: { id: string; name?: string; rarity: Rarity; stopped: boolean; conflict: boolean } | undefined;
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
  /** Your choice, flying from the card into its new row on the path. */
  fly?: { key: string; from: { x: number; y: number }; text: string };
  onFlown?: () => void;
  /** In the phone's sheet (D130): no card beside it, so nothing to line up with, fold for, or join. */
  sheet?: boolean;
}

const TRAIL_MAX = 8;
/** How long the path takes to glide into its new arrangement, landing before your choice's flight does. */
const GLIDE_MS = 380;
const GLIDE_EASE = "cubic-bezier(.3,.7,.3,1)";
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The line into the card: from the node's edge, at the node's height, to the card at rest (its centre and width). */
interface Join {
  x1: number;
  y: number;
  cx: number;
  cy: number;
  w: number;
}
interface Lines {
  width: number;
  height: number;
  done: string[];
  ahead: string[];
  join?: Join;
  arcs: { d: string; head: string; conflict: boolean; id: string }[];
}

export function Path(p: PathProps) {
  const hood = useRef<HTMLElement>(null);
  const path = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(0);
  const [lines, setLines] = useState<Lines>();
  const [shift, setShift] = useState(0);
  const [hot, setHot] = useState<string>();
  const shown = p.trail.slice(Math.max(0, p.trail.length - TRAIL_MAX + folded));
  const hidden = p.trail.length - shown.length;
  const linked = new Set([...shown, ...p.upcoming].flatMap((s) => (s.link ? [s.id] : [])));
  const rels = p.relations.filter((r) => !linked.has(r.id));
  // Where each row sat after the last settled layout, by its data-flip key, so a change can glide from there.
  const tops = useRef(new Map<string, number>());
  const lastShift = useRef(shift);

  // Line the current node up with the card's question; fold the oldest answers away if the node would fall below
  // the card. Then measure the lines. Runs after every render, and whenever the desk resizes or the fonts arrive;
  // state is only set when something actually moved, so it settles.
  const [tick, setTick] = useState(0);
  useLayoutEffect(() => {
    const el = path.current, h = hood.current;
    // The lines are drawn over what holds the path: the desk beside the card, or the sheet on a phone.
    const root = h?.parentElement;
    if (!el || !h || !root) return;
    const card = p.sheet ? null : document.querySelector<HTMLElement>(".stage article.card:not([data-leaving])");
    const h1 = card?.querySelector("h1");
    const now = el.querySelector<HTMLElement>(".row.now .node");
    let next = 0;
    if (card && h1 && now) {
      // Where the card rests, not where a drag or its entrance has it now, and where the rows sit by layout, not
      // where a glide has them: so the path doesn't follow the motion around.
      const rest = restRect(card);
      const hr = h.getBoundingClientRect();
      const top = hr.top + 4;
      const first = hr.top + offsetIn(el.firstElementChild as HTMLElement, h).top;
      const at = hr.top + offsetIn(now, h).top + now.offsetHeight / 2;
      next = Math.round(Math.max(rest.top + offsetIn(h1, card).top + 17 - at, top - first));
      if (at + next > rest.top + rest.height - 36 && shown.length > 0 && folded < p.trail.length) {
        setFolded((f) => f + 1);
        return;
      }
    }
    if (next !== shift) {
      setShift(next);
      return;
    }
    // The arrangement has settled: rows that moved glide from where they were, new ones fade in, and the shift
    // eases (style.css). The lines are measured from where things are on screen, so they're redrawn as it glides.
    const flips = [...el.querySelectorAll<HTMLElement>("[data-flip]")];
    const settled = new Map(flips.map((r) => [r.dataset.flip!, offsetIn(r, h).top] as const));
    const glides: Animation[] = [];
    // Read live: Motion's own hook reads the setting once, when it mounts.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && tops.current.size) {
      for (const r of flips) {
        const was = tops.current.get(r.dataset.flip!) ?? (r.dataset.from ? tops.current.get(r.dataset.from) : undefined);
        const to = settled.get(r.dataset.flip!)!;
        if (was === undefined) glides.push(r.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: GLIDE_MS, easing: GLIDE_EASE }));
        else if (Math.abs(was - to) > 0.5) glides.push(r.animate([{ transform: `translateY(${was - to}px)` }, { transform: "none" }], { duration: GLIDE_MS, easing: GLIDE_EASE }));
      }
    }
    tops.current = settled;
    if (!reduced && (glides.length || shift !== lastShift.current)) glide(glides);
    lastShift.current = shift;
    const measured = measure(root, el, card ?? undefined);
    if (JSON.stringify(measured) !== JSON.stringify(lines)) setLines(measured);
    if (p.fly) {
      const row = el.querySelector<HTMLElement>(`.row.past[data-key="${CSS.escape(p.fly.key)}"]`);
      if (row) flyInto(p.fly, row, h, shift);
      p.onFlown?.();
    }
  });
  // While the path glides, measure it again every frame, and once more when the glide is over.
  const glideUntil = useRef(0);
  const glideFrame = useRef(0);
  const glide = (animations: Animation[]) => {
    glideUntil.current = Math.max(glideUntil.current, performance.now() + GLIDE_MS + 40);
    void Promise.allSettled(animations.map((a) => a.finished)).then(() => setTick((t) => t + 1));
    if (glideFrame.current) return;
    const step = () => {
      setTick((t) => t + 1);
      glideFrame.current = performance.now() < glideUntil.current ? requestAnimationFrame(step) : 0;
    };
    glideFrame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(glideFrame.current), []);
  useLayoutEffect(() => {
    const root = hood.current?.parentElement;
    if (!root) return;
    const again = () => setTick((t) => t + 1);
    const ro = new ResizeObserver(() => requestAnimationFrame(again));
    ro.observe(root);
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
    if (el && g) el.setAttribute("d", joinPath(g, m?.x.get() ?? 0, m?.y.get() ?? 0, m?.rotate.get() ?? 0));
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
        {lines?.done.map((d) => <path key={d} className="spine done" d={d} />)}
        {lines?.ahead.map((d) => <path key={d} className="spine ahead" d={d} />)}
        {lines?.join && <path className="join" ref={joinEl} />}
        {lines?.arcs.map((a) => (
          <g key={a.id}>
            <path className={`arc${a.conflict ? " conflict" : ""}${hot === a.id ? " hot" : ""}`} d={a.d} />
            <path className={`arc-head${a.conflict ? " conflict" : ""}`} d={a.head} />
          </g>
        ))}
      </svg>
      <aside className="hood" ref={hood} aria-label="Your path through the decisions, and what this one is connected to" data-lean={p.lean ?? ""}>
        <div className="path" ref={path} style={{ transform: `translateY(${shift}px)` }} data-glide={tops.current.size ? "" : undefined}>
          {hidden > 0 && (
            <p className="earlier" data-flip="earlier">
              {hidden === 1 ? "1 earlier answer" : `${hidden} earlier answers`}
            </p>
          )}
          {shown.map((s) => (
            <button type="button" key={s.key} className="row past" data-id={s.id} data-key={s.key} data-flip={`past:${s.key}`} data-from={`id:${s.id}`} title={`${s.name}: ${s.state}. Click to see your answer.`} onClick={() => p.onGoTo(s.id)} onPointerEnter={() => setHot(s.id)} onPointerLeave={() => setHot(undefined)}>
              <span className="lbl">
                <span className="nm">{s.name}</span>
                <span className="st">{s.state}</span>
                {s.waiting && <span className="tag passkey">waiting for your passkey</span>}
                {s.link && <span className={`tag link${s.link.kind === "conflict" || s.link.kind === "rule" ? " c" : ""}`}>{linkWords(s.link)}</span>}
              </span>
              <span className="node">
                <Mark kind={s.rarity} size={16} answered />
              </span>
            </button>
          ))}
          {p.current && (
            <div className="row now" data-id={p.current.id} data-flip={`id:${p.current.id}`}>
              <span className="lbl">
                {p.sheet && p.current.name && (
                  <>
                    <span className="nm">{p.current.name}</span>
                    <span className="st">the card you're on</span>
                  </>
                )}
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
            <button type="button" key={n.id} className="row next" data-id={n.id} data-flip={`id:${n.id}`} title={`${n.name}: to answer. Click to answer it.`} onClick={() => p.onGoTo(n.id)}>
              <span className="lbl">
                <span className="nm">
                  {n.fresh && <span className="new-tag">new</span>}
                  {n.name}
                </span>
                {n.link && <span className={`tag link${n.link.kind === "conflict" || n.link.kind === "rule" ? " c" : ""}`}>{linkWords(n.link)}</span>}
                {n.sent && <span className="tag sent">{n.sent}</span>}
              </span>
              <span className="node">
                <Mark kind={n.rarity} size={16} stopped={n.stopped} />
              </span>
            </button>
          ))}
          {p.more > 0 && (
            <p className="earlier ahead" data-flip="more">
              {p.more} more after these
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
  st.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1, offset: 0.55 }], { duration: MOVE });
  row.querySelector(".node")?.animate([{ transform: "scale(1)" }, { transform: "scale(1)", offset: 0.35 }, { transform: "scale(1.35)", offset: 0.45 }, { transform: "scale(1)", offset: 0.6 }], { duration: MOVE });
  chip
    .animate(
      [
        { transform: `translate(${fly.from.x}px, ${fly.from.y}px) scale(1.2)`, opacity: 1 },
        { transform: `translate(${fly.from.x - 40}px, ${end.y - 5}px) scale(1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 0, offset: 0.55 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 0 },
      ],
      { duration: MOVE, easing: "cubic-bezier(.3,.7,.3,1)" },
    )
    .finished.then(() => chip.remove(), () => chip.remove());
}

/**
 * On a phone, with the path folded into its sheet (D130): your choice flies from the card down into the sheet's bar,
 * where its row now is, and the bar's grip pulses as it lands. The same one sequenced movement, aimed at the sheet.
 */
export function flyToBar(fly: { from: { x: number; y: number }; text: string }, bar: HTMLElement) {
  const MOVE = 700;
  const chip = document.createElement("span");
  chip.className = "fly";
  chip.textContent = fly.text;
  document.body.append(chip);
  const r = bar.getBoundingClientRect(), w = Math.min(chip.offsetWidth, r.width - 24);
  const end = { x: r.left + (r.width - w) / 2, y: r.top + 8 };
  bar.querySelector(".grip")?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(1)", offset: 0.4 }, { transform: "scaleX(1.8)", offset: 0.5 }, { transform: "scaleX(1)", offset: 0.65 }], { duration: MOVE });
  chip
    .animate(
      [
        { transform: `translate(${fly.from.x}px, ${fly.from.y}px) scale(1.1)`, opacity: 1 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${end.x}px, ${end.y + 10}px) scale(.7)`, opacity: 0, offset: 0.6 },
        { transform: `translate(${end.x}px, ${end.y + 10}px) scale(.7)`, opacity: 0 },
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
function measure(root: HTMLElement, path: HTMLElement, card: HTMLElement | undefined): Lines {
  const base = root.getBoundingClientRect();
  const at = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
  };
  const nodes = (sel: string) => [...path.querySelectorAll<HTMLElement>(sel)];
  const past = nodes(".row.past .node"), now = path.querySelector<HTMLElement>(".row.now .node"), ahead = nodes(".row.next .node");
  // The spine stops short of each node, so nothing has to be painted over it.
  const radius = (el: HTMLElement) => (el === now ? 15 : (el.querySelector(".mk")?.getBoundingClientRect().height ?? 16) / 2) + 4;
  const segments = (list: HTMLElement[]) => {
    const out: string[] = [];
    for (let i = 1; i < list.length; i++) {
      const a = at(list[i - 1]!), b = at(list[i]!), y1 = a.y + radius(list[i - 1]!), y2 = b.y - radius(list[i]!);
      if (y2 > y1 + 2) out.push(`M ${a.x.toFixed(1)} ${y1.toFixed(1)} V ${y2.toFixed(1)}`);
    }
    return out;
  };
  const lines: Lines = { width: Math.round(base.width), height: Math.round(base.height), done: segments([...past, ...(now ? [now] : [])]), ahead: segments([...(now ? [now] : []), ...ahead]), arcs: [] };
  if (now) {
    const n = at(now);
    if (card) {
      const c = restRect(card);
      const r1 = (v: number) => Math.round(v * 10) / 10;
      lines.join = { x1: r1(n.x + 15), y: r1(n.y), cx: r1(c.left - base.left + c.width / 2), cy: r1(c.top - base.top + c.height / 2), w: c.width };
    }
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
