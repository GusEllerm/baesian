import { useEffect, useState } from "react";
import { type Endpoints, postAnswer, useEndpoints } from "./endpoints";
import type { ApiPreferenceFile, ApiPresets, ApiRouting, RowReport } from "../../src/api";
import type { Replay, ReplayCard, Settings } from "../../src/routing";
import { Panel } from "./Panels";
import {
  type AnyRow,
  type Draft,
  FIXED_ROWS,
  type Mode,
  POSITIONS,
  POSITION_NAMES,
  PRESETS,
  type Position,
  ROWS,
  ROW_FLOOR,
  ROW_NAMES,
  ROW_WHAT,
  type Row,
  STOP_SHORT,
  allowed,
  changeOf,
  dirty,
  draftOf,
  heldWords,
  holdingWords,
  holds,
  presetOf,
  replacesOf,
  replayDraft,
  rowEvidence,
  stopMeans,
  stopRows,
  stopTitle,
} from "./prefs";

// M8b: your preferences (P14 section 1, D147), from the menu, laid out as D180's mockup has them. One set for the repo
// (B-93n77): what each stop does to a card and to its agent meanwhile; the Holding back switch (D148) in sentences; the
// presets with what each would have held of your past cards (B-wwxa3, from `replay()`); and every row as five stops,
// the fixed rows locked and the floors kept (D146), with what falls in it, what its stop means now, and its evidence.
// Saving writes a new file over the one in force, and says plainly when that file has changed underneath you (409). The
// setup survey is reached again from here (B-5na1k).

/** The presets, the rows and the setup survey (`GET /api/presets`), read when needed and again whenever the record changes. */
export function usePresets(active: boolean, version: number): ApiPresets | undefined {
  const [presets, setPresets] = useState<ApiPresets>();
  const url = useEndpoints().presets;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<ApiPresets>) : Promise.reject(new Error(`the server answered ${r.status}`))))
      .then((p) => !stopped && setPresets(p))
      .catch(() => {
        // the panel says it's still reading them
      });
    return () => {
      stopped = true;
    };
  }, [active, version, url]);
  return presets;
}

/**
 * Send a change to the preferences. Resolves with the new file, or says why not: "stale" is the server's 409. On the
 * website, a change that lets more cards past you asks for the passkey first (D163, `postAnswer()`).
 */
