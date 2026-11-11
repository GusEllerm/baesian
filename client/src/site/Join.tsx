import { useEffect, useState } from "react";
import { type Account, ApiError, call, day, projectName } from "./api";
import { go } from "./nav";
import { Go, Problem, Sheet, Shell, To } from "./Page";

// Joining a project by a link (P20, B-jsady): an owner makes the link and sends it themselves; its address is
// /join#<code>. The code is after the `#`, which a browser never sends to a server: the page reads it, takes it out of
// the address, and sends it only in the body of the two requests that look the link up and use it. Someone who isn't
// signed in signs in or signs up first, so the code is kept in this tab meanwhile (`keepJoinCode()`), and the site
// brings them back here once they're in.

const KEY = "baesian:join";
/** Set once the page has shown the link this tab keeps, so the site brings you to it once and no more. */
const SHOWN = "baesian:join:shown";

/** The code in the address's fragment, if this is a link: kept in this tab, and taken out of the address. */
export function keepJoinCode(): void {
  const code = location.hash.slice(1);
  if (!code) return;
  try {
    sessionStorage.setItem(KEY, code);
    sessionStorage.removeItem(SHOWN);
  } catch {
    // No storage here (a private window that refuses it): the link works only if you're signed in already.
    return;
  }
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

/** The link's code this tab is keeping, if any. */
export function joinCode(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) || location.hash.slice(1) || undefined;
  } catch {
    return location.hash.slice(1) || undefined;
  }
}

/** Whether this tab keeps a link the page hasn't shown yet: someone who signed up to use it lands on their projects first. */
export function joinWaiting(): boolean {
  try {
    return !!sessionStorage.getItem(KEY) && !sessionStorage.getItem(SHOWN);
  } catch {
    return false;
  }
}

/** Forget the link: it's used, it doesn't work, or you chose not to join. */
export function dropJoinCode(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(SHOWN);
  } catch {
    // nothing was kept
  }
}

/** What a link leads to (`POST /v1/account/invites/look`). */
interface Invite {
  project: string;
  name: string | null;
  by: string;
  expires: string;
  /** You're a member already. */
  member: boolean;
}

export function Join({ account, reload }: { account: Account; reload: () => Promise<void> }) {
  const [code] = useState(joinCode);
  const [invite, setInvite] = useState<Invite | "gone">();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    try {
      sessionStorage.setItem(SHOWN, "1");
    } catch {
      // nothing is kept here
    }
    if (!code) return setInvite("gone");
    call<Invite>("POST", "/v1/account/invites/look", { code }).then(setInvite, (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) {
        dropJoinCode();
        return setInvite("gone");
      }
      setProblem(e instanceof Error ? e.message : String(e));
    });
  }, [code]);

  const open = (project: string) => go(`/projects/${encodeURIComponent(project)}`, { replace: true });

  const join = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const r = await call<{ project: string }>("POST", "/v1/account/invites/accept", { code });
      dropJoinCode();
      await reload();
      open(r.project);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        dropJoinCode();
        setInvite("gone");
      } else setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (invite === "gone") {
    return (
      <Shell who={account.handle}>
        <Sheet title="This link doesn't work" lead="It was used already, it expired, or it was cancelled. A link adds one person, once, within seven days. Ask one of the project's owners for a new one.">
          <To to="/" className="confirm site-go">
            Go to your projects
          </To>
        </Sheet>
      </Shell>
    );
  }
  if (!invite) {
    return (
      <Shell who={account.handle}>
        <Sheet title="Join a project">
          <Problem text={problem} />
          {!problem && <p className="small">Looking up the link…</p>}
        </Sheet>
      </Shell>
    );
  }
  const name = projectName(invite);
  if (invite.member) {
    return (
      <Shell who={account.handle}>
        <Sheet title={`You're a member of ${name} already`} lead="The link hasn't been used: whoever sent it can still give it to someone else.">
          <Go
            onClick={() => {
              dropJoinCode();
              open(invite.project);
            }}
          >
            Open {name}
          </Go>
        </Sheet>
      </Shell>
    );
  }
  return (
    <Shell who={account.handle}>
      <Sheet title={`Join ${name}?`} lead={<><b>{invite.by}</b> sent you a link to join <b>{name}</b> as a member.</>}>
        <p>
          As a member you see every card its agents file and can answer any of them; your answers carry your name, <b>{account.handle}</b>, to the other members and into the project's record. You can sign your own machines in to it, and
          leave whenever you like. Its owners change its settings and rules.
        </p>
        <p className="small">The link works once, until {day(invite.expires)}.</p>
        <Problem text={problem} />
        <div className="site-actions">
          <Go busy={busy} onClick={() => void join()}>
            Join {name}
          </Go>
          <button
            type="button"
            className="switch"
            disabled={busy}
            onClick={() => {
              dropJoinCode();
              go("/", { replace: true });
            }}
          >
            Not now
          </button>
        </div>
      </Sheet>
    </Shell>
  );
}
