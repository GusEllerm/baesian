import type { ReactNode } from "react";
import type { ApiCard, ApiState } from "../../src/api";
import { useLiveState } from "./live";
import { byId, liveDependents, queue, serverNow, stakesLine, waitState } from "./model";

// M4 step 5a: the scaffold. It signs in, reads the live layer, and shows the first card to answer. Round 5's
// card, path and answering arrive in steps 5b to 5e (docs/vault/Design/Client Build.md).

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
  const now = serverNow(live.state, live.fetchedAt);
  const toAnswer = queue(live.state, now);
  const stopped = toAnswer.filter((c) => waitState(c, now) === "waiting").length;
  const first = toAnswer[0];
  const summary = toAnswer.length
    ? `${toAnswer.length} to answer.${stopped ? ` ${stopped === 1 ? "An agent has" : `${stopped} agents have`} stopped for you.` : ""}`
    : "Nothing to answer.";
  return (
    <Shell summary={summary}>
      {first ? <CardFace card={first} state={live.state} /> : <p className="notice">All caught up.</p>}
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

function CardFace({ card, state }: { card: ApiCard; state: ApiState }) {
  const m = card.meta;
  return (
    <article className="card" aria-label={m.question}>
      <p className="stakes">{stakesLine(card, liveDependents(card, byId(state)).length)}</p>
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
