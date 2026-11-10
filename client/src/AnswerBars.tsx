import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import type { ApiRouting, RowReport } from "../../src/api";
import { isFixed } from "../../src/routing";
import { type Bar, THIN, barOf, leftOut, needsWords, notCounted, ruleWords, scaleOf, segmentWords, summaryWords } from "./calibration";
import { ALL_ROWS, type AnyRow, POSITION_NAMES, type Position, ROW_NAMES } from "./prefs";

// Your calibration, row by row (D180): how your answers compare with the agents' picks, as one stacked bar per row at
// its true length, all rows on one scale, with what each row now needs for a lower stop beside it (B-jtsfh), and the
// same as a table. The counts are the report's (`routingReport()`, src/report.ts), so nothing here counts twice.

const KINDS = ["agreed", "cameRound", "missed"] as const;
type Kind = (typeof KINDS)[number];
const KIND_CLASS: Record<Kind, string> = { agreed: "a", cameRound: "r", missed: "o" };

/** A segment's tooltip, and the segment it names. */
type Tip = { text: string; el: Element };

interface Line {
  row: AnyRow | "all";
  name: string;
  stop?: string;
  bar: Bar;
  report: RowReport | undefined;
}

const pct = (x: number) => `${Math.round(x * 10000) / 100}%`;

