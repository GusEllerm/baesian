import { PRACTICE_FIELDS } from "./api.js";
import { PracticeEntry, describeError, newestFormat } from "./schema.js";

// Where practice answers are kept (B-rehdw, "On the service, for every device"; docs/vault/Design/Practice Cards.md
// section 5): an address of their own, apart from the state, on `baesian serve` (`GET` and `POST /api/practice`, a folder
// of the live layer, `PRACTICE_DIR`) and on the relay (`GET` and `POST .../practice`, a table of the project's object,
// `PracticeTable`, for a signed-in browser only). Both take an entry through `practiceEntry()`. Nothing an agent runs
// reads them: not `inbox`, `wait`, the MCP tools, the plugin's hooks, `sync`, the vault adapter or the gate.

/** The live layer's folder of practice entries, in a clone that isn't linked. Not one of the kinds the record copies. */
export const PRACTICE_DIR = "practice";

/** Why a practice entry wasn't taken, with the status the address answers. */
export class PracticeRefused extends Error {
  constructor(
    readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A practice entry from what the client sent and who sent it, checked against those already kept: only the fields a
 * practice entry may be sent with (`PRACTICE_FIELDS`), in its format; the blind test starts once; and an entry in the
 * test needs it started. Throws `PracticeRefused`.
 */
export function practiceEntry(input: unknown, who: { reviewer: string; account?: string; client: string }, earlier: readonly PracticeEntry[], at: string = new Date().toISOString()): PracticeEntry {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new PracticeRefused(400, "send a practice answer as a JSON object");
  const unknown = Object.keys(input).filter((k) => !PRACTICE_FIELDS.has(k));
  if (unknown.length) throw new PracticeRefused(400, `unexpected fields: ${unknown.join(", ")}`);
  const parsed = PracticeEntry.safeParse({ ...input, type: "practice", format: newestFormat("practice"), reviewer: who.reviewer, ...(who.account ? { account: who.account } : {}), client: who.client, at });
  if (!parsed.success) throw new PracticeRefused(400, `that practice answer isn't valid:\n${describeError(parsed.error)}`);
  const e = parsed.data;
  const started = earlier.some((x) => x.kind === "test-start");
  if (e.kind === "test-start" && started) throw new PracticeRefused(409, "the blind test has started already: it runs once");
  if ((e.kind === "mark" || (e.kind === "answer" && e.test)) && !started) throw new PracticeRefused(409, "the blind test hasn't started");
  return e;
}

/** Practice entries in the order they were written. */
export const inOrder = (entries: readonly PracticeEntry[]): PracticeEntry[] => [...entries].sort((a, b) => a.at.localeCompare(b.at));
