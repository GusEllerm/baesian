import { useEffect, useState } from "react";
import { liveAddress } from "../endpoints";
import { type WaitingCounts, keepCounts, keptCounts } from "../kept";
import { listen } from "../live";
import { type Inbox, inboxLine, waitingIn } from "./inbox";
import { waitingByProject, waitingLine } from "../waiting";
import { type Account, ApiError, call, day, projectName } from "./api";
import { follow } from "./nav";
import { Field, Notice, Problem, Sheet, Shell, To } from "./Page";

// Your projects (M9e): each repo you've linked, and each you've joined (P20), by its name (B-zqkwk), opening its desk at
// /projects/{project}, the relay's own address for it (B-7z97x). Renamed here by an owner; the ID only in a tooltip
// (D69's spirit). Each has a link to its members.
// A project whose desk, in this tab, left answers waiting for your passkey says so (B-a6xpc). Each project has an inbox
// (B-fzr1e): how many cards wait for you there, asked of each project in parallel as the page opens (B-wgbdh), and again
// whenever a project says it changed (B-gty71), shown from what this tab last heard until the answers come (`kept.ts`).

/** Each project's inbox: its counts, or that asking failed; a project not yet answered isn't in the map. */
type Inboxes = Map<string, Inbox>;

/** An inbox tray (B-fzr1e): empty when nothing waits, holding a card, with the count, when something does. */
function InboxTray({ counts }: { counts: Inbox | undefined }) {
  const n = waitingIn(counts);
  return (
    <span className="inbox" data-full={n > 0 || undefined} aria-hidden="true">
      <svg width="34" height="30" viewBox="0 0 34 30">
        {/* A card resting in the tray, behind its front. */}
        {n > 0 && <rect className="inbox-card" x="10" y="4" width="14" height="15" rx="1.5" />}
        <path className="inbox-back" d="M4 17.5 8.2 8.5h17.6l4.2 9" />
        <path className="inbox-front" d="M4 17.5h7.25l1.6 3.1h8.3l1.6-3.1H30v7.25a1.75 1.75 0 0 1-1.75 1.75H5.75A1.75 1.75 0 0 1 4 24.75Z" />
      </svg>
      {n > 0 && <span className="inbox-count">{n > 99 ? "99+" : n}</span>}
    </span>
  );
}

/**
 * Each project's count of the cards waiting in it (`GET /v1/projects/{project}/waiting`), asked of every project at once
 * as the page opens (B-wgbdh), and of a project again whenever it says it changed (B-gty71): the page holds each
 * project's live connection (`listen()`), the one its desk uses, which says so as it opens, after every change, and when
 * it comes back after closing. So a card filed while the page is in view shows within a second or two, with no reload.
 * Every project is asked again, too, when the page comes back into view, should a connection be down. A project that
 * answers 401, 403 or 404 is listened to no more, until it answers again.
 */
function useInboxes(ids: readonly string[]): Inboxes {
  const key = ids.join(" ");
  const [inboxes, setInboxes] = useState<Inboxes>(() => new Map(ids.flatMap((id) => (keptCounts(id) ? [[id, keptCounts(id)!] as const] : []))));
  useEffect(() => {
    let stopped = false;
    const all = key ? key.split(" ") : [];
    // One ask of a project at a time: a change heard while one is on its way is asked about once it lands.
    const asking = new Set<string>();
    const again = new Set<string>();
    const stops = new Map<string, () => void>();
    /**
     * Hold a project's connection, unless it's held already. Its first word, as it opens, is asked about too: a card may
     * have come between the count and it. So is its closing, before it's opened again, which is how the page hears that
     * it's been refused.
     */
    const hear = (id: string) => {
      if (stopped || stops.has(id)) return;
      stops.set(id, listen(liveAddress(id), { changed: () => ask(id), reopening: () => ask(id) }));
    };
    /**
     * A project that refuses is listened to no more: signed out (here or in another tab), every connection; no longer
     * yours, its own. Left alone, each would be tried again every few seconds for as long as the page stayed open.
     */
    const refused = (id: string, status: number) => {
      const gone = status === 401 ? [...stops.keys()] : status === 403 || status === 404 ? [id] : [];
      for (const g of gone) {
        stops.get(g)?.();
        stops.delete(g);
      }
    };
    const ask = (id: string) => {
      if (stopped) return;
      if (asking.has(id)) return void again.add(id);
      asking.add(id);
      call<WaitingCounts>("GET", `/v1/projects/${encodeURIComponent(id)}/waiting`)
        .then(
          (c) => {
            keepCounts(id, { total: c.total, hard: c.hard, blocking: c.blocking, ...(c.yours ? { yours: { total: c.yours.total, hard: c.yours.hard, blocking: c.yours.blocking } } : {}) });
            if (!stopped) setInboxes((m) => new Map(m).set(id, c));
            // Answered again after a refusal (signed back in, in another tab): its connection is held again.
            hear(id);
          },
          (e: unknown) => {
            if (e instanceof ApiError) refused(id, e.status);
            // What was heard before stays; with nothing, the inbox says it couldn't check.
            if (!stopped) setInboxes((m) => (m.has(id) ? m : new Map(m).set(id, "failed")));
          },
        )
        .finally(() => {
          asking.delete(id);
          if (again.delete(id)) ask(id);
        });
    };
    all.forEach(ask);
    all.forEach(hear);
    const back = () => document.visibilityState === "visible" && all.forEach(ask);
    document.addEventListener("visibilitychange", back);
    return () => {
      stopped = true;
      for (const stop of stops.values()) stop();
      document.removeEventListener("visibilitychange", back);
    };
  }, [key]);
  return inboxes;
}

