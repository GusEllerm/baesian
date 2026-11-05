import { type CSSProperties, useRef, useState } from "react";
import type { ApiCard, ApiState } from "../../src/api";
import { isOwnCard } from "../../src/routing";
import type { OptionKind } from "../../src/schema";
import { PASS_REASONS, WRITE_REASONS, type PassReason, type WriteReason } from "./answer";
import { LIFT_HINT } from "./Lift";
import { Mark } from "./Mark";
import { Prose, inline } from "./Prose";
import { RARITY, type Rarity, type WaitState, agentOf, isHeld, quoted, replyOf, ruleName } from "./model";
import { POSITION_NAMES, type Position, rowInSentence } from "./prefs";

// M4 step 5c: the card, as round 5 draws it (design/explorations/round5/app.js, renderCard), over a real card.
// Presentational: the desk (Desk.tsx) owns what's chosen, the timers and the keys. M8b: a held card is answered blind
// first, then shows what its agent went ahead with, to keep or overturn (D151).

export type Side = "left" | "right";
export const ARROW = { left: "←", right: "→", up: "↑", down: "↓" } as const;

/** What the card is showing: the choice, the reveal after it (D86), or one of the two written answers. */
export type Mode =
  | { kind: "live" }
  /** `asked`: "you should have asked me", on a card the gate held back, or in shadow would have (B-87tkc). */
  | { kind: "reveal"; option: OptionKind; side: Side; first: OptionKind; why: string; rule?: boolean; retire?: string[]; asked?: boolean }
  | { kind: "write"; reason?: WriteReason; text: string; rule?: boolean }
  | { kind: "pass"; reason?: PassReason; text: string }
  /** A card you've answered this session, reopened from the path. */
  | { kind: "review" };

export interface CardProps {
  card: ApiCard;
  rarity: Rarity;
  stakes: string;
  wait: WaitState;
  sides: Record<Side, OptionKind>;
  mode: Mode;
  /** Your rules, to offer retiring the ones the option you chose breaks (D119). */
  rules?: ApiState["rules"];
  /** The reading time left (D91), and how much of it has passed, 0 to 1. */
  readLeftMs: number;
  readFraction: number;
  /** How far a mythic card's confirm has been held, 0 to 1, while it's held. */
  hold?: number;
  /** Topics in use that look like this card's (D44, D111), with how many cards use each, to offer a merge. */
  near?: { topic: string; count: number }[];
  onMerge?: (into: string) => void;
  /** Where a drag or swipe that has gone far enough is pointing: letting go will choose it (round 5). */
  armed?: Side | "up" | "down";
  problem?: string;
  /**
   * For a reopened card: your answer in a few words, and whether it has gone to the agent, or on the website waits for
   * your passkey (B-a6xpc).
   */
  review?: { words: string; sent: boolean; waiting?: boolean };
  onReach: (dir: Side | "up" | "down") => void;
  onMode: (mode: Mode) => void;
  onConfirm: () => void;
  onSwitch: () => void;
  onBack: () => void;
  onSend: () => void;
  /** Reopen a given answer, to change it (D81). */
  onChange: () => void;
  /** The pointer is over an option, or has left: the path lights what it would do. */
  onHover: (side: Side | undefined) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  /**
   * A screen you touch (D130): "press and hold", a button back from the reveal, where there's no Esc, and a line on how
   * to hold the card and drag it (B-yfehp).
   */
  touch?: boolean;
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
        {/* A held card's agent went ahead: whether it ever waited says nothing you need before choosing (D151). */}
        {!isHeld(card) && <WaitBadge agent={agentOf(card)} wait={p.wait} />}
      </p>
      <p className="doing">
        <b>{agentOf(card)}</b> is {m.doing}
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
          {p.near?.length && p.onMerge ? <TopicMerge topic={card.canonicalTopic} near={p.near} onMerge={p.onMerge} /> : null}
          <Foot {...p} />
        </>
      )}
      {mode.kind === "reveal" && <Reveal {...p} mode={mode} />}
      {mode.kind === "review" && <Review {...p} />}
      {(mode.kind === "write" || mode.kind === "pass") && <Written {...p} mode={mode} />}
    </div>
  );
}

