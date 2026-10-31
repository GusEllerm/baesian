import type { ReactNode } from "react";
import type { ApiCard } from "../../src/api";
import { useLiveState } from "./live";

// M4 step 5a: the scaffold. It signs in, reads the live layer, and shows the first card to answer. Round 5's
// card, path and answering arrive in steps 5b to 5e (docs/vault/Design/Client Build.md).

// Cards waiting on the reviewer. Step 5b replaces this with round 5's queue.
const TO_ANSWER = new Set(["open", "rerouted"]);

export function App() {
  const live = useLiveState();
  if (live.kind === "loading") return <Shell summary="" />;
  if (live.kind === "signed-out") {
    return (
      <Shell summary="">
        <p className="notice">Open the address <code>baesian serve</code> printed. It signs this browser in.</p>
      </Shell>
    );
  }
  if (live.kind === "error") {
    return (
      <Shell summary="">
        <p className="notice">Couldn't reach the server: {live.message}. Is <code>baesian serve</code> still running?</p>
      </Shell>
    );
  }
  const toAnswer = live.state.cards.filter((c) => TO_ANSWER.has(c.status));
  const first = toAnswer[0];
  return (
    <Shell summary={toAnswer.length ? `${toAnswer.length} to answer.` : "Nothing to answer."}>
      {first ? <CardFace card={first} /> : <p className="notice">All caught up.</p>}
    </Shell>
  );
}

function Shell({ summary, children }: { summary: string; children?: ReactNode }) {
  return (
    <>
      <header className="bar">
        <span className="wordmark">Baesian</span>
        <p className="summary" aria-live="polite">{summary}</p>
      </header>
      <main className="desk">{children}</main>
    </>
  );
}

function CardFace({ card }: { card: ApiCard }) {
  const m = card.meta;
  return (
    <article className="card" aria-label={m.question}>
      <p className="doing">
        <b>{m.source_agent}</b> is {m.doing}
      </p>
      <h1>{m.question}</h1>
      <p className="crux">
        <span className="lbl">It turns on</span> {m.crux}
      </p>
    </article>
  );
}
