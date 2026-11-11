import { useEffect, useMemo, useState } from "react";
import { Desk } from "../Desk";
import { EndpointsContext, hostedEndpoints } from "../endpoints";
import { useHostedState } from "../live";
import { type Account, call } from "./api";
import { signInHere } from "./nav";
import { Sheet, Shell, To } from "./Page";

// A project's desk on the website (M9e): the same desk as `baesian serve`'s (D130), reading the relay's state as it reads
// the local server's (B-17wn9), hearing of changes over the relay's live socket (B-bv49e), and answering through the relay,
// with your passkey on a hard card (D139). Its address mirrors the relay's: /projects/{project} (B-7z97x). When a machine
// filed a burst of cards, so its cards don't notify for a while (M9e step 2, B-advkh), the desk says so.

/** A machine whose cards don't notify for now (`GET /v1/projects/{project}/pushes`). */
interface Paused {
  machine: string;
  cards: number;
  minutes: number;
  until: string;
}

/** What the desk says of a paused machine: "laptop filed 30 cards in 10 minutes, so its cards won't notify you until 15:40." */
export const pausedLine = (p: Paused) =>
  `${p.machine} filed ${p.cards} cards in ${p.minutes} minutes, so its cards won't notify you until ${new Date(p.until).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. They're all here.`;

export function Project({ id, account }: { id: string; account: Account }) {
  const name = account.projects.find((p) => p.id === id)?.name ?? null;
  const endpoints = useMemo(() => hostedEndpoints(id, name), [id, name]);
  const live = useHostedState(endpoints);
  const [paused, setPaused] = useState<Paused[]>([]);
  const version = live.kind === "ready" ? live.state.version : undefined;
  useEffect(() => {
    if (version === undefined) return;
    call<{ paused: Paused[] }>("GET", `/v1/projects/${encodeURIComponent(id)}/pushes`).then(
      (r) => setPaused(r.paused),
      () => {},
    );
  }, [id, version]);
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
        <Desk state={live.state} fetchedAt={live.fetchedAt} refreshing={!!live.refreshing} notice={paused.length ? paused.map(pausedLine).join(" ") : undefined} />
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