/**
 * A topic that looks like another (D44, D111): the card offers the merge, and asks once more before it's made,
 * since an alias can't be undone. Only near-looking topics are offered, as `baesian file` warns of them.
 */
function TopicMerge({ topic, near, onMerge }: { topic: string; near: { topic: string; count: number }[]; onMerge: (into: string) => void }) {
  const [asking, setAsking] = useState<string>();
  const cards = (n: number) => `${n} card${n === 1 ? "" : "s"}`;
  if (asking) {
    return (
      <p className="topic-merge">
        Merge <code>{topic}</code> into <code>{asking}</code>? Decisions on both then count as one topic, and it can't be undone.{" "}
        <button type="button" onClick={() => onMerge(asking)}>
          Merge them
        </button>{" "}
        <button type="button" onClick={() => setAsking(undefined)}>
          Cancel
        </button>
      </p>
    );
  }
  return (
    <p className="topic-merge">
      Its topic, <code>{topic}</code>, looks like{" "}
      {near.map((n, i) => (
        <span key={n.topic}>
          {i > 0 ? " or " : ""}
          <button type="button" onClick={() => setAsking(n.topic)}>
            {n.topic}
          </button>{" "}
          ({cards(n.count)})
        </span>
      ))}
      . Same topic?
    </p>
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
      {m.crux_fact && <p className="fact">{inline(m.crux_fact)}</p>}
      <Reply card={card} />
    </div>
  );
}

/** The agent's one reply to your answer against its pick (D89, D104): the card is back, with a fact or a check. */
function Reply({ card }: { card: ApiCard }) {
  const r = replyOf(card);
  if (!r) return null;
  return (
    <p className="facet reply">
      <b>{agentOf(card)} replied</b>
      {r.to ? <>You chose “{r.to}”. </> : null}
      {r.reply}
    </p>
  );
}

function OptionButton(p: CardProps & { side: Side }) {
  const { card, mode, side } = p;
  const m = card.meta;
  const kind = p.sides[side];
  const live = mode.kind === "live";
  // The agent's pick shows only after you choose (D86); on a held card, it's what the agent went ahead with (D151).
  const showPick = kind === "proposal" && mode.kind === "reveal";
  const pickWords = isHeld(card) ? `${agentOf(card)} went ahead with this` : `${agentOf(card)}'s pick${m.serves ? `, for ${m.serves}` : ""}`;
  const cls = (mode.kind === "reveal" ? (mode.option === kind ? " chosen" : " unchosen") : "") + (p.armed === side ? " armed" : "");
  return (
    <button
      type="button"
      className={`opt${cls}`}
      data-side={side}
      data-kind={kind}
      tabIndex={live ? 0 : -1}
      aria-label={`Choose ${m[kind]}`}
      onClick={() => live && p.onReach(side)}
      onPointerEnter={() => live && p.onHover(side)}
      onPointerLeave={() => p.onHover(undefined)}
    >
      {live && (
        <kbd className="key" aria-hidden="true">
          {ARROW[side]}
        </kbd>
      )}
      <span className="ifans">{kind === "proposal" ? m.crux_proposal : m.crux_alternative}</span>
      <h2>{m[kind]}</h2>
      <p className="then">then {inline(kind === "proposal" ? m.proposal_then : m.alternative_then)}</p>
      {showPick && <span className="pickof">{pickWords}</span>}
    </button>
  );
}

/**
 * The trial facets (D75): a premise nobody has checked, and work the agent has already done. On a held card, what's
 * built waits until you've chosen, since it says which option the agent took (D151).
 */
function Facets({ card }: { card: ApiCard }) {
  const m = card.meta;
  return (
    <>
      {m.premise && m.premise_option && (
        <p className="facet unverified">
          <b>Unverified</b> “{m[m.premise_option]}” {m.premise}. <span className="soft">Check: {m.premise_check}.</span>
        </p>
      )}
      {!isHeld(card) && <Acted card={card} />}
    </>
  );
}

function Acted({ card }: { card: ApiCard }) {
  const m = card.meta;
  if (!m.acted || !m.acted_option) return null;
  return (
    <p className="facet acted">
      <b>Already built</b> {agentOf(card)} has done “{m[m.acted_option]}”: {m.acted}.
    </p>
  );
}

