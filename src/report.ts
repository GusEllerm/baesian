import type { RoutingReport, RowReport } from "./api.js";
import {
  type AnyRow,
  FIXED_ROWS,
  type Mode,
  type Outcome,
  type Position,
  ROWS,
  type ReplayCard,
  type Row,
  TODAY,
  isOwnCard,
  outcomeOf,
  rowOf,
} from "./routing.js";
import type { GateRecord } from "./schema.js";
import { type Card, type InForce, type Store, settingsOf } from "./store.js";

// The gate's record, per row (P14 section 3, the report): what was shown and held, the audits, and the misses as card
// B-87tkc counts them. Computed from the record, never stored. The slider proposals read the same numbers (B-y6jn6).

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
 * The agents' cards, on their rows, oldest first: Baesian's own and withdrawn cards are left out. A card counts on its
 * latest revision's record; one filed before the gate counts as "Today" showed it, in shadow.
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
        const answers = outcomeOf(store.verdicts(id));
        if (gate) {
          return [{ card, row: gate.row as AnyRow, position: gate.position, outcome: gate.outcome, mode: gate.mode, drawn: gate.drawn === true, at: gate.at, held: status === "held", answers, gate }];
        }
        const { row, position } = rowOf(card.meta.touches, TODAY);
        return [{ card, row, position, outcome: "shown", mode: "shadow", drawn: false, at: card.meta.created, held: false, answers }];
      })
      .sort((a, b) => a.at.localeCompare(b.at)),
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

/** One row's window (B-y6jn6): since it last moved, or Baesian last proposed moving it, the final answers at its position. */
export interface RowWindow {
  row: Row;
  position: Position;
  since?: string;
  /** Final answers at the row's position since then, oldest answer first. */
  answered: Counted[];
  misses: Counted[];
  /** Final answers since the last miss. */
  streak: number;
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

/** Each row's window, under the settings in force: what the slider proposals and the report's streaks count. */
export function rowWindows(store: Store, counted: readonly Counted[], force: InForce = store.inForce()): RowWindow[] {
  return store.view(() => {
    const moved = lastMoves(store);
    const proposed = new Map<Row, string>();
    for (const c of store.cards()) {
      const row = c.meta.pref_row;
      if (row && (proposed.get(row) ?? "") < c.meta.created) proposed.set(row, c.meta.created);
    }
    return ROWS.map((row): RowWindow => {
      const position = force.settings.rows[row];
      const starts = [moved[row], proposed.get(row)].filter((t): t is string => t !== undefined).sort();
      const since = starts.at(-1);
      const answered = counted
        .filter((c) => c.row === row && c.position === position && c.answers.final && (!since || c.answers.final.at >= since))
        .sort((a, b) => a.answers.final!.at.localeCompare(b.answers.final!.at));
      const misses = answered.filter((c) => c.answers.miss);
      const last = answered.findLastIndex((c) => c.answers.miss);
      return { row, position, ...(since ? { since } : {}), answered, misses, streak: answered.length - (last + 1) };
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
  streak: 0,
  recentMisses: 0,
  agreed: 0,
  cameRound: 0,
  unblind: 0,
  unanswered: 0,
  heldWaiting: 0,
});

/**
 * Where a card falls in your calibration's bar (D180), by its answers: overturned (a miss), came round (switched), chose
 * as the agent did (a final accept whose blind choice was its pick); or, left out of the bar, a final accept with no
 * blind choice, or no final answer at all. Each card falls in exactly one.
 */
export function calibrationOf(answers: Outcome): "agreed" | "cameRound" | "overturned" | "unblind" | "unanswered" {
  if (answers.miss) return "overturned";
  if (answers.switched) return "cameRound";
  if (!answers.final) return "unanswered";
  return answers.final.response === "accept" && answers.final.first_choice === "proposal" ? "agreed" : "unblind";
}

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
    for (const w of rowWindows(store, counted, force)) {
      const r = rows[w.row]!;
      if (w.since) r.since = w.since;
      r.streak = w.streak;
      r.recentMisses = w.misses.length;
      pooled.recentMisses += w.misses.length;
    }
    for (const r of [...Object.values(rows), pooled]) if (r.answered > 0 && r.misses === 0) r.bound = 3 / r.answered;
    return { rows, pooled, beforeGate: counted.filter((c) => !c.gate).length };
  });
}
