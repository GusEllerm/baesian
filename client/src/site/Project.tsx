import { useEffect, useMemo } from "react";
import { Desk } from "../Desk";
import { EndpointsContext, hostedEndpoints } from "../endpoints";
import { useHostedState } from "../live";
import type { Account } from "./api";
import { signInHere } from "./nav";
import { Sheet, Shell, To } from "./Page";

// A project's desk on the website (M9e): the same desk as `baesian serve`'s (D130), reading the relay's state as it reads
// the local server's (B-17wn9), hearing of changes over the relay's live socket (B-bv49e), and answering through the relay,
// with your passkey on a hard card (D139). Its address mirrors the relay's: /projects/{project} (B-7z97x).

export function Project({ id, account }: { id: string; account: Account }) {
  const name = account.projects.find((p) => p.id === id)?.name ?? null;
  const endpoints = useMemo(() => hostedEndpoints(id, name), [id, name]);
  const live = useHostedState(endpoints);
  useEffect(() => {
    if (live.kind === "signed-out") signInHere();
  }, [live.kind]);
  useEffect(() => {
    document.title = name ? `${name} · Baesian` : "Baesian";
    return () => {
      document.title = "Baesian";
    };
  }, [name]);
  if (live.kind === "ready") {
    return (
      <EndpointsContext.Provider value={endpoints}>
        <Desk state={live.state} fetchedAt={live.fetchedAt} />
      </EndpointsContext.Provider>
    );
  }
  if (live.kind === "not-yours") {
    return (
      <Shell who={account.handle}>
        <Sheet title="Not one of your projects" lead="This address is for a project your account doesn't own, or one that doesn't exist. Your own projects are listed on your projects page.">
          <To to="/" className="confirm site-go">
            Go to your projects
          </To>
        </Sheet>
      </Shell>
    );
  }
  if (live.kind === "error") {
    return (
      <Shell who={account.handle}>
        <Sheet title="The project didn't load" lead={`${live.message[0]!.toUpperCase()}${live.message.slice(1)}. Check your connection; the page tries again when the service is back.`} />
      </Shell>
    );
  }
  return <Shell who={account.handle}>{null}</Shell>;
}