export async function postPreferences(e: Endpoints, change: ReturnType<typeof changeOf>): Promise<{ ok: ApiPreferenceFile } | { stale: string } | { error: string }> {
  try {
    const r = await postAnswer(e, e.preferences, change, { client: true });
    const body = (await r.json().catch(() => ({}))) as { error?: string } & Partial<ApiPreferenceFile>;
    if (r.status === 201) return { ok: body as ApiPreferenceFile };
    if (r.status === 409) return { stale: body.error ?? "the preferences have changed" };
    return { error: body.error ?? `the server answered ${r.status}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "stale" } | { kind: "error"; message: string };

const presetName = (id: string | undefined) => PRESETS.find((p) => p.id === id)?.name;

export function PreferencesPanel(p: {
  routing: ApiRouting;
  /** Your past cards, as the replay reads them, for what a draft would have held. */
  cards: ReplayCard[];
  presets: ApiPresets | undefined;
  /** A draft to start from: the setup survey's suggestion, to adjust. */
  initial?: Draft;
  onSaved: (text: string) => void;
  onSurvey: () => void;
  onClose: () => void;
}) {
  const { routing } = p;
  const endpoints = useEndpoints();
  const hosted = !!endpoints.hosted;
  const [base, setBase] = useState<{ name: string | undefined; settings: Settings }>(() => ({ name: replacesOf(routing), settings: routing.settings }));
  const [draft, setDraft] = useState<Draft>(() => p.initial ?? draftOf(routing.settings));
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const changed = dirty(draft, base.settings);

  // A new file in force: an untouched draft follows it. One you've changed stays, and saving it is refused (409).
  const inForce = replacesOf(routing);
  useEffect(() => {
    if (inForce === base.name || changed) return;
    setBase({ name: inForce, settings: routing.settings });
    setDraft(draftOf(routing.settings));
  }, [inForce, routing.settings]);

  const edit = (next: Draft) => {
    setDraft(next);
    if (status.kind !== "saving") setStatus({ kind: "idle" });
  };
  const setRow = (row: Row, position: Position) => edit({ ...draft, rows: { ...draft.rows, [row]: position } });
  const reset = () => edit(draftOf(base.settings));

  const save = async () => {
    setStatus({ kind: "saving" });
    const result = await postPreferences(endpoints, changeOf(draft, base.name, reason));
    if ("ok" in result) {
      setBase({ name: result.ok.name, settings: { ...base.settings, mode: draft.mode, rows: draft.rows } });
      setDraft(draftOf({ ...base.settings, mode: draft.mode, rows: draft.rows }));
      setReason("");
      setStatus({ kind: "saved" });
      p.onSaved(draft.mode === "shadow" ? "Your preferences are saved, in shadow: nothing is held back yet." : "Your preferences are saved. They apply to the next cards agents file.");
    } else if ("stale" in result) {
      // Someone saved first, or you accepted a slider proposal: start again from the file in force now.
      setBase({ name: replacesOf(routing), settings: routing.settings });
      setDraft(draftOf(routing.settings));
      setStatus({ kind: "stale" });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  };

  const replayed = replayDraft(p.cards, draft, routing.settings);
  const matching = presetOf(draft.rows)?.id;
  const file = routing.preferences?.file;
  const s = routing.settings;
  const holding = holdingWords(draft.mode, hosted);
  const rowProps = (row: AnyRow, position: Position) => ({
    row,
    value: position,
    mode: draft.mode,
    settings: s,
    hosted,
    report: routing.report.rows[row],
    replayed: replayed.rows[row],
  });

  return (
    <Panel label="Your preferences" onClose={p.onClose} id="prefs-panel" wide>
      <div className="panel-head">
        <p className="lede">
          Agents file a card for each decision that's hard to undo, and each card falls in a row by what it changes. A row's stop decides two things: whether its cards reach you, and what the agent does
          while it waits for your answer.
        </p>
        <div className="pref-hold">
          <span className="pref-label" id="mode-h">
            Holding back
          </span>
          <div className="stops two" role="radiogroup" aria-labelledby="mode-h">
            {(["shadow", "enforce"] as const).map((mode) => (
              <label key={mode} className="stop" data-on={draft.mode === mode || undefined}>
                <input type="radio" name="pref-mode" value={mode} checked={draft.mode === mode} onChange={() => edit({ ...draft, mode })} />
                <span>{mode === "shadow" ? "Shadow" : "On"}</span>
              </label>
            ))}
          </div>
          <p className="now">{holding.now}</p>
          <p className="more">{holding.more}</p>
        </div>
      </div>
      {routing.problem && (
        <p className="problem" role="alert">
          Your preferences can't be read, so “Today” applies, in shadow. Saving writes new ones.
        </p>
      )}

      <h5>What each stop does</h5>
      <table className="stops-table">
        <thead>
          <tr>
            <th scope="col">Stop</th>
            <th scope="col">The card</th>
            <th scope="col">The agent, meanwhile</th>
          </tr>
        </thead>
        <tbody>
          {stopRows(s, hosted).map((r) => (
            <tr key={r.position} className={r.position === "sample" ? "cut" : undefined}>
              <th scope="row">
                {r.position === "sample" && <span className="cut-label">Held back, when holding back is on</span>}
                <span className="stop-name">{stopTitle(r.position)}</span>
                <span className={r.chip === "held" ? "lvl held" : "lvl"}>{r.chip}</span>
              </th>
              <td data-label="The card">{r.card}</td>
              <td data-label="The agent, meanwhile">{r.agent}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub after">Whatever the stop, an agent may ask for a higher one than its row's, and a card it says can't be undone is never held back.</p>

      <h5>Start from a preset</h5>
      <div className="presets">
        {PRESETS.map((preset) => {
          const replay = p.presets?.presets.find((x) => x.id === preset.id)?.replay;
          return (
            <button
              type="button"
              key={preset.id}
              className="preset"
              aria-pressed={matching === preset.id}
              onClick={() => edit({ ...draft, rows: { ...preset.rows }, preset: preset.id })}
            >
              <b>{preset.name}</b>
              <span>{preset.summary}</span>
              <span className="soft">{replay ? heldWords(replay.total) : "Trying it on your past cards…"}</span>
            </button>
          );
        })}
      </div>

      <h5>Your rows</h5>
      <div className="pref-rows">
        {ROWS.map((row) => (
          <PrefRow key={row} {...rowProps(row, draft.rows[row])} note={ROW_FLOOR[row] ? `No lower than “${POSITION_NAMES[ROW_FLOOR[row]!]}”.` : undefined} onChange={(pos) => setRow(row, pos)} />
        ))}
        {FIXED_ROWS.map((row) => (
          <PrefRow key={row} {...rowProps(row, "never-without-me")} note={`Always “${POSITION_NAMES["never-without-me"]}”.`} />
        ))}
      </div>

      <div className="pref-foot">
        <p className="pref-total">{heldWords(replayed.total, "These settings")}</p>
        <label className="why-line">
          <span className="lbl">
            Why? <span className="soft">Optional. It's kept with the change.</span>
          </span>
          <input type="text" autoComplete="off" placeholder="One line" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="row">
          <button type="button" className="send" disabled={!changed || status.kind === "saving"} onClick={() => void save()}>
            {status.kind === "saving" ? "Saving…" : "Save"}
          </button>
          <button type="button" className="cancel" disabled={!changed} onClick={reset}>
            Discard changes
          </button>
          <span className="small" role="status">
            {status.kind === "saved" ? "Saved." : changed ? "Not saved yet." : ""}
          </span>
        </div>
        {status.kind === "stale" && (
          <p className="problem" role="alert">
            Your preferences changed while this was open, so nothing was saved. They're shown as they are now: make your change again.
          </p>
        )}
        {status.kind === "error" && (
          <p className="problem" role="alert">
            That wasn't saved: {status.message}.
          </p>
        )}
        <p className="sub after">
          {file
            ? `Last changed by ${file.by} on ${new Date(file.at).toLocaleDateString(undefined, { day: "numeric", month: "long" })}${file.from_card ? ", from Baesian's proposal" : presetName(file.profile) ? `, from “${presetName(file.profile)}”` : ""}.`
            : "None saved yet, so “Today” applies, in shadow."}{" "}
          <button type="button" className="link" onClick={p.onSurvey}>
            Find a preset from example decisions
          </button>
        </p>
      </div>
    </Panel>
  );
}

/**
 * One row (D180): its name, what falls in it, its floor or "always", five stops in words (P14), the two lowest holding
 * cards back; then what its stop means now, and its evidence. A fixed row is locked; a floor can't be passed.
 */
function PrefRow(p: {
  row: AnyRow;
  value: Position;
  mode: Mode;
  settings: Settings;
  hosted: boolean;
  report: RowReport | undefined;
  replayed: Replay["rows"][AnyRow];
  note: string | undefined;
  onChange?: (p: Position) => void;
}) {
  const fixed = !p.onChange;
  const means = stopMeans(p.value, p.mode, p.settings, { hosted: p.hosted, held: p.report?.held ?? 0 });
  return (
    <div className="pref-row" data-row={p.row} data-fixed={fixed || undefined}>
      <div className="pref-name">
        <b id={`row-${p.row}`}>{ROW_NAMES[p.row]}</b>
        <span className="what">{ROW_WHAT[p.row]}</span>
        {p.note && <span className="limit">{p.note}</span>}
      </div>
      <div className="pref-stops">
        <div className="stops five" role="radiogroup" aria-labelledby={`row-${p.row}`}>
          {POSITIONS.map((pos) => {
            const ok = !fixed && allowed(p.row as Row, pos);
            return (
              <label key={pos} className={holds(pos) ? "stop holds" : "stop"} data-on={p.value === pos || undefined} data-off={!ok || undefined}>
                {/* The short name is the button's; the full one is its tooltip, and its description to a screen reader. */}
                <input type="radio" name={`pref-${p.row}`} value={pos} title={stopTitle(pos)} checked={p.value === pos} disabled={!ok} onChange={() => p.onChange?.(pos)} />
                <span>{STOP_SHORT[pos]}</span>
              </label>
            );
          })}
        </div>
        <p className="means">
          {means}
          <span className="evidence">{rowEvidence(p.report, p.replayed, holds(p.value))}</span>
        </p>
      </div>
    </div>
  );
}
