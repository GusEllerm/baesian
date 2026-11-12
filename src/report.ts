import type { RoutingReport, RowReport } from "./api.js";
import {
  type AnyRow,
  FINAL,
  FIXED_ROWS,
  type Mode,
  type Outcome,
  type Position,
  ROWS,
  type ReplayCard,
  type Row,
  TODAY,
  answeredInChat,
  calibrationOf,
  isOwnCard,
  outcomeOf,
  rank,
  rowOf,
  stop,
  toLoosen,
} from "./routing.js";
import type { GateRecord } from "./schema.js";
import { type Card, type InForce, PENDING, type Store, settingsOf } from "./store.js";

// The gate's record, per row (P14 section 3, the report): what was shown and held, the audits, and the misses as cards B-87tkc and
// B-ab06a count them. Computed from the record, never stored. The slider proposals read the same numbers (B-y6jn6).

/** A card as the report counts it: on its row, from its gate record, or for a card filed before the gate, as "Today" showed it. */
export interface Counted {
  card: Card;
  row: AnyRow;
  position: Position;
  outcome: "shown" | "held";
  mode: Mode;
  drawn: boolean;
  /** When it was gated: its record's time, or the revision's for a card filed before the gate. */
  at: string;
  held: boolean;
  answers: Outcome;
  gate?: GateRecord;
}

/**
 * The agents' cards, on their rows, oldest first: Baesian's own and withdrawn cards are left out, and so are cards
 * answered in chat (B-hswmx), whose choice wasn't made blind (`chatCards()` counts them). A card counts on its latest
 * revision's record; one filed before the gate counts as "Today" showed it, in shadow.
 */
export function countedCards(store: Store): Counted[] {
  return store.view(() =>
    store
      .cards()
      .flatMap((card): Counted[] => {
        const id = card.meta.id;
        const gate = store.gateRecord(id, card.meta.revision);
        if (isOwnCard(card.meta) || gate?.source === "baesian") return [];
        const status = store.status(id);
        if (status === "withdrawn") return [];
        const verdicts = store.verdicts(id);
        if (answeredInChat({ meta: card.meta, verdicts })) return [];
        // A crux of preference makes a blind choice against the pick a miss (B-ab06a), as the latest revision states it.
        const answers = outcomeOf(verdicts, { preference: card.meta.crux_preference });
        if (gate) {
          return [{ card, row: gate.row as AnyRow, position: gate.position, outcome: gate.outcome, mode: gate.mode, drawn: gate.drawn === true, at: gate.at, held: status === "held", answers, gate }];
        }
        const { row, position } = rowOf(card.meta.touches, TODAY);
        return [{ card, row, position, outcome: "shown", mode: "shadow", drawn: false, at: card.meta.created, held: false, answers }];
      })
      .sort((a, b) => a.at.localeCompare(b.at)),
  );
}

/**
 * The agents' cards answered in chat (B-hswmx), each by the row `countedCards()` would put it on: left out of every
 * measure, and only counted, so the report can say how many it left out. Withdrawn ones aren't counted at all.
 */
export function chatCards(store: Store): AnyRow[] {
  return store.view(() =>
    store.cards().flatMap((card): AnyRow[] => {
      const id = card.meta.id;
      const gate = store.gateRecord(id, card.meta.revision);
      if (isOwnCard(card.meta) || gate?.source === "baesian" || store.status(id) === "withdrawn") return [];
      if (!answeredInChat({ meta: card.meta, verdicts: store.verdicts(id) })) return [];
      return [gate ? (gate.row as AnyRow) : rowOf(card.meta.touches, TODAY).row];
    }),
  );
}

/** The counted cards as the replay reads them (`replay()` in src/routing.ts). */
export function replayCards(counted: readonly Counted[]): ReplayCard[] {
  return counted.map((c) => ({
    id: c.card.meta.id,
    touches: c.card.meta.touches,
    reverse: c.card.meta.reverse,
    ...(c.gate?.asked ? { asked: c.gate.asked } : {}),
    source: c.gate?.source ?? "agent",
    outcome: c.answers,
  }));
}