/** What the gate did with a held card, once you've chosen: why it was held back, and what's built (D151). */
function HeldFacts({ card }: { card: ApiCard }) {
  const g = card.gate;
  return (
    <>
      {g && (
        <p className="facet held">
          <b>Held back</b> Your setting for {rowInSentence(g.row)} is “{POSITION_NAMES[g.position as Position]}”, so {agentOf(card)} went ahead without asking.
          {card.audit ? " This one came back to you as a sample." : ""}
        </p>
      )}
      <Acted card={card} />
    </>
  );
}

/**
 * "You should have asked me" (B-87tkc), on a card the gate held back, or in shadow would have: it counts as a miss on
 * the card's row, whatever you choose, and a miss is what makes Baesian propose showing more of them (B-y6jn6).
 */
function AskedToggle({ card, on, onChange }: { card: ApiCard; on: boolean | undefined; onChange: (on: boolean) => void }) {
  const g = card.gate;
  if (g?.outcome !== "held") return null;
  const enforced = g.mode === "enforce";
  return (
    <label className="rule-toggle">
      <input type="checkbox" checked={on ?? false} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {enforced ? "You should have asked me" : "I'd have wanted to be asked"}{" "}
        <span className="soft">
          {enforced
            ? "Whatever you choose, it counts against that setting, and Baesian may propose showing you more like it."
            : `In shadow, your setting for ${rowInSentence(g.row)}, “${POSITION_NAMES[g.position as Position]}”, would have held this back. Ticked, it counts against that setting.`}
        </span>
      </span>
    </label>
  );
}

function Foot(p: CardProps) {
  const agent = agentOf(p.card);
  // On a touch screen there are no arrows (B-yfehp): the line says how the card is answered by touch.
  const rule =
    p.readLeftMs > 0 ? (
      <>
        <b>Read it first:</b> {(p.readLeftMs / 1000).toFixed(1)}&nbsp;s
      </>
    ) : p.touch ? (
      `${LIFT_HINT} ${p.rarity === "mythic" ? "Then press and hold to confirm." : "You choose first."} ${agent}'s pick shows after.`
    ) : (
      `${p.rarity === "mythic" ? "Choose, then hold." : "You choose first."} ${agent}'s pick shows after.`
    );
  return (
    <div className="foot">
      <span className="rule" data-testid="rule">
        {rule}
      </span>
      {/* The arrows are the keys, and say which way to drag: a touch screen has neither (style.css). */}
      <button type="button" className={p.armed === "up" ? "armed" : undefined} onClick={() => p.onReach("up")}>
        <kbd className="dir">↑</kbd> Other answer
      </button>
      <button type="button" className={p.armed === "down" ? "armed" : undefined} onClick={() => p.onReach("down")}>
        <kbd className="dir">↓</kbd> Can't judge
      </button>
    </div>
  );
}

/**
 * The reveal (D86–D88): the agent's pick and the case it wrote at filing; on a disagreement, a reason and the switch.
 * On a held card (D151), what the agent went ahead with and what's built; you keep it or overturn it.
 */