export function Projects({ account, reload, notice }: { account: Account; reload: () => Promise<void>; notice?: string | undefined }) {
  const [waiting] = useState(() => waitingByProject());
  const inboxes = useInboxes(account.projects.map((p) => p.id));
  const [renaming, setRenaming] = useState<string>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState<string | undefined>(notice);

  const save = async (id: string) => {
    setBusy(true);
    setProblem(undefined);
    try {
      const r = await call<{ name: string }>("PATCH", `/v1/account/projects/${encodeURIComponent(id)}`, { name });
      await reload();
      setRenaming(undefined);
      setDone(`Renamed: it's “${r.name}” now.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell who={account.handle}>
      <Sheet title="Your projects" lead={account.projects.length ? "Each is a repo whose agents send their decisions here, with an inbox of the cards waiting for you. Open one to answer them." : undefined}>
        <Notice text={done} />
        <Problem text={problem} />
        {account.projects.length === 0 ? (
          <div className="site-empty">
            <p>No projects yet.</p>
            <p className="small">
              A project is made when you approve its first machine. In a repo where Baesian is set up, run <code>baesian login --service {location.origin}</code>, then open the address it prints. To join someone else's project, ask
              one of its owners for a link.
            </p>
          </div>
        ) : (
          <ul className="site-rows">
            {account.projects.map((p) =>
              renaming === p.id ? (
                <li key={p.id} className="site-row editing">
                  <Field label={`A new name for ${projectName(p)}`} value={name} onChange={setName} maxLength={60} autoFocus autoComplete="off" />
                  <div className="site-actions">
                    <button type="button" className="confirm" disabled={busy || !name.trim()} onClick={() => void save(p.id)}>
                      Save the name
                    </button>
                    <button type="button" className="cancel" disabled={busy} onClick={() => setRenaming(undefined)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={p.id} className="site-row project">
                  <a className="open" href={`/projects/${encodeURIComponent(p.id)}`} onClick={follow(`/projects/${encodeURIComponent(p.id)}`)} title={p.id}>
                    <InboxTray counts={inboxes.get(p.id)} />
                    <span className="nm">{projectName(p)}</span>
                    <span className="st inbox-line" data-waiting={waitingIn(inboxes.get(p.id)) > 0 || undefined}>
                      {inboxLine(inboxes.get(p.id))}
                    </span>
                    <span className="st">{p.role === "owner" ? `Linked ${day(p.created)}` : `You're a member · linked ${day(p.created)}`}</span>
                    {waiting.has(p.id) && <span className="st waits">{waitingLine(waiting.get(p.id)!)}</span>}
                  </a>
                  <span className="ends">
                    <a className="switch" href={`/projects/${encodeURIComponent(p.id)}/members`} onClick={follow(`/projects/${encodeURIComponent(p.id)}/members`)} aria-label={`Members of ${projectName(p)}`}>
                      Members
                    </a>
                    {/* A project's name is its owners' to change (B-rxbss). */}
                    {p.role === "owner" && (
                      <button
                        type="button"
                        className="switch"
                        aria-label={`Rename ${projectName(p)}`}
                        onClick={() => {
                          setRenaming(p.id);
                          setName(p.name ?? "");
                          setDone(undefined);
                        }}
                      >
                        Rename
                      </button>
                    )}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
        <p className="small after">
          Approving a machine? <To to="/device">Enter its code</To>.
        </p>
      </Sheet>
    </Shell>
  );
}