/**
 * Where a row's count for one move began (B-jtsfh): the row's last move; a change of the agents' model (B-k0w7d); or your
 * keeping the row where it was, the last time Baesian proposed that move. With none, it counts from the row's first answer.
 */
export interface CountStart {
  at: string;
  why: "moved" | "model" | "kept";
  /** For a change of model: the model the agents changed to. */
  model?: string;
}

/** The evidence for moving a row one way (B-jtsfh): every final answer at its position since its count began. */
export interface Evidence {
  since?: CountStart;
  /** Final answers counted, oldest answer first, and the misses among them. */
  answered: Counted[];
  misses: Counted[];
}

/** One row's record for moving it (B-jtsfh): the evidence toward a lower stop and toward a higher one. */
export interface RowWindow {
  row: Row;
  position: Position;
  down: Evidence;
  up: Evidence;
  /** A proposal to move the row is still waiting for your answer. */
  waiting: boolean;
}

/** When each row last moved, from the preference history: a row never moved from "Today" has no time. */
function lastMoves(store: Store): Partial<Record<Row, string>> {
  const out: Partial<Record<Row, string>> = {};
  let rows = TODAY.rows;
  for (const name of store.preferenceNames()) {
    let file;
    try {
      file = store.preferenceFile(name);
    } catch {
      continue;
    }
    if (!file) continue;
    const next = settingsOf(file).rows;
    for (const r of ROWS) if (next[r] !== rows[r]) out[r] = file.at;
    rows = next;
  }
  return out;
}

/**
 * The agents' latest change of model (B-jtsfh, B-k0w7d): across every counted card, in filing order, the last card whose
 * model is known and differs from the last one known before it. A card with no model changes nothing, and counts in
 * whichever model's run it falls. Two models filing alternately keep starting the count again.
 */
export function modelChange(counted: readonly Counted[]): { at: string; model: string } | undefined {
  let known: string | undefined;
  let change: { at: string; model: string } | undefined;
  for (const c of counted) {
    const model = c.card.meta.source_model;
    if (model === undefined) continue;
    if (known !== undefined && model !== known) change = { at: c.at, model };
    known = model;
  }
  return change;
}

/**
 * When you last kept each row where it was, for each move Baesian proposed (B-jtsfh): the time of the final answer, other
 * than accepting it, on a slider proposal that's no longer waiting. Baesian proposes that move again only from the final
 * answers after it, so it never asks again on the evidence you just answered.
 */
function keptAt(store: Store): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of store.cards()) {
    const m = c.meta;
    if (!m.pref_row || !m.pref_from || !m.pref_to || PENDING.has(store.status(m.id))) continue;
    const last = store.verdicts(m.id).filter((v) => FINAL.has(v.response)).at(-1);
    if (!last || last.response === "accept") continue;
    const key = `${m.pref_row} ${rank(m.pref_to) > rank(m.pref_from) ? "up" : "down"}`;
    if ((out.get(key) ?? "") < last.at) out.set(key, last.at);
  }
  return out;
}

/**
 * Each row's record for moving it, under the settings in force (B-jtsfh): the final answers at its position since it last
 * moved, on cards filed since the agents' model last changed; for each way, less those before you last kept it where it
 * was when Baesian proposed moving it that way. A miss adds to what's needed, and never wipes out the answers before it.
 */
export function rowWindows(store: Store, counted: readonly Counted[], force: InForce = store.inForce()): RowWindow[] {
  return store.view(() => {
    const moved = lastMoves(store);
    const model = modelChange(counted);
    const kept = keptAt(store);
    const waiting = new Set(store.cards().flatMap((c) => (c.meta.pref_row && PENDING.has(store.status(c.meta.id)) ? [c.meta.pref_row] : [])));
    return ROWS.map((row): RowWindow => {
      const position = force.settings.rows[row];
      const since = moved[row];
      const base = counted
        .filter((c) => c.row === row && c.position === position && c.answers.final && (!since || c.answers.final.at >= since) && (!model || c.at >= model.at))
        .sort((a, b) => a.answers.final!.at.localeCompare(b.answers.final!.at));
      const evidence = (dir: "up" | "down"): Evidence => {
        const keptHere = kept.get(`${row} ${dir}`);
        const answered = keptHere ? base.filter((c) => c.answers.final!.at > keptHere) : base;
        const starts: CountStart[] = [
          ...(since ? [{ at: since, why: "moved" as const }] : []),
          ...(model ? [{ at: model.at, why: "model" as const, model: model.model }] : []),
          ...(keptHere ? [{ at: keptHere, why: "kept" as const }] : []),
        ];
        const start = starts.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
        return { ...(start ? { since: start } : {}), answered, misses: answered.filter((c) => c.answers.miss) };
      };
      return { row, position, down: evidence("down"), up: evidence("up"), waiting: waiting.has(row) };
    });
  });
}

