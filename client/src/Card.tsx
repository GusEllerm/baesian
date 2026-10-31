import type { CSSProperties } from "react";
import type { ApiCard } from "../../src/api";
import type { OptionKind } from "../../src/schema";
import { PASS_REASONS, WRITE_REASONS, type PassReason, type WriteReason } from "./answer";
import { Mark } from "./Mark";
import { RARITY, type Rarity, type WaitState } from "./model";

// M4 step 5c: the card, as round 5 draws it (design/explorations/round5/app.js, renderCard), over a real card.
// Presentational: the desk (Desk.tsx) owns what's chosen, the timers and the keys.

export type Side = "left" | "right";
export const ARROW = { left: "←", right: "→", up: "↑", down: "↓" } as const;

/** What the card is showing: the choice, the reveal after it (D86), or one of the two written answers. */
export type Mode =
  | { kind: "live" }
  | { kind: "reveal"; option: OptionKind; side: Side; first: OptionKind; why: string }
  | { kind: "write"; reason?: WriteReason; text: string }
  | { kind: "pass"; reason?: PassReason; text: string };

export interface CardProps {
  card: ApiCard;
  rarity: Rarity;
  stakes: string;
  wait: WaitState;
  sides: Record<Side, OptionKind>;
  mode: Mode;
  /** The reading time left (D91), and how much of it has passed, 0 to 1. */
  readLeftMs: number;
  readFraction: number;
  /** How far a mythic card's confirm has been held, 0 to 1, while it's held. */
  hold?: number;
  problem?: string;
  onReach: (dir: Side | "up" | "down") => void;
  onMode: (mode: Mode) => void;
  onConfirm: () => void;
  onSwitch: () => void;
  onBack: () => void;
  onSend: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

export function Card(p: CardProps) {
  const { card, rarity, mode } = p;
  const m = card.meta;
  return (
    <div className="face" style={{ "--read": p.readFraction } as CSSProperties}>
      <p className={`stakes rarity-${rarity}`}>
        <span className="rmark" title={`${RARITY[rarity].name}: ${RARITY[rarity].position} of stakes`} aria-label={RARITY[rarity].name}>
          <Mark kind={rarity} size={22} />
        </span>
        <b>{p.stakes}</b>
        <WaitBadge agent={m.source_agent} wait={p.wait} />
      </p>
      <p className="doing">
        <b>{m.source_agent}</b> is {m.doing}
      </p>
      <h1>{m.question}</h1>
      {mode.kind === "write" || mode.kind === "pass" ? null : (
        <>
          <Crux card={card} />
          <div className="options">
            <OptionButton {...p} side="left" />
            <OptionButton {...p} side="right" />
          </div>
        </>
      )}
      {mode.kind === "live" && (
        <>
          <Facets card={card} />
          <Foot {...p} />
        </>
      )}
      {mode.kind === "reveal" && <Reveal {...p} mode={mode} />}
      {(mode.kind === "write" || mode.kind === "pass") && <Written {...p} mode={mode} />}
    </div>
  );
}

/** Whether an agent is waiting on this card now (D90): only a fresh marker says "stopped". */
function WaitBadge({ agent, wait }: { agent: string; wait: WaitState }) {
  if (wait === "waiting") return <span className="stopped">{agent} stopped</span>;
  if (wait === "gone") return <span className="gone">{agent} stopped waiting</span>;
  if (wait === "carried-on") return <span className="gone">{agent} carried on</span>;
  return null;
}

/** The crux (D74): the one question the choice turns on, and the fact that bears on it. */
function Crux({ card }: { card: ApiCard }) {
  const m = card.meta;
  return (
    <div className="crux">
      <p>
        <span className="lbl">{m.crux_preference ? "It turns on what you value" : "It turns on"}</span> {m.crux}
      </p>
      {m.crux_fact && <p className="fact">{m.crux_fact}</p>}
    </div>
  );
}

function OptionButton(p: CardProps & { side: Side }) {
  const { card, mode, side } = p;
  const m = card.meta;
  const kind = p.sides[side];
  const live = mode.kind === "live";
  // The agent's pick shows only after you choose (D86).
  const showPick = kind === "proposal" && mode.kind === "reveal";
  const cls = mode.kind === "reveal" ? (mode.option === kind ? " chosen" : " unchosen") : "";
  return (
    <button
      type="button"
      className={`opt${cls}`}
      data-side={side}
      data-kind={kind}
      tabIndex={live ? 0 : -1}
      aria-label={`Choose ${m[kind]}`}
      onClick={() => live && p.onReach(side)}
    >
      {live && (
        <kbd className="key" aria-hidden="true">
          {ARROW[side]}
        </kbd>
      )}
      <span className="ifans">{kind === "proposal" ? m.crux_proposal : m.crux_alternative}</span>
      <h2>{m[kind]}</h2>
      <p className="then">then {kind === "proposal" ? m.proposal_then : m.alternative_then}</p>
      {showPick && (
        <span className="pickof">
          {m.source_agent}'s pick{m.serves ? `, for ${m.serves}` : ""}
        </span>
      )}
    </button>
  );
}

/** The trial facets (D75): a premise nobody has checked, and work the agent has already done. */
function Facets({ card }: { card: ApiCard }) {
  const m = card.meta;
  return (
    <>
      {m.premise && m.premise_option && (
        <p className="facet unverified">
          <b>Unverified</b> “{m[m.premise_option]}” {m.premise}. <span className="soft">Check: {m.premise_check}.</span>
        </p>
      )}
      {m.acted && m.acted_option && (
        <p className="facet acted">
          <b>Already built</b> {m.source_agent} has done “{m[m.acted_option]}”: {m.acted}.
        </p>
      )}
    </>
  );
}

function Foot(p: CardProps) {
  const agent = p.card.meta.source_agent;
  const rule =
    p.readLeftMs > 0 ? (
      <>
        <b>Read it first:</b> {(p.readLeftMs / 1000).toFixed(1)}&nbsp;s
      </>
    ) : (
      `${p.rarity === "mythic" ? "Choose, then hold." : "You choose first."} ${agent}'s pick shows after.`
    );
  return (
    <div className="foot">
      <span className="rule" data-testid="rule">
        {rule}
      </span>
      <button type="button" onClick={() => p.onReach("up")}>
        <kbd>↑</kbd> Other answer
      </button>
      <button type="button" onClick={() => p.onReach("down")}>
        <kbd>↓</kbd> Can't judge
      </button>
    </div>
  );
}

/** The reveal (D86–D88): the agent's pick and the case it wrote at filing; on a disagreement, a reason and the switch. */
function Reveal(p: CardProps & { mode: Extract<Mode, { kind: "reveal" }> }) {
  const { card, mode } = p;
  const m = card.meta;
  const same = mode.option === "proposal";
  const switched = same && mode.first !== "proposal";
  const key = ARROW[mode.side];
  return (
    <div className="panel-in">
      <p className="verdict">
        {switched ? (
          <>
            You switched to <b>{m.proposal}</b>, {m.source_agent}'s pick.
          </>
        ) : (
          <>
            You chose <b>{m[mode.option]}</b>. {m.source_agent}{" "}
            {same ? (
              "picked the same."
            ) : (
              <>
                picked <b>{m.proposal}</b>.
              </>
            )}
          </>
        )}
      </p>
      <div className="reasoning">
        {m.rationale || m.wrong_if ? (
          <p>
            <span className="who">{m.source_agent}:</span> {m.rationale && <q>{m.rationale}</q>}
            {m.wrong_if && (
              <>
                {" "}
                Its pick is wrong if {m.wrong_if}
                {m.check ? ` (check ${m.check})` : ""}.
              </>
            )}
          </p>
        ) : (
          <p>
            <span className="who">{m.source_agent}</span> gave no reasoning beyond the card.
          </p>
        )}
      </div>
      {!same && (
        <label className="why-line">
          <span className="lbl">
            Why? <span className="soft">Optional. It goes to {m.source_agent} with your answer.</span>
          </span>
          <input
            type="text"
            autoComplete="off"
            placeholder="One line"
            value={mode.why}
            onChange={(e) => p.onMode({ ...mode, why: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && p.rarity !== "mythic") {
                e.preventDefault();
                p.onConfirm();
              }
            }}
          />
        </label>
      )}
      <div className="reveal-row">
        {p.rarity === "mythic" ? (
          <button type="button" className="hold" onPointerDown={p.onHoldStart} onPointerUp={p.onHoldEnd} onPointerLeave={p.onHoldEnd}>
            <span className="fill" style={{ width: `${(p.hold ?? 0) * 100}%` }} />
            <span>
              Hold <kbd>{key}</kbd> or click and hold to confirm
            </span>
          </button>
        ) : (
          <button type="button" className="confirm" onClick={p.onConfirm}>
            Confirm “{m[mode.option]}” <kbd>{key}</kbd>
          </button>
        )}
        {!same && (
          <button type="button" className="switch" onClick={p.onSwitch}>
            Switch to {m.source_agent}'s pick
          </button>
        )}
      </div>
      <p className="small">Esc goes back to the choice.</p>
    </div>
  );
}

/** ↑ Other answer and ↓ Can't judge: a reason, and words for the agent. */
function Written(p: CardProps & { mode: Extract<Mode, { kind: "write" | "pass" }> }) {
  const { mode } = p;
  const agent = p.card.meta.source_agent;
  const up = mode.kind === "write";
  const chips = up ? WRITE_REASONS : PASS_REASONS;
  const placeholder = up ? (WRITE_REASONS.find((r) => r.reason === mode.reason)?.placeholder ?? `Goes back to ${agent} with this card.`) : "Optional: what would help you judge it?";
  return (
    <div className="panel-in">
      <h3>{up ? `Write to ${agent}` : "Why can't you judge it?"}</h3>
      <div className="chips" role="group">
        {chips.map((c) => (
          <button type="button" key={c.reason} aria-pressed={mode.reason === c.reason} onClick={() => p.onMode({ ...mode, reason: c.reason } as Mode)}>
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        aria-label={up ? "Your answer" : "What would help"}
        placeholder={placeholder}
        value={mode.text}
        onChange={(e) => p.onMode({ ...mode, text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            p.onSend();
          }
        }}
      />
      {p.problem && (
        <p className="problem" role="alert">
          {p.problem}
        </p>
      )}
      <div className="row">
        <button type="button" className="send" disabled={!mode.reason} onClick={p.onSend}>
          {mode.reason === "not_my_area" ? `Ask ${agent} to find another reviewer` : `Send to ${agent}`}
        </button>
        <span className="small">
          <kbd>⌘</kbd> <kbd>Enter</kbd>
        </span>
        <button type="button" className="cancel" onClick={p.onBack}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
