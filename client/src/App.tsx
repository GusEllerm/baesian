import type { ReactNode } from "react";
import { Desk } from "./Desk";
import { useLiveState } from "./live";

// The client (M4 step 5): it signs in, reads the live layer, and hands it to the desk, where you answer.
// docs/vault/Design/Client Build.md.

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
  return <Desk state={live.state} fetchedAt={live.fetchedAt} />;
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
