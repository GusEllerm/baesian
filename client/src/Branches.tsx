import { type KeyboardEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ApiState } from "../../src/api";
import { type CardMark, type CommitMark, DESK_GEOMETRY, type Geometry, type Lane, type Layout, type Mark, type MergeMark, PHONE_GEOMETRY, layoutBranches, saidOf, summaryOf } from "./lanes";
import { agentOf } from "./model";
import { Panel } from "./Panels";

// D181: "Your decisions, by branch", a panel opened from the menu, built from the mockup the user approved (a lane per
// branch, its cards as marks, a callout in the README figure's look, the days, and how each lane ends), with what the
// mockup couldn't know: merges, found by the CLI and synced, and the commits that cite cards, each joined, dotted, to the
// card it cites. The same on the local desk and the website: both serve the state it's drawn from. The lanes scroll
// sideways in their own box, opening on the latest day; every mark is reached with the keyboard.

const dayWords = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const onDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const short = (commit: string) => commit.slice(0, 7);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a lane's end says. */
export function endWords(l: Lane): string {
  if (l.end.kind === "merged") return `Merged into ${l.end.into} on ${onDay(l.end.at)}`;
  if (l.end.kind === "held") return `Merge held: ${l.end.waiting} waiting`;
  return "Merges: every card answered";
}

/** What a mark is, for a screen reader and its callout. */
function labelOf(m: Mark, titleOf: (id: string) => string | undefined, nowMs: number): string {
  if (m.kind === "card") return `${m.card.meta.title}: ${saidOf(m.card, nowMs).words}`;
  if (m.kind === "commit") return `Commit ${short(m.commit.commit)}, ${when(m.commit.at)}, on ${m.commit.branch}: cites ${titleOf(m.commit.card) ?? m.commit.card}`;
  return `${m.merge.branch} merged into ${m.merge.into}, ${when(m.merge.at)}${m.merge.cards.length ? `, with ${plural(m.merge.cards.length, "card")}` : ""}`;
}

