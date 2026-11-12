import type { ApiPresets } from "../../src/api";
import { type Row, type SurveyItem, suggestPreset } from "../../src/routing";
import { ARROW, type Side } from "./Card";
import { LIFT_HINT } from "./Lift";
import { type Answers, type Mode, ROW_NAMES, countWords, heldRows, heldWords, listWords, rowInSentence, surveyAnswersOf } from "./prefs";
import { shared, useTeam } from "./team";

// M8b: the setup survey (B-5na1k), in Baesian's own card format: offered once, when a repo has no preference file; then
// the survey's example decisions as cards you answer with the card's gestures (← "Show me ones like it", → "Fine not
// seeing it", ↓ not sure); then the preset your answers suggest, with what it would have held of your past cards, to
// use as it is or adjust. Presentational: the desk (Desk.tsx) holds the step, the keys and the motion.

export type Setup = { step: "offer" } | { step: "ask"; i: number; answers: Answers } | { step: "result"; answers: Answers; saving?: boolean; problem?: string };

/** The side each answer goes on: fixed, since there's no agent's pick to hide. */
export const SURVEY_SIDES: Record<Side, "see" | "fine"> = { left: "see", right: "fine" };

const UNDO = { cheap: "Easy to undo", moderate: "Costly to undo", "one-way": "Hard to undo" } as const;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The offer: what the survey is, and that it holds nothing back yet (D148). */
export function OfferFace(p: { count: number | undefined; onStart: () => void; onAway: () => void }) {
  return (
    <div className="face">
      <p className="doing">
        <b>Baesian</b> is setting up this repo
      </p>
      <h1>How much should reach you?</h1>
      <p className="setup-text">
        {p.count === undefined ? "A few" : capital(countWords(p.count))} example decisions, one for each kind your settings can hold back. Say of each whether you'd want to see ones like it, and Baesian suggests a
        preset to start from.
      </p>
      <p className="setup-text soft">It starts in shadow: every card still reaches you until you turn holding back on.</p>
      <div className="briefing-foot">
        <div className="row">
          <button type="button" className="confirm" disabled={p.count === undefined} onClick={p.onStart}>
            Start <kbd>→</kbd>
          </button>
          <button type="button" className="cancel" onClick={p.onAway}>
            Not now <kbd>Esc</kbd>
          </button>
        </div>
        <p className="small">Offered once. Your preferences, in the menu, offer it again.</p>
      </div>
    </div>
  );
}

/** One example decision, as a card: what an agent would file, and the one question the survey asks of it. */
export function AskFace(p: {
  survey: ApiPresets["survey"];
  i: number;
  armed?: Side | "up" | "down" | undefined;
  /** A screen you touch: no arrows, and a line on holding the card and dragging it (B-yfehp). */
  touch?: boolean;
  onAnswer: (side: Side) => void;
  onSkip: () => void;
  onBack: () => void;
  onAway: () => void;
}) {
  const item: SurveyItem = p.survey.items[p.i]!;
  const words = { see: { name: p.survey.see, then: "ones like it reach you" }, fine: { name: p.survey.fine, then: "agents go ahead on ones like it, and a sample comes back to you" } };
  return (
    <div className="face">
      <p className="stakes">
        <b>
          Example {p.i + 1} of {p.survey.items.length}: {ROW_NAMES[item.row]}
        </b>
        <span className="gone">{UNDO[item.reverse]}</span>
      </p>
      <p className="doing">
        <b>An agent</b> is {item.doing}
      </p>
      <h1>{item.question}</h1>
      <div className="example" aria-label="Its two options">
        <p>
          <b>{item.proposal}</b> then {item.proposal_then}
        </p>
        <p>
          <b>{item.alternative}</b> then {item.alternative_then}
        </p>
      </div>
      <div className="crux">
        <p>
          <span className="lbl">The question</span> {p.survey.question}
        </p>
      </div>
      <div className="options">
        {(["left", "right"] as const).map((side) => {
          const w = words[SURVEY_SIDES[side]];
          return (
            <button type="button" key={side} className={p.armed === side ? "opt armed" : "opt"} data-side={side} data-answer={SURVEY_SIDES[side]} onClick={() => p.onAnswer(side)}>
              <kbd className="key" aria-hidden="true">
                {ARROW[side]}
              </kbd>
              <h2>{w.name}</h2>
              <p className="then">then {w.then}</p>
            </button>
          );
        })}
      </div>
      <div className="foot">
        <span className="rule">
          {p.touch ? `${LIFT_HINT} ` : ""}Your answers suggest a preset. Nothing is saved until you say so.
        </span>
        {p.i > 0 && (
          <button type="button" onClick={p.onBack}>
            Back
          </button>
        )}
        <button type="button" className={p.armed === "down" ? "armed" : undefined} onClick={p.onSkip}>
          <kbd className="dir">↓</kbd> Not sure
        </button>
        <button type="button" onClick={p.onAway}>
          Not now <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}

/** The preset your answers suggest (`suggestPreset()`), what it would have held of your past cards, and the choice. */
export function ResultFace(p: {
  presets: ApiPresets;
  answers: Answers;
  mode: Mode;
  saving?: boolean | undefined;
  problem?: string | undefined;
  onUse: () => void;
  onAdjust: () => void;
  onAway: () => void;
}) {
  // The survey sets the project's preferences: an owner's, and in a project with other members (P20), tried on everyone's past cards.
  const ours = shared(useTeam());
  const preset = suggestPreset(surveyAnswersOf(p.answers));
  const replay = p.presets.presets.find((x) => x.id === preset.id)?.replay;
  const { sample, agent } = heldRows(preset.rows);
  const names = (rows: Row[]) => listWords(rows.map(rowInSentence));
  return (
    <div className="face">
      <p className="doing">
        <b>Your answers</b> suggest
      </p>
      <h1>{preset.name}</h1>
      <p className="setup-text">{preset.summary}</p>
      <ul className="setup-rows">
        {sample.length > 0 && (
          <li>
            <b>Checked by sample afterwards:</b> {names(sample)}.
          </li>
        )}
        {agent.length > 0 && (
          <li>
            <b>Left to the agent:</b> {names(agent)}.
          </li>
        )}
        <li>
          <b>{sample.length || agent.length ? "Everything else reaches you" : "Every kind reaches you"}</b>, and security and privacy never go ahead without you.
        </li>
      </ul>
      <p className="setup-text">{replay ? heldWords(replay.total, "It", ours) : `Trying it on ${ours ? "the project's" : "your"} past cards…`}</p>
      <p className="setup-text soft">
        {p.mode === "shadow" ? "It starts in shadow: nothing is held back until you turn that on, in your preferences." : "Holding back is on, so it applies to the next cards agents file."}
      </p>
      {p.problem && (
        <p className="problem" role="alert">
          {p.problem}
        </p>
      )}
      <div className="briefing-foot">
        <div className="row">
          <button type="button" className="confirm" disabled={p.saving} onClick={p.onUse}>
            {p.saving ? "Saving…" : "Use it"} <kbd>Enter</kbd>
          </button>
          <button type="button" className="switch" onClick={p.onAdjust}>
            Adjust it first
          </button>
          <button type="button" className="cancel" onClick={p.onAway}>
            Not now <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
