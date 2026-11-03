import type { ApiCard, ApiContextNote, ApiPreferenceFile, ApiPresets, ApiRouting, ApiState } from "./api.js";
import { countedCards, replayCards, routingReport } from "./report.js";
import { ALL_ROWS, LEVEL_AT, POSITIONS, POSITION_NAMES, PRESETS, ROW_FLOOR, ROW_NAMES, SURVEY, SURVEY_QUESTION, type Row, isFixed, replay } from "./routing.js";
import type { Store } from "./store.js";
import { linkText } from "./wikilinks.js";

// The state the client reads (D96), apart from any server: `baesian serve` serves it over Node's HTTP server
// (src/server.ts), and the relay will serve the same from its Durable Object (B-17wn9, M9b). It imports nothing from
// Node, and reads only through the store, so it runs over a store with no repo (B-0ag7h).

/** What the state says that the store doesn't know: where it's served from, and the project's name. */
export interface StateContext {
  /** Changes whenever the live layer does; change events announce each new one (D96). */
  version: number;
  /** The server: its process, when it started, and how it watches the layer. */
  server: { pid: number; started: string; watch: ApiState["server"]["watch"] };
  project: ApiState["project"];
  /** A deck's context notes, resolved where there's a vault (M6). Without it, each link shows as its text. */
  notes?: (links: string[]) => ApiContextNote[];
  /** When the state is taken, in ms: a waiting marker is stale against it (D90). Default now. */
  now?: number;
}

/** A deck's context notes where there's no vault to resolve them in: each link, with what it shows. */
export const plainNotes = (links: string[]): ApiContextNote[] => links.map((link) => ({ link, text: linkText(link) }));

/** The state `GET /api/state` returns, read as one consistent view (D96). A file that can't be read is in `problems`. */
export function snapshot(store: Store, ctx: StateContext): ApiState {
  const problems: ApiState["problems"] = [];
  const notes = ctx.notes ?? plainNotes;
  return store.view(() => {
    const cards: ApiCard[] = [];
    const all = store.cardIds().flatMap((id) => store.card(id) ?? []);
    const dependents = new Map<string, string[]>();
    for (const c of all) for (const p of c.meta.depends_on) dependents.set(p, [...(dependents.get(p) ?? []), c.meta.id]);
    const nowMs = ctx.now ?? Date.now();
    for (const c of all) {
      const id = c.meta.id;
      try {
        const decision = store.decision(id);
        const status = store.status(id);
        const gate = store.gateRecord(id, c.meta.revision);
        cards.push({
          meta: c.meta,
          body: c.body,
          revisions: store.revisions(id).length,
          replied: store.revisions(id).some((r) => r.meta.reply !== undefined),
          status,
          ...(decision !== undefined ? { decision } : {}),
          canonicalTopic: store.canonicalTopic(c.meta.topic),
          verdicts: store.verdicts(id),
          dependents: dependents.get(id) ?? [],
          briefs: store.briefs(id),
          waiting: store.waitingOn(id, nowMs).map(({ marker, stale }) => ({ agent: marker.agent, since: marker.since, at: marker.at, stale })),
          fallbacks: store.fallbacks(id),
          attachments: store.attachments(id).length,
          ...(gate ? { gate } : {}),
          ...(status === "held" && gate?.drawn ? { audit: true as const } : {}),
        });
      } catch (e) {
        problems.push({ path: `cards/${id}`, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const presence = store.presence();
    return {
      version: ctx.version,
      server: { pid: ctx.server.pid, started: ctx.server.started, now: new Date(nowMs).toISOString(), watch: ctx.server.watch },
      project: ctx.project,
      ...(presence ? { presence } : {}),
      decks: store.decks().map((d) => ({ ...d, notes: notes(d.meta.context_notes) })),
      rules: store.rules(),
      cards,
      routing: routingState(store, problems),
      problems,
    };
  }, (path, error) => problems.push({ path, error }));
}

/** The preferences in force, their history, and the report per row (M8), for the state. */
function routingState(store: Store, problems: ApiState["problems"]): ApiRouting {
  const force = store.inForce();
  const history = store.preferenceNames().flatMap((name): ApiPreferenceFile[] => {
    const file = store.preferenceFile(name);
    return file ? [{ name, file }] : [];
  });
  let report: ApiRouting["report"];
  try {
    report = routingReport(store, force);
  } catch (e) {
    problems.push({ path: "preferences", error: e instanceof Error ? e.message : String(e) });
    report = { rows: {}, pooled: { shown: 0, held: 0, wouldHold: 0, drawn: 0, auditsAnswered: 0, auditsUnanswered: 0, answered: 0, misses: 0, switched: 0, blind: 0, matched: 0, streak: 0, recentMisses: 0 }, beforeGate: 0 };
  }
  return {
    ...(force.name && force.file ? { preferences: { name: force.name, file: force.file } } : {}),
    ...(force.problem ? { problem: force.problem } : {}),
    settings: force.settings,
    history,
    report,
  };
}

/** `GET /api/presets` (M8): the rows and positions, each preset and the settings in force replayed over past cards, and the setup survey. */
export function presets(store: Store): ApiPresets {
  return store.view(() => {
    const cards = replayCards(countedCards(store));
    const force = store.inForce();
    return {
      rows: ALL_ROWS.map((row) => ({ row, name: ROW_NAMES[row], ...(isFixed(row) ? { fixed: true as const } : ROW_FLOOR[row as Row] ? { floor: ROW_FLOOR[row as Row]! } : {}) })),
      positions: POSITIONS.map((position) => ({ position, name: POSITION_NAMES[position], ...(LEVEL_AT[position] ? { level: LEVEL_AT[position]! } : {}) })),
      presets: PRESETS.map((p) => {
        const settings = { ...force.settings, rows: p.rows };
        return { id: p.id, name: p.name, summary: p.summary, settings, replay: replay(cards, settings) };
      }),
      inForce: { settings: force.settings, replay: replay(cards, force.settings) },
      survey: { ...SURVEY_QUESTION, items: [...SURVEY] },
    };
    // A file that can't be read is left out, as the snapshot leaves it, rather than failing the request (D84).
  }, () => {});
}
