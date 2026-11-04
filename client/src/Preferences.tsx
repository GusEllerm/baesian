import { useEffect, useState } from "react";
import { type Endpoints, postAnswer, useEndpoints } from "./endpoints";
import type { ApiPreferenceFile, ApiPresets, ApiRouting } from "../../src/api";
import type { ReplayCard, Settings } from "../../src/routing";
import { Panel } from "./Panels";
import {
  type Draft,
  FIXED_ROWS,
  POSITIONS,
  POSITION_NAMES,
  PRESETS,
  type Position,
  ROWS,
  ROW_FLOOR,
  ROW_NAMES,
  type Row,
  allowed,
  changeOf,
  dirty,
  draftOf,
  heldWords,
  holds,
  presetOf,
  replacesOf,
  replayDraft,
  rowHeldWords,
} from "./prefs";

// M8b: your preferences (P14 section 1, D147), from the menu. One set for the repo (B-93n77): every row as five stops
// in words, the fixed rows locked and the floors kept (D146), the shadow switch (D148), the presets with what each would
// have held of your past cards (B-wwxa3, from `replay()`), and saving a new file over the one in force, which says
// plainly when that file has changed underneath you (409). The setup survey is reached again from here (B-5na1k).

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
  const rate = (r: number) => (r > 0 ? `about 1 in ${Math.round(1 / r)}` : "none");
  const s = routing.settings;

  return (
    <Panel label="Your preferences" onClose={p.onClose} id="prefs-panel" wide>
      <p className="sub">One set for this repo. Each row is a kind of decision, and its setting says whether one reaches you.</p>
      {routing.problem && (
        <p className="problem" role="alert">
          Your preferences can't be read, so “Today” applies, in shadow. Saving writes new ones.
        </p>
      )}

      <div className="pref-mode">
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
        <p className="soft">
          {draft.mode === "shadow"
            ? "Nothing is held back yet. Every card reaches you, and the record shows what these settings would have held."
            : "Cards on rows at the two lowest stops are held back: their agents go ahead, and a sample comes back to you."}
        </p>
      </div>

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

      <h5>Row by row</h5>
      <div className="pref-rows">
        <div className="pref-row legend" aria-hidden="true">
          <span />
          <div className="stops-legend">
            <span>Held back, your agents go ahead</span>
            <span>Reaches you</span>
          </div>
        </div>
        {ROWS.map((row) => (
          <PrefRow key={row} row={row} name={ROW_NAMES[row]} value={draft.rows[row]} note={ROW_FLOOR[row] ? `No lower than “${POSITION_NAMES[ROW_FLOOR[row]!]}”. ${rowHeldWords(replayed.rows[row])}.` : `${rowHeldWords(replayed.rows[row])}.`} onChange={(pos) => setRow(row, pos)} />
        ))}
        {FIXED_ROWS.map((row) => (
          <PrefRow key={row} row={row} name={ROW_NAMES[row]} value="never-without-me" note="Fixed: never without you." />
        ))}
      </div>
      <p className="sub after">
        Audits: {rate(s.rate_agent_decides)} of held cards at “{POSITION_NAMES["agent-decides"]}”, {rate(s.rate_sample)} at “{POSITION_NAMES.sample}”, and every one of each row's first {s.burn_in}.
      </p>

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

/** One row: five stops in words (P14), the two lowest holding cards back. A fixed row is locked; a floor can't be passed. */
function PrefRow(p: { row: Row | (typeof FIXED_ROWS)[number]; name: string; value: Position; note: string; onChange?: (p: Position) => void }) {
  const fixed = !p.onChange;
  return (
    <div className="pref-row" data-fixed={fixed || undefined}>
      <div className="pref-name">
        <b id={`row-${p.row}`}>{p.name}</b>
        <span className="soft">{p.note}</span>
      </div>
      <div className="stops" role="radiogroup" aria-labelledby={`row-${p.row}`}>
        {POSITIONS.map((pos) => {
          const ok = !fixed && allowed(p.row as Row, pos);
          return (
            <label key={pos} className={holds(pos) ? "stop holds" : "stop"} data-on={p.value === pos || undefined} data-off={!ok || undefined}>
              <input type="radio" name={`pref-${p.row}`} value={pos} checked={p.value === pos} disabled={!ok} onChange={() => p.onChange?.(pos)} />
              <span>{POSITION_NAMES[pos]}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