export function AnswerBars({ routing }: { routing: ApiRouting }) {
  const report = routing.report;
  const lines: Line[] = ALL_ROWS.map((row) => {
    // The report has every row the repo sets, and a fixed row once it has cards.
    const r = report.rows[row];
    const position = (r?.position ?? (isFixed(row) ? "never-without-me" : routing.settings.rows[row])) as Position;
    return { row, name: ROW_NAMES[row], stop: POSITION_NAMES[position] ?? position, bar: r ? barOf(r) : { agreed: 0, cameRound: 0, missed: 0, total: 0 }, report: r };
  });
  const all: Line = { row: "all", name: "All rows", bar: barOf(report.pooled), report: report.pooled };
  const scale = scaleOf(lines.map((l) => l.bar));
  const [tip, setTip] = useState<Tip>();
  const anyLeft = notCounted(report.pooled) > 0;

  return (
    <>
      <div className="panel-head">
        <div className="panel-head-text">
          <p className="lede">
            How your answers compare with the agents' picks, row by row. You choose before you see the agent's pick, so where you choose as it did, it could be trusted with more; where you overturn it,
            keep seeing those cards.
          </p>
          <p className="cal-summary">{summaryWords(report.pooled)}</p>
        </div>
        <div className="cal-legend" aria-label="Legend">
          <span>
            <i className="sw a" />
            Chose as the agent did, without seeing its pick
          </span>
          <span>
            <i className="sw r" />
            Came round to its pick, after reading its case
          </span>
          <span>
            <i className="sw o" />
            A miss: you overturned it or should have been asked, or chose otherwise blind on what you value
          </span>
        </div>
      </div>

      <div
        className="cal-chart"
        onPointerDown={(e) => {
          // A tap off the bars puts the tooltip away; one on a segment shows its own (below).
          if (!(e.target instanceof Element && e.target.closest(".seg"))) setTip(undefined);
        }}
      >
        <BarRow line={all} scale={all.bar.total} onTip={setTip} />
        {lines.map((line) => (
          <BarRow key={line.row} line={line} scale={scale} onTip={setTip} />
        ))}
      </div>
      <TipBox tip={tip} />

      <details className="cal-table">
        <summary>Show the numbers as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col" className="col-stop">
                Stop
              </th>
              <th scope="col">As the agent</th>
              <th scope="col">Came round</th>
              <th scope="col">Misses</th>
              <th scope="col">Cards</th>
              {anyLeft && <th scope="col">Not counted</th>}
            </tr>
          </thead>
          <tbody>
            {[...lines, all].map((l) => (
              <tr key={l.row} className={l.row === "all" ? "all" : undefined}>
                <th scope="row">
                  {l.name}
                  {l.stop && <span className="in-row">{l.stop}</span>}
                </th>
                <td className="col-stop">{l.stop ?? ""}</td>
                <td>{l.bar.agreed}</td>
                <td>{l.bar.cameRound}</td>
                <td>{l.bar.missed}</td>
                <td>{l.bar.total}</td>
                {anyLeft && <td>{notCounted(l.report)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {anyLeft && <p className="sub after">Not counted: cards not answered yet, held back, or kept without a blind choice.</p>}
      </details>

      <div className="cal-reading">
        <div>
          <b>Mostly indigo</b>
          You and the agents agree here. Baesian suggests a lower stop once it's 95% sure a row's misses are under 1 in 10, from its answers since it last moved: {ruleWords.down}.
          Each row says how many more it needs.
        </div>
        <div>
          <b>Any rose</b>
          Each is a decision you'd have got wrong to leave to the agent. On a question of what you value, your choice before its case is the one that counts: choosing otherwise is a miss even
          if its case then won you round. Once Baesian is 95% sure a row's misses are over 1 in 10 ({ruleWords.up}), it suggests a higher stop.
        </div>
        <div>
          <b>Short and faded</b>
          Fewer than {THIN} answers: too few to say anything about the row yet.
        </div>
      </div>
    </>
  );
}

/**
 * One row: its name and stop, its bar at its true length on the common scale, and "M misses in N", with what the bar
 * leaves out and what the row now needs for a lower stop beside it. Hover a segment, or tap it, for its count; focus the
 * row and the arrows step through them.
 */
function BarRow(p: { line: Line; scale: number; onTip: (t: Tip | undefined) => void }) {
  const { line } = p;
  const { bar } = line;
  const [at, setAt] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  const kinds = KINDS.filter((k) => bar[k] > 0);
  const left = line.report ? leftOut(line.report) : [];
  const needs = needsWords(line.report?.test);
  const show = (i: number) => {
    const el = row.current?.querySelectorAll(".seg")[i];
    if (!el) return;
    setAt(i);
    p.onTip({ text: segmentWords(line.name, kinds[i]!, bar[kinds[i]!], bar.total), el });
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    if (kinds.length) show((at + (e.key === "ArrowRight" ? 1 : kinds.length - 1)) % kinds.length);
  };
  const described = `${line.name}${line.stop ? `, ${line.stop}` : ""}: ${bar.agreed} chose as the agent did, ${bar.cameRound} came round, ${bar.missed} ${bar.missed === 1 ? "miss" : "misses"}, of ${bar.total}.${needs ? ` ${needs}.` : ""}`;
  return (
    <div
      ref={row}
      className={["cal-row", line.row === "all" ? "all" : "", line.row !== "all" && bar.total < THIN ? "thin" : ""].filter(Boolean).join(" ")}
      data-row={line.row}
      role="group"
      aria-label={described}
      tabIndex={bar.total ? 0 : -1}
      onFocus={(e) => e.target === e.currentTarget && kinds.length && show(Math.min(at, kinds.length - 1))}
      onBlur={() => p.onTip(undefined)}
      onKeyDown={keys}
    >
      <div className="nm">
        <b>{line.name}</b>
        <span>{line.row === "all" ? "scaled to its own width" : line.stop}</span>
      </div>
      <div className="cal-track">
        {/* The bar is its row's share of the scale, and its segments share the bar by their counts, less 2 px gaps. */}
        <div className="cal-bar" style={{ width: p.scale ? pct(bar.total / p.scale) : "0" }} onPointerLeave={(e) => e.pointerType === "mouse" && p.onTip(undefined)}>
          {kinds.map((k, i) => (
            <span
              key={k}
              className={`seg ${KIND_CLASS[k]}`}
              data-kind={k}
              data-count={bar[k]}
              style={{ flexGrow: bar[k] }}
              onPointerEnter={(e) => e.pointerType === "mouse" && show(i)}
              onClick={() => show(i)}
            />
          ))}
        </div>
      </div>
      <div className="num">
        {bar.total ? (
          <span>
            <b>{bar.missed}</b> {bar.missed === 1 ? "miss" : "misses"} in {bar.total}
          </span>
        ) : (
          !left.length && <span>no cards</span>
        )}
        {left.length > 0 && <span className="left">{bar.total ? `and ${left.join(", ")}` : left.join(", ")}</span>}
        {needs && <span className="needs">{needs}</span>}
      </div>
    </div>
  );
}

/**
 * The tooltip, over the segment it names (or under it, near the top), kept on screen, and following it as the panel
 * scrolls, as it does when a row below the fold takes focus; the segment is outlined while it shows.
 */
function TipBox({ tip }: { tip: Tip | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const place = () => {
      const r = tip.el.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      el.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)}px`;
      el.style.top = `${r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8}px`;
    };
    place();
    tip.el.setAttribute("data-tipped", "");
    addEventListener("scroll", place, true);
    addEventListener("resize", place);
    return () => {
      tip.el.removeAttribute("data-tipped");
      removeEventListener("scroll", place, true);
      removeEventListener("resize", place);
    };
  }, [tip]);
  if (!tip) return null;
  return (
    <div ref={box} className="cal-tip" role="tooltip">
      {tip.text}
    </div>
  );
}
