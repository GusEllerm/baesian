import type { Fact } from "../src/schema.js";
import type { Store } from "../src/store.js";
import { BODY, draft } from "../test/helpers.js";

// Answered cards for your calibration's bars (D180): per row, how many you chose as the agent did without seeing its
// pick, came round to after its case, and overturned. `THIS_REPO` is Baesian's own record on 2026-11-05, the numbers
// the approved mockup was drawn with, so the browser tests can be looked at beside it.

export type Answers = { fact: Fact | undefined; agreed: number; cameRound: number; overturned: number };

export const THIS_REPO: Record<string, Answers> = {
  public_api: { fact: "public-api", agreed: 9, cameRound: 7, overturned: 1 },
  schema: { fact: "schema", agreed: 16, cameRound: 6, overturned: 1 },
  dependency: { fact: "dependency", agreed: 2, cameRound: 0, overturned: 0 },
  infra: { fact: "infra", agreed: 1, cameRound: 0, overturned: 0 },
  user_facing: { fact: "user-facing", agreed: 14, cameRound: 7, overturned: 2 },
  security: { fact: "security", agreed: 23, cameRound: 19, overturned: 1 },
  privacy: { fact: "privacy", agreed: 2, cameRound: 2, overturned: 1 },
  other: { fact: undefined, agreed: 0, cameRound: 1, overturned: 0 },
  data_loss: { fact: "data-loss", agreed: 2, cameRound: 1, overturned: 1 },
  money: { fact: "money", agreed: 4, cameRound: 2, overturned: 1 },
  publishes: { fact: "publishes", agreed: 2, cameRound: 1, overturned: 0 },
};

let n = 0;

/** Files and answers cards row by row, as `rows` says: blind first, then the final answer, as the desk records them. */
export function fileAnswered(store: Store, rows: Record<string, Answers> = THIS_REPO): void {
  for (const r of Object.values(rows)) {
    const ways = [
      [r.agreed, { response: "accept", first_choice: "proposal" }],
      [r.cameRound, { response: "accept", first_choice: "alternative" }],
      [r.overturned, { response: "alternative", choice: "Postgres", first_choice: "alternative" }],
    ] as const;
    for (const [count, verdict] of ways) {
      for (let i = 0; i < count; i++) {
        n += 1;
        const over = { title: `Answered ${n}`, question: `Which way for answered decision ${n}?`, topic: `answered${n}/q`, reverse: "cheap", touches: r.fact ? [r.fact] : [], wrong_if: "it breaks", check: "run it" };
        const id = store.fileCard(draft(over), BODY, { agent: "claude-code", force: true }).card.meta.id;
        store.addVerdict({ card: id, revision: 1, reviewer: "gus", client: "web", ...verdict } as Parameters<Store["addVerdict"]>[0]);
      }
    }
  }
}