function Reveal(p: CardProps & { mode: Extract<Mode, { kind: "reveal" }> }) {
  const { card, mode } = p;
  const m = card.meta;
  const agent = agentOf(card);
  const held = isHeld(card);
  const own = isOwnCard(m);
  const same = mode.option === "proposal";
  const switched = same && mode.first !== "proposal";
  const key = ARROW[mode.side];
  const confirmWords = held ? (same ? `Keep ${quoted(m.proposal)}` : `Overturn it: ${quoted(m.alternative)}`) : `Confirm ${quoted(m[mode.option])}`;
  const overturn = held && !same ? `Overturning it sends ${agent} a brief of what to redo.` : "";
  // On a touch screen, Esc's way back is a button.
  const small = p.touch ? overturn : `${overturn ? `${overturn} ` : ""}Esc goes back to the choice.`;
  return (
    <div className="panel-in">
      <p className="verdict">
        {held ? (
          switched ? (
            <>
              You're keeping <b>{m.proposal}</b>, what {agent} went ahead with.
            </>
          ) : (
            <>
              You chose <b>{m[mode.option]}</b>. {agent} went ahead with {same ? "the same" : <b>{m.proposal}</b>}.
            </>
          )
        ) : switched ? (
          <>
            You switched to <b>{m.proposal}</b>, {agent}'s pick.
          </>
        ) : (
          <>
            You chose <b>{m[mode.option]}</b>. {agent}{" "}
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
      {held && <HeldFacts card={card} />}
      <div className="reasoning">
        {(m.rationale || m.wrong_if || !card.body.trim()) && <ReasonLine card={card} />}
        {/* B-jfkv9: filed in a hosted repo though it looks like it holds a secret, with the agent's reason. */}
        {m.secret_reason && (
          <p className="small">
            {agent} filed it though it looks like it holds a secret: <q>{m.secret_reason}</q>
          </p>
        )}
        {/* The body is context, shown with the agent's case (D92): open by itself when it's all the reasoning there is. */}
        {card.body.trim() && (
          <details className="context" open={!(m.rationale || m.wrong_if)}>
            <summary>More from {agent}</summary>
            <Prose text={card.body} />
          </details>
        )}
      </div>
      {!same && (
        <label className="why-line">
          <span className="lbl">
            Why?{" "}
            <span className="soft">
              {own ? (
                "Optional. It's kept with your answer, and committed with the code."
              ) : (
                <>
                  Optional. It goes to {agent} with your answer
                  {card.replied ? "." : `, and ${agent} may reply once, with a new fact or a check.`} It's committed with the code.
                </>
              )}
            </span>
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
      <AskedToggle card={card} on={mode.asked} onChange={(asked) => p.onMode({ ...mode, asked })} />
      {!own && <RuleToggle card={card} on={mode.rule} onChange={(rule) => p.onMode({ ...mode, rule })} />}
      {retirable(card, mode.option, p.rules).map((r) => (
        <label key={r.meta.id} className="rule-toggle">
          <input
            type="checkbox"
            checked={mode.retire?.includes(r.meta.id) ?? false}
            onChange={(e) => p.onMode({ ...mode, retire: e.target.checked ? [...(mode.retire ?? []), r.meta.id] : (mode.retire ?? []).filter((id) => id !== r.meta.id) })}
          />
          <span>
            Retire this rule: {ruleName(r.body)} <span className="soft">Your answer breaks it. Retired, it stops approving changes at commit, and {agent} stops citing it.</span>
          </span>
        </label>
      ))}
      <div className="reveal-row">
        {p.rarity === "mythic" ? (
          // A long press on a touch screen mustn't open the page's menu, or end the hold by scrolling (style.css).
          <button type="button" className="hold" onPointerDown={p.onHoldStart} onPointerUp={p.onHoldEnd} onPointerLeave={p.onHoldEnd} onPointerCancel={p.onHoldEnd} onContextMenu={(e) => e.preventDefault()}>
            <span className="fill" style={{ width: `${(p.hold ?? 0) * 100}%` }} />
            <span>
              {p.touch ? (
                "Press and hold to confirm"
              ) : (
                <>
                  Hold <kbd>{key}</kbd> or click and hold to confirm
                </>
              )}
            </span>
          </button>
        ) : (
          <button type="button" className="confirm" onClick={p.onConfirm}>
            {confirmWords} <kbd>{key}</kbd>
          </button>
        )}
        {!same && (
          <button type="button" className="switch" onClick={p.onSwitch}>
            {held ? `Keep ${agent}'s pick` : `Switch to ${agent}'s pick`}
          </button>
        )}
        {/* Esc's way back, where there's no Esc key. */}
        {p.touch && (
          <button type="button" className="cancel" onClick={p.onBack}>
            Back to the choice
          </button>
        )}
      </div>
      {small && <p className="small">{small}</p>}
    </div>
  );
}

/** A card you answered this session, reopened: what you said, and the way to change it. */
function Review(p: CardProps) {
  const agent = agentOf(p.card);
  return (
    <div className="panel-in">
      <div className="result">
        <p>
          <b>{p.review?.words ?? "You answered this card."}</b>{" "}
          {p.review?.sent ? `It was sent to ${agent}.` : p.review?.waiting ? `It waits for your passkey, and goes to ${agent} once you confirm it.` : `It goes to ${agent} in a few seconds.`}
        </p>
      </div>
      <div className="row">
        <button type="button" className="send" onClick={p.onChange}>
          Change your answer
        </button>
        <button type="button" className="cancel" onClick={p.onBack}>
          Back to the next card <kbd>Esc</kbd>
        </button>
      </div>
      {p.review?.sent && <p className="small">A changed answer goes to {agent} with a brief of what it changes.</p>}
    </div>
  );
}

/** ↑ Other answer and ↓ Can't judge: a reason, and words for the agent. */
/** The agent's case, as it wrote it at filing (D77): its rationale, and what would show its pick is wrong. */
function ReasonLine({ card }: { card: ApiCard }) {
  const m = card.meta;
  if (!m.rationale && !m.wrong_if) {
    return (
      <p>
        <span className="who">{agentOf(card)}</span> gave no reasoning beyond the card.
      </p>
    );
  }
  return (
    <p>
      <span className="who">{agentOf(card)}:</span> {m.rationale && <q>{m.rationale}</q>}
      {m.wrong_if && (
        <>
          {" "}
          Its pick is wrong if {m.wrong_if}
          {m.check ? ` (check ${m.check})` : ""}.
        </>
      )}
    </p>
  );
}

/** Your rules that `option` breaks and that aren't retired yet: the ones choosing it can retire (D119). */
function retirable(card: ApiCard, option: OptionKind, rules: ApiState["rules"] = []): ApiState["rules"] {
  const breaks = card.meta[`${option}_breaks`];
  return rules.filter((r) => !r.retired && breaks.includes(r.meta.id));
}

/**
 * D16's "make this a rule": the agent drafts the rule, with the gate patterns it covers, and it comes back to you
 * as a card to confirm (D109, D110). Not on a rule draft itself.
 */
function RuleToggle({ card, on, onChange }: { card: ApiCard; on: boolean | undefined; onChange: (on: boolean) => void }) {
  if (card.meta.rule !== undefined) return null;
  return (
    <label className="rule-toggle">
      <input type="checkbox" checked={on ?? false} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Make this a rule <span className="soft">{agentOf(card)} drafts it for you to confirm, so decisions like this one go the same way.</span>
      </span>
    </label>
  );
}

function Written(p: CardProps & { mode: Extract<Mode, { kind: "write" | "pass" }> }) {
  const { mode } = p;
  const agent = agentOf(p.card);
  const up = mode.kind === "write";
  const chips = up ? WRITE_REASONS : PASS_REASONS;
  const placeholder = up ? (WRITE_REASONS.find((r) => r.reason === mode.reason)?.placeholder ?? `Goes back to ${agent} with this card.`) : "Optional: what would help you judge it?";
  // On a touch screen, the keyboard would cover the reasons you choose from first: it comes up once you've chosen one
  // that needs words, from the tap itself, as a phone requires (D130). With keys, the field has the focus at once.
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="panel-in">
      <h3>{up ? `Write to ${agent}` : "Why can't you judge it?"}</h3>
      <div className="chips" role="group">
        {chips.map((c) => (
          <button
            type="button"
            key={c.reason}
            aria-pressed={mode.reason === c.reason}
            onClick={() => {
              p.onMode({ ...mode, reason: c.reason } as Mode);
              if (p.touch && up) field.current?.focus();
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        ref={field}
        autoFocus={!p.touch}
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
      <p className="small">What you write is committed with the code.</p>
      {mode.kind === "write" && (mode.reason === "correction" || mode.reason === "reject") && (
        <RuleToggle card={p.card} on={mode.rule} onChange={(rule) => p.onMode({ ...mode, rule })} />
      )}
      {p.problem && (
        <p className="problem" role="alert">
          {p.problem}
        </p>
      )}
      <div className="row">
        <button type="button" className="send" disabled={!mode.reason} onClick={p.onSend}>
          {mode.reason === "not_my_area" ? `Ask ${agent} to find another reviewer` : `Send to ${agent}`}
        </button>
        {!p.touch && (
          <span className="small">
            <kbd>⌘</kbd> <kbd>Enter</kbd>
          </span>
        )}
        <button type="button" className="cancel" onClick={p.onBack}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