/** A row of the report with nothing counted yet. */
export const blankRow = (): RowReport => ({
  shown: 0,
  held: 0,
  wouldHold: 0,
  drawn: 0,
  auditsAnswered: 0,
  auditsUnanswered: 0,
  answered: 0,
  misses: 0,
  switched: 0,
  blind: 0,
  matched: 0,
  agreed: 0,
  cameRound: 0,
  unblind: 0,
  unanswered: 0,
  heldWaiting: 0,
  inChat: 0,
});

// `calibrationOf()`, where a card falls in a calibration bar, is in src/routing.ts, where the client can reach it.
export { calibrationOf };

/** The report (P14 section 3): per row, and pooled first, as the client shows it. */
export function routingReport(store: Store, force: InForce = store.inForce()): RoutingReport {
  return store.view(() => {
    const counted = countedCards(store);
    const rows: Record<string, RowReport> = {};
    const pooled = blankRow();
    for (const row of ROWS) rows[row] = { position: force.settings.rows[row], ...blankRow() };
    for (const c of counted) {
      const r = (rows[c.row] ??= { position: (FIXED_ROWS as readonly string[]).includes(c.row) ? "never-without-me" : force.settings.rows[c.row as Row], ...blankRow() });
      for (const t of [r, pooled]) {
        if (c.outcome === "shown") t.shown++;
        else if (c.mode === "enforce") t.held++;
        else t.wouldHold++;
        if (c.outcome === "held" && c.mode === "enforce" && c.drawn) {
          t.drawn++;
          if (c.held) t.auditsUnanswered++;
          else if (c.answers.final) t.auditsAnswered++;
        }
        if (c.answers.final) {
          t.answered++;
          if (c.answers.miss) t.misses++;
          if (c.answers.switched) t.switched++;
          if (c.answers.final.first_choice) {
            t.blind++;
            if (c.answers.final.first_choice === "proposal") t.matched++;
          }
        } else if (c.answers.miss) t.misses++;
        const where = calibrationOf(c.answers);
        if (where === "agreed") t.agreed++;
        else if (where === "cameRound") t.cameRound++;
        else if (where === "unblind") t.unblind++;
        else if (where === "unanswered") {
          t.unanswered++;
          if (c.held) t.heldWaiting++;
        }
      }
    }
    // Answered in chat (B-hswmx): left out of every count above, and said beside them.
    for (const row of chatCards(store)) {
      const r = (rows[row] ??= { position: (FIXED_ROWS as readonly string[]).includes(row) ? "never-without-me" : force.settings.rows[row as Row], ...blankRow() });
      r.inChat++;
      pooled.inChat++;
    }
    // What each row now needs for a lower stop (B-jtsfh), which the calibration panel says beside its bar.
    for (const w of rowWindows(store, counted, force)) {
      const { since, answered, misses } = w.down;
      const lower = stop(w.row, w.position, "down") !== undefined;
      rows[w.row]!.test = {
        ...(since ? { since: since.at, why: since.why } : {}),
        answers: answered.length,
        misses: misses.length,
        ...(lower ? { toLoosen: toLoosen(answered.length, misses.length) } : {}),
        waiting: w.waiting,
      };
    }
    for (const r of [...Object.values(rows), pooled]) if (r.answered > 0 && r.misses === 0) r.bound = 3 / r.answered;
    return { rows, pooled, beforeGate: counted.filter((c) => !c.gate).length };
  });
}