export function BranchesPanel(p: { state: ApiState; nowMs: number; phone: boolean; canOpen: (id: string) => boolean; onOpen: (id: string) => void; onClose: () => void }) {
  const g: Geometry = p.phone ? PHONE_GEOMETRY : DESK_GEOMETRY;
  const layout = useMemo(() => layoutBranches(p.state, g), [p.state, g]);
  const titles = useMemo(() => new Map(p.state.cards.map((c) => [c.meta.id, c.meta.title])), [p.state.cards]);
  const titleOf = (id: string) => titles.get(id);
  // Along each lane, by x: the order the arrow keys move in.
  const byLane = useMemo(() => {
    const rows: Mark[][] = layout.lanes.map(() => []);
    for (const m of layout.marks) rows[m.lane]!.push(m);
    for (const r of rows) r.sort((a, b) => a.x - b.x || order(a) - order(b));
    return rows;
  }, [layout]);
  const latest = useMemo(() => [...layout.marks].filter((m) => m.kind === "card").sort((a, b) => a.x - b.x).at(-1), [layout]);
  const drawn = useMemo(() => [...layout.marks].sort((a, b) => drawOrder(a) - drawOrder(b)), [layout]);
  const [selected, setSelected] = useState<string | undefined>(latest?.key);
  const [active, setActive] = useState<string | undefined>(latest?.key);
  const [scroll, setScroll] = useState(0);
  /** The box the lanes take: where the scroller starts, and how wide it all is. */
  const [box, setBox] = useState({ left: 0, width: 0, view: 0, band: 0 });
  const scroller = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const markOf = (key: string | undefined) => layout.marks.find((m) => m.key === key);
  const sel = markOf(selected);
  const act = markOf(active) ?? latest ?? layout.marks[0];

  // The lanes open on the latest day.
  useLayoutEffect(() => {
    const s = scroller.current;
    if (!s) return;
    s.scrollLeft = s.scrollWidth;
    setScroll(s.scrollLeft);
  }, []);
  // Where the scroller sits in the lanes' box, for the callout's line: measured, and again when the window changes.
  useLayoutEffect(() => {
    const measure = () => {
      const s = scroller.current;
      const w = wrap.current;
      if (s && w) setBox({ left: s.offsetLeft, width: w.clientWidth, view: s.clientWidth, band: w.querySelector<HTMLElement>(".lane-band")?.offsetTop ?? s.offsetTop + s.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [layout.lanes.length]);

  const y = (k: number) => g.top + k * g.lane + g.lane / 2;
  const show = (m: Mark, opts: { scroll?: boolean; focus?: boolean } = {}) => {
    setSelected(m.key);
    setActive(m.key);
    const s = scroller.current;
    if (s && opts.scroll !== false && (m.x < s.scrollLeft + 40 || m.x > s.scrollLeft + s.clientWidth - 40)) {
      s.scrollLeft = Math.max(0, m.x - s.clientWidth / 2);
      setScroll(s.scrollLeft);
    }
    if (opts.focus) requestAnimationFrame(() => scroller.current?.querySelector<SVGGElement>(`[data-key="${CSS.escape(m.key)}"]`)?.focus({ preventScroll: true }));
  };

  // The arrow keys: along a lane, and to the nearest mark on the lane above or below; Home and End, its ends.
  const onKey = (e: KeyboardEvent, m: Mark) => {
    const row = byLane[m.lane]!;
    const i = row.indexOf(m);
    const nearest = (k: number) => [...(byLane[k] ?? [])].sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
    let next: Mark | undefined;
    if (e.key === "ArrowRight") next = row[i + 1];
    else if (e.key === "ArrowLeft") next = row[i - 1];
    else if (e.key === "Home") next = row[0];
    else if (e.key === "End") next = row.at(-1);
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      for (let k = m.lane + (e.key === "ArrowUp" ? -1 : 1); k >= 0 && k < byLane.length && !next; k += e.key === "ArrowUp" ? -1 : 1) next = nearest(k);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return show(m);
    } else return;
    e.preventDefault();
    if (next) show(next, { focus: true });
  };

  // The selected mark, where it is in the lanes' box: its callout sits under the lanes, joined to it by a dotted line, as
  // the README figure joins its callouts, so it never covers a mark. Scrolled out of view, the line goes; the callout stays.
  const markX = sel ? box.left + sel.x - scroll : 0;
  const inView = !!sel && sel.x >= scroll && sel.x <= scroll + box.view;

  return (
    <Panel label="Your decisions, by branch" onClose={p.onClose} id="branches-panel" wide className="branches">
      <div className="panel-head">
        <div className="panel-head-text">
          <p className="lede">Each branch an agent worked on is a lane, with the cards filed on it in the order they were filed, and the commits that cite them. A branch merges only once every card on it is answered or deferred, so a lane ends merged, ready to merge, or held.</p>
          <p className="lanes-summary">{summaryOf(layout)}</p>
        </div>
        <Legend />
      </div>
      {layout.lanes.length > 0 && (
        <div className="lanes" ref={wrap}>
          <div className="lane-names" style={{ paddingTop: g.top }}>
            {layout.lanes.map((l) => (
              <div key={l.name} className="lane-name" style={{ height: g.lane }}>
                <b title={l.name}>{l.name}</b>
                <span>{l.cards ? `${l.agents.join(", ")} · ${plural(l.cards, "card")}` : "no cards of its own"}</span>
                <span className={`lane-end ${l.end.kind}`}>{endWords(l)}</span>
              </div>
            ))}
          </div>
          <div className="lane-scroll" ref={scroller} data-scrolls="sideways" onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}>
            <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="Each branch's cards, commits and merges along a line, in the order they happened">
              <Lanes layout={layout} g={g} y={y} />
              {drawn.map((m) => (
                <g
                  key={m.key}
                  data-key={m.key}
                  className={`lane-mark ${m.kind}${m.key === selected ? " on" : ""}`}
                  tabIndex={m.key === act?.key ? 0 : -1}
                  role="button"
                  aria-label={labelOf(m, titleOf, p.nowMs)}
                  transform={`translate(${m.x},${y(m.lane)})`}
                  onClick={() => show(m)}
                  onFocus={() => {
                    if (m.key !== selected) show(m);
                  }}
                  onKeyDown={(e) => onKey(e, m)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") show(m, { scroll: false });
                  }}
                >
                  <circle className="hit" r={m.kind === "commit" && !p.phone ? g.commitStep / 2 : g.hit} fill="transparent" />
                  <MarkShape m={m} />
                </g>
              ))}
            </svg>
          </div>
          {sel && inView && box.band > 0 && <span className="lane-leader" aria-hidden="true" style={{ left: markX, top: y(sel.lane) + (sel.kind === "commit" ? 6 : 11), height: box.band + 12 - y(sel.lane) - (sel.kind === "commit" ? 6 : 11) }} />}
          {sel && (
            <div className="lane-band">
              <Callout m={sel} x={markX} width={box.width} phone={p.phone} titleOf={titleOf} nowMs={p.nowMs} canOpen={p.canOpen} onOpen={p.onOpen} onShow={(m) => show(m, { focus: true })} />
            </div>
          )}
        </div>
      )}
      <p className="lanes-note">
        Merges are found by Baesian's command line on the machine where they happen: at a merge, a pull, a squash's commit or a rebase. One made on GitHub shows once a machine with Baesian pulls it. Git doesn't say where a branch began, so a lane starts just before its first card or commit, from the branch it merged into; a lane not merged yet is joined, dotted, to the branch that was busiest when its first card was filed. The commits are those that cite a card: their subjects and messages never leave your machine.
      </p>
    </Panel>
  );
}

/** At one x, the arrow keys reach a card, then a commit, then a merge. */
const order = (m: Mark) => (m.kind === "card" ? 0 : m.kind === "commit" ? 1 : 2);
/** Drawn in this order, each over the last: the commits, then the cards over them, then the merges. */
const drawOrder = (m: Mark) => (m.kind === "commit" ? 0 : m.kind === "card" ? 1 : 2);

function Lanes({ layout, g, y }: { layout: Layout; g: Geometry; y: (k: number) => number }) {
  const H = layout.height;
  const W = layout.width;
  const curve = (x0: number, y0: number, x1: number, y1: number) => `M${x0},${y0} C${x0 + (x1 - x0) * 0.55},${y0} ${x1 - (x1 - x0) * 0.6},${y1} ${x1},${y1}`;
  return (
    <>
      {layout.days.map((d) => (
        <g key={d.x}>
          <line x1={d.x} x2={d.x} y1={6} y2={H} className="lane-day" />
          <text x={d.x + 6} y={20} className="lane-daylabel">
            {dayWords(d.at)}
          </text>
        </g>
      ))}
      {layout.lanes.map((l) => (
        <line key={`rule-${l.name}`} x1={0} x2={W} y1={g.top + (l.k + 1) * g.lane} y2={g.top + (l.k + 1) * g.lane} className="lane-rule" />
      ))}
      {layout.lanes.map((l) => l.fork && <path key={`fork-${l.name}`} d={curve(l.fork.x, y(l.fork.lane), l.from, y(l.k))} className={l.fork.inferred ? "lane-fork inferred" : "lane-fork"} />)}
      {layout.lanes.map((l) => (
        <line key={`line-${l.name}`} x1={l.from} x2={l.to} y1={y(l.k)} y2={y(l.k)} className="lane-line" />
      ))}
      {layout.marks.map((m) => m.kind === "merge" && <path key={`join-${m.key}`} d={curve(m.x - g.mergeStep, y(m.from), m.x, y(m.lane))} className={m.ends ? "lane-merge" : "lane-merge sync"} />)}
      {/* Each commit to the card it cites, dotted: an arc over the lane, or a curve to another lane. */}
      {layout.marks.map((m) => {
        if (m.kind !== "commit" || !m.cites) return null;
        const c = m.cites;
        const y0 = y(m.lane);
        const y1 = y(c.lane);
        const d = m.lane === c.lane ? `M${c.x},${y1} Q${(c.x + m.x) / 2},${y1 - Math.min(g.lane / 2 - 8, 8 + Math.abs(m.x - c.x) / 6)} ${m.x},${y0}` : curve(c.x, y1, m.x, y0);
        return <path key={`cites-${m.key}`} d={d} className="lane-cites" />;
      })}
      {layout.lanes.map((l) => {
        if (l.end.kind === "merged") return null;
        const ex = l.to + 9;
        return l.end.kind === "held" ? (
          <g key={`end-${l.name}`} className="lane-endmark held">
            <circle cx={ex} cy={y(l.k)} r={9} />
            <line x1={ex - 4.5} x2={ex + 4.5} y1={y(l.k)} y2={y(l.k)} />
          </g>
        ) : (
          <circle key={`end-${l.name}`} cx={ex} cy={y(l.k)} r={7} className="lane-endmark ready" />
        );
      })}
    </>
  );
}

function MarkShape({ m }: { m: Mark }) {
  if (m.kind === "commit") return <circle r={3.5} className="m-commit" />;
  if (m.kind === "merge") return <circle r={6} className="m-merge" />;
  const st = m.state;
  return (
    <>
      {m.hard && <circle r={9} className="m-hard" />}
      {st === "with" && <circle r={m.hard ? 5.5 : 6} className="m-with" />}
      {st === "against" && <rect x={-5.5} y={-5.5} width={11} height={11} transform="rotate(45)" className="m-against" />}
      {st === "waiting" && <circle r={6.5} className="m-waiting" />}
      {st === "aside" && <circle r={6} className="m-aside" />}
      {st === "gone" && <circle r={5} className="m-gone" />}
    </>
  );
}

function Legend() {
  const sw = (children: ReactNode) => (
    <svg width="20" height="18" viewBox="-10 -9 20 18" aria-hidden="true">
      {children}
    </svg>
  );
  return (
    <div className="legend lanes-legend" aria-label="Legend">
      <div className="row">{sw(<circle r={6} className="m-with" />)}You chose the agent's pick</div>
      <div className="row">{sw(<rect x={-5.5} y={-5.5} width={11} height={11} transform="rotate(45)" className="m-against" />)}You chose otherwise</div>
      <div className="row">{sw(<circle r={6} className="m-waiting" />)}Waiting for you</div>
      <div className="row">{sw(<circle r={6} className="m-aside" />)}Held back, or deferred: settled at merge</div>
      <div className="row">{sw(<circle r={5} className="m-gone" />)}Withdrawn by its agent</div>
      <div className="row">
        {sw(
          <>
            <circle r={8} className="m-hard" />
            <circle r={5} className="m-with" />
          </>,
        )}
        <span>
          A hard card <span className="fine">(the ring)</span>
        </span>
      </div>
      <div className="row">
        {sw(
          <>
            <path d="M-9,4 Q-3,-6 3,4" className="lane-cites" />
            <circle cx={4} cy={4} r={3} className="m-commit" />
          </>,
        )}
        A commit, joined to the card it cites
      </div>
      <div className="row">
        {sw(
          <>
            <path d="M-9,-6 C-2,-6 -2,5 4,5" className="lane-merge" />
            <circle cx={4} cy={5} r={3.5} className="m-merge" />
          </>,
        )}
        A merge into another branch
      </div>
    </div>
  );
}

/** The callout, in the README figure's look: under the lanes, below its mark, kept inside the box. */
function Callout(p: {
  m: Mark;
  x: number;
  width: number;
  phone: boolean;
  titleOf: (id: string) => string | undefined;
  nowMs: number;
  canOpen: (id: string) => boolean;
  onOpen: (id: string) => void;
  onShow: (m: Mark) => void;
}) {
  const w = Math.min(p.phone ? 280 : 320, p.width || 320);
  const left = Math.max(0, Math.min(p.x - w / 2, (p.width || w) - w));
  const { m } = p;
  return (
    <div className="lane-callout" style={{ marginLeft: left, width: w }} role="status" aria-live="polite">
      {m.kind === "card" && <CardCallout {...p} m={m} />}
      {m.kind === "commit" && <CommitCallout {...p} m={m} />}
      {m.kind === "merge" && <MergeCallout {...p} m={m} />}
    </div>
  );
}

function CardCallout(p: { m: CardMark; nowMs: number; canOpen: (id: string) => boolean; onOpen: (id: string) => void }) {
  const c = p.m.card;
  const said = saidOf(c, p.nowMs);
  return (
    <>
      <h3>{c.meta.title}</h3>
      <span className={`said ${said.tone}`}>{said.words}</span>
      <span className="meta">
        {agentOf(c)} on {c.meta.source_branch} · filed {when(c.meta.created)} · <code>{c.meta.id}</code>
        {c.meta.level ? ` · ${p.m.hard ? "hard" : c.meta.level}` : ""}
      </span>
      {p.canOpen(c.meta.id) && (
        <button type="button" onClick={() => p.onOpen(c.meta.id)}>
          Answer it on the desk
        </button>
      )}
    </>
  );
}

function CommitCallout(p: { m: CommitMark; titleOf: (id: string) => string | undefined; onShow: (m: Mark) => void }) {
  const c = p.m.commit;
  const title = p.titleOf(c.card);
  return (
    <>
      <h3>
        Commit <code>{short(c.commit)}</code>
      </h3>
      <span className="said commit">cites {title ? `“${title}”` : c.card}</span>
      <span className="meta">
        on {c.branch} · {when(c.at)}
      </span>
      {p.m.cites && (
        <button type="button" onClick={() => p.onShow(p.m.cites!)}>
          Show the card
        </button>
      )}
    </>
  );
}

function MergeCallout(p: { m: MergeMark; titleOf: (id: string) => string | undefined }) {
  const mg = p.m.merge;
  const named = mg.cards.map(p.titleOf).filter((t): t is string => !!t);
  return (
    <>
      <h3>
        {mg.branch} merged into {mg.into}
      </h3>
      <span className="said merge">
        {mg.cards.length ? `with ${plural(mg.cards.length, "card")}${named.length ? `: ${named.slice(0, 3).map((t) => `“${t}”`).join(", ")}${named.length > 3 ? ", …" : ""}` : ""}` : "with its deck"}
      </span>
      <span className="meta">
        {when(mg.at)} · commit <code>{short(mg.commit)}</code>
      </span>
    </>
  );
}
