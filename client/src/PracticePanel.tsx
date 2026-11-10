import type { ApiState } from "../../src/api";
import type { PracticeEntry } from "../../src/schema";
import { THIN } from "./calibration";
import { dayOf } from "./model";
import { Panel } from "./Panels";
import { type PracticeStatus, TEST_SIZE, cameRound, daysBetween, practiceBar, practised, resultNote, resultWords, sources } from "./practice";

// Practice cards in your calibration (B-kb5yt, docs/vault/Design/Practice Cards.md sections 6 and 7): before the blind
// test, what it is and the way to start it; during it, how far it has come; after it, its result, and, if practice cards
// weren't spotted, their row: how often you come round to a planted pick against a real one.

export interface PracticeProps {
  status: PracticeStatus;
  entries: PracticeEntry[];
  /** Whether your practice answers have been read: until then, nothing is said of them. */
  ready: boolean;
  state: ApiState;
  now: number;
  starting: boolean;
  onStart: () => void;
  onResult: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The practice cards' section of your calibration, under the rows (D180). */
export function PracticeSection(p: PracticeProps) {
  if (!p.ready) return null;
  const s = p.status;
  return (
    <section className="cal-practice" aria-label="Practice cards">
      <h5>Practice cards</h5>
      {s.kind === "before" && <Before {...p} />}
      {s.kind === "test" && (
        <p className="sub">
          The blind test is on: {s.practice} of {TEST_SIZE} rebuilt cards so far. Mark each card you answer. You'll see the result when the tenth rebuilt card is answered.
        </p>
      )}
      {s.kind === "spotted" && (
        <>
          <p className="sub">You could tell rebuilt cards from real ones in the blind test, so practice cards are off.</p>
          <ResultLink onResult={p.onResult} />
        </>
      )}
      {s.kind === "on" && (
        <>
          <PracticeRow entries={p.entries} state={p.state} />
          <p className="sub">Practice cards passed the blind test, so about 1 in 20 of your cards is one. Nothing you answer on one goes to an agent.</p>
          <ResultLink onResult={p.onResult} />
        </>
      )}
    </section>
  );
}

function ResultLink({ onResult }: { onResult: () => void }) {
  return (
    <button type="button" className="cal-link" onClick={onResult}>
      The blind test's result
    </button>
  );
}

/** Before the blind test (B-xx49m): what practice cards are, what the test asks of you, and the way to start it. */
function Before(p: PracticeProps) {
  const ready = sources(p.state, p.now, practised(p.entries)).length;
  const enough = ready >= TEST_SIZE;
  return (
    <>
      <p className="sub">
        Baesian can bring back a card you answered before, with the option its agent didn't pick shown as the pick, to see how often you come round to a pick no agent made. Nothing you answer on one goes to an agent.
      </p>
      <p className="sub">
        A blind test comes first. Until ten rebuilt cards have come, about 1 in 4 of your cards is one, and for every card you answer you say whether you think it was rebuilt. If your marks beat guessing, practice cards are dropped.
      </p>
      <p className="sub">
        A card can come back from a week to a month after you answered it, if its agent wrote a case for the option it didn't pick. {ready === 0 ? "None can yet" : `${plural(ready, "card")} can now`}
        {enough ? "." : `, and the test needs ${TEST_SIZE}.`}
      </p>
      <button type="button" className="confirm cal-start" disabled={!enough || p.starting} onClick={p.onStart}>
        Start the blind test
      </button>
    </>
  );
}

/**
 * Practice cards' row (Practice Cards section 6): chose the planted pick blind; came round to it after its case; or kept
 * against it. Faded until it has `THIN` answers, as a thin row is; and beside it, coming round to planted picks against
 * coming round to agents' real ones, on cards practice could have come from.
 */
export function PracticeRow({ entries, state }: { entries: PracticeEntry[]; state: ApiState }) {
  const bar = practiceBar(entries);
  const round = cameRound(entries, state);
  const segs = [
    { k: "a", n: bar.planted, what: "chose the planted pick without seeing it" },
    { k: "r", n: bar.cameRound, what: "came round to it after its case" },
    { k: "k", n: bar.kept, what: "kept to the other option" },
  ].filter((x) => x.n > 0);
  const described = `Practice cards: ${bar.planted} chose the planted pick blind, ${bar.cameRound} came round to it, ${bar.kept} kept to the other option, of ${bar.total}.`;
  return (
    <>
      <div className={["cal-row", "practice", bar.total < THIN ? "thin" : ""].filter(Boolean).join(" ")} role="group" aria-label={described}>
        <div className="nm">
          <b>Practice cards</b>
          <span>a pick no agent made</span>
        </div>
        <div className="cal-track">
          <div className="cal-bar" style={{ width: bar.total ? "100%" : "0" }}>
            {segs.map((x) => (
              <span key={x.k} className={`seg ${x.k}`} data-kind={x.k} data-count={x.n} style={{ flexGrow: x.n }} title={`${x.what}: ${x.n} of ${bar.total}`} />
            ))}
          </div>
        </div>
        <div className="num">{bar.total ? <span>{plural(bar.total, "card")}</span> : <span>none yet</span>}</div>
      </div>
      <div className="cal-legend practice-legend" aria-hidden="true">
        <span>
          <i className="sw a" />
          Chose the planted pick without seeing it
        </span>
        <span>
          <i className="sw r" />
          Came round to it after its case
        </span>
        <span>
          <i className="sw k" />
          Kept to the other option
        </span>
      </div>
      <p className="cal-summary">{comparedWords(round)}</p>
      <p className="sub">
        A planted pick's case is the one its agent wrote for the option it didn't pick, which may be weaker than its case for its own: coming round less often to planted picks can mean weaker cases as
        well as better judgement.
      </p>
    </>
  );
}

/** Coming round to planted picks against real ones, in a sentence (Practice Cards section 6). */
export function comparedWords(r: ReturnType<typeof cameRound>): string {
  const planted = r.planted.of ? `You came round to a planted pick on ${r.planted.came} of ${plural(r.planted.of, "practice card")} where you chose otherwise blind` : "No practice card yet where you chose otherwise blind";
  const real = r.real.of ? `to an agent's real pick on ${r.real.came} of ${r.real.of}` : "no real card yet where you did either";
  return r.planted.of ? `${planted}, and ${real}.` : `${planted}, and ${r.real.of ? `you came round ${real}` : real}.`;
}

/**
 * The blind test's result (B-xx49m, B-bb7ga), shown when the tenth rebuilt card is answered: whether practice cards were
 * spotted, each rebuilt card with your mark and how long before it its original was answered (B-j583c's check), your marks
 * on the real cards, and the result as a note for the vault.
 */
export function PracticeResultPanel({ status, titleOf, onClose }: { status: Extract<PracticeStatus, { kind: "spotted" | "on" }>; titleOf: (id: string) => string | undefined; onClose: () => void }) {
  const r = status.result;
  const rebuilt = status.marks.filter((m) => m.practice);
  const real = status.marks.filter((m) => !m.practice);
  const save = () => {
    const note = resultNote(status, titleOf);
    const url = URL.createObjectURL(new Blob([note.text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = note.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Panel label="The blind test's result" onClose={onClose} id="practice-panel" wide>
      <p className="lede">{resultWords(r)}</p>
      <p className="sub">The rebuilt cards, each with your mark. None went to an agent, and no agent was waiting on any of them.</p>
      <ul className="practice-list">
        {rebuilt.map((m) => (
          <li key={m.card} className="parked-row">
            <span className="nm">{titleOf(m.card) ?? (m.answered ? `A card you answered on ${dayOf(m.answered)}` : "A card you answered before")}</span>
            <span className="st">
              You marked it <b>{m.mark}</b>. {m.answered ? `You'd answered it ${plural(daysBetween(m.answered, m.at), "day")} before.` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="sub">
        Of the {plural(real.length, "real card")} you answered in the test, you marked {real.filter((m) => m.mark === "maybe").length} maybe and {real.filter((m) => m.mark === "sure").length} sure.
      </p>
      <div className="row">
        <button type="button" className="send" onClick={save}>
          Save the result as a note
        </button>
      </div>
      <p className="small">A note for your vault's Reviews folder, with each rebuilt card's mark against how long before it you'd answered the card it came from.</p>
    </Panel>
  );
}
