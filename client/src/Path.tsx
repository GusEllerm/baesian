import { useLayoutEffect, useRef, useState } from "react";
import type { OptionKind } from "../../src/schema";
import { Mark } from "./Mark";
import type { Rarity, Relation } from "./model";

// M4 step 5d: the path beside the card (round 5's "path", design/explorations/round5/app.js renderHood, alignPath
// and drawPath). A spine of the decisions you've answered this session, oldest first; the current card's node,
// joined to the card; its relationships hanging off that node, worded from its side; then what's next. Lines are
// measured from the layout and drawn as SVG elements. Leaning toward an option lights what it would do to each
// relationship.

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
  /** How the current card relates to it, when it does: shown on its row, not listed twice. */
  link?: Relation;
}
export interface PathProps {
  trail: TrailStep[];
  current: { id: string; rarity: Rarity; stopped: boolean; conflict: boolean } | undefined;
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
  /** Your choice, flying from the card into its new row on the path. */
  fly?: { key: string; from: { x: number; y: number }; text: string };
  onFlown?: () => void;
}

const TRAIL_MAX = 8;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

interface Lines {
  width: number;
  height: number;
  done: string[];
  ahead: string[];
  join?: string;
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
      const top = h.getBoundingClientRect().top + 4;
      const first = el.firstElementChild!.getBoundingClientRect().top - shift;
      const at = now.getBoundingClientRect().top - shift + now.offsetHeight / 2;
      next = Math.round(Math.max(h1.getBoundingClientRect().top + 17 - at, top - first));
      if (at + next > card.getBoundingClientRect().bottom - 36 && shown.length > 0 && folded < p.trail.length) {
        setFolded((f) => f + 1);
        return;
      }
    }
    if (next !== shift) {
      setShift(next);
      return;
    }
    const measured = desk ? measure(desk, el, card ?? undefined) : undefined;
    if (JSON.stringify(measured) !== JSON.stringify(lines)) setLines(measured);
    if (p.fly) {
      const row = el.querySelector<HTMLElement>(`.row.past[data-key="${CSS.escape(p.fly.key)}"]`);
      if (row) flyInto(p.fly, row);
      p.onFlown?.();
    }
  });
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

  return (
    <>
      <svg className="path-lines" width={lines?.width ?? 0} height={lines?.height ?? 0} aria-hidden="true">
        {lines?.done.map((d) => <path key={d} className="spine done" d={d} />)}
        {lines?.ahead.map((d) => <path key={d} className="spine ahead" d={d} />)}
        {lines?.join && <path className="join" d={lines.join} />}
        {lines?.arcs.map((a) => (
          <g key={a.id}>
            <path className={`arc${a.conflict ? " conflict" : ""}${hot === a.id ? " hot" : ""}`} d={a.d} />
            <path className={`arc-head${a.conflict ? " conflict" : ""}`} d={a.head} />
          </g>
        ))}
      </svg>
      <aside className="hood" ref={hood} aria-label="Your path through the decisions, and what this one is connected to" data-lean={p.lean ?? ""}>
        <div className="path" ref={path} style={{ transform: `translateY(${shift}px)` }}>
          {hidden > 0 && <p className="earlier">{hidden === 1 ? "1 earlier answer" : `${hidden} earlier answers`}</p>}
          {shown.map((s) => (
            <button type="button" key={s.key} className="row past" data-id={s.id} data-key={s.key} title={`${s.name}: ${s.state}. Click to see your answer.`} onClick={() => p.onGoTo(s.id)} onPointerEnter={() => setHot(s.id)} onPointerLeave={() => setHot(undefined)}>
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
            <div className="row now" data-id={p.current.id}>
              <span className="lbl" />
              <span className="node">
                <Mark kind={p.current.rarity} size={22} stopped={p.current.stopped} />
              </span>
            </div>
          )}
          {rels.length > 0 && (
            <div className="rels">
              {p.current?.conflict && <p className="group-h">Your answer keeps one, replaces the other</p>}
              {rels.map((r) => (
                <RelationRow key={r.id} rel={r} lean={p.lean} optionLabel={p.optionLabel} conflictCard={p.current?.conflict ?? false} />
              ))}
            </div>
          )}
          {p.upcoming.length > 0 && <p className="next-h">Next</p>}
          {p.upcoming.map((n) => (
            <button type="button" key={n.id} className="row next" data-id={n.id} title={`${n.name}: to answer. Click to answer it.`} onClick={() => p.onGoTo(n.id)}>
              <span className="lbl">
                <span className="nm">{n.name}</span>
                {n.link && <span className={`tag link${n.link.kind === "conflict" || n.link.kind === "rule" ? " c" : ""}`}>{linkWords(n.link)}</span>}
              </span>
              <span className="node">
                <Mark kind={n.rarity} size={16} stopped={n.stopped} />
              </span>
            </button>
          ))}
          {p.more > 0 && <p className="earlier ahead">{p.more} more after these</p>}
        </div>
      </aside>
    </>
  );
}

/** The one sequenced movement (round 5): your choice flies from the card along the line into its row, lands as
 * "you chose …", and the node pulses. Web Animations, so nothing is written into the page's styles. */
function flyInto(fly: { from: { x: number; y: number }; text: string }, row: HTMLElement) {
  const st = row.querySelector<HTMLElement>(".st");
  if (!st) return;
  const MOVE = 700;
  const chip = document.createElement("span");
  chip.className = "fly";
  chip.textContent = fly.text;
  document.body.append(chip);
  const to = st.getBoundingClientRect(), w = chip.offsetWidth;
  const end = { x: to.right - w, y: to.top - 3 };
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
    <div className={`row rel${cls}`} data-id={rel.id}>
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

/** The spine (solid through your answers, dotted through what's next), the line into the card, and the arcs. */
function measure(desk: HTMLElement, path: HTMLElement, card: HTMLElement | undefined): Lines {
  const base = desk.getBoundingClientRect();
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
  if (now && card) {
    const n = at(now), c = card.getBoundingClientRect();
    lines.join = `M ${(n.x + 15).toFixed(1)} ${n.y.toFixed(1)} H ${(c.left - base.left + 2).toFixed(1)}`;
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
