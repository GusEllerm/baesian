import { useCallback, useEffect, useState } from "react";
import { type Account, ApiError, type ProjectMember, type ProjectMembers, type Role, call, day, membersAddress, membersOf, projectName, reauthStart, reauthWith, useFresh, usePrepared } from "./api";
import { go } from "./nav";
import { Go, Notice, Problem, Sheet, Shell, ShownOnce, To } from "./Page";

// A project's members (P20): everyone who sees its cards and can answer any of them (B-r51ts). Its owners add someone by
// a link they send themselves, good once, for seven days (B-jsady), remove members, and say who else is an owner
// (B-rxbss); a member can leave. The account that made the project holds it: always an owner, and it can't leave.
// Making a link, and changing who owns the project, ask for your passkey afresh. Its address is the desk's, with
// /members after it.

/** What a member's row says of them: what they are in the project, and since when. */
export const memberLine = (m: ProjectMember): string => `${m.role === "owner" ? (m.holds ? "Owner, made the project" : "Owner") : "Member"} · joined ${day(m.joined)}`;

/** What the page says of the links that haven't been used: "One link hasn't been used yet. It works until 18 Nov 2026." */
export function linksLine(invites: { expires: string }[]): string | undefined {
  if (!invites.length) return undefined;
  const last = invites.map((i) => i.expires).sort().at(-1)!;
  return invites.length === 1 ? `One link hasn't been used yet. It works until ${day(last)}.` : `${invites.length} links haven't been used yet. The last works until ${day(last)}.`;
}

export function Members({ id, account, reload }: { id: string; account: Account; reload: () => Promise<void> }) {
  const [data, setData] = useState<ProjectMembers | "not-yours">();
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();
  /** A link just made: shown once, here. */
  const [link, setLink] = useState<{ link: string; expires: string }>();
  /** The member you've asked to remove, or yourself to leave: confirmed in their row before anything happens. */
  const [removing, setRemoving] = useState<string>();
  const freshNow = useFresh(account.fresh_until);
  const check = usePrepared(freshNow ? undefined : reauthStart);

  const load = useCallback(async () => {
    try {
      setData(await membersOf(id));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setData("not-yours");
      else setProblem(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const name = data && data !== "not-yours" ? projectName(data) : projectName({ name: account.projects.find((p) => p.id === id)?.name ?? null });
  useEffect(() => {
    document.title = `Members of ${name} · Baesian`;
    return () => {
      document.title = "Baesian";
    };
  }, [name]);

  const run = async (what: string, f: () => Promise<void>) => {
    setBusy(what);
    setProblem(undefined);
    setNotice(undefined);
    try {
      await f();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  /** What asks for your passkey afresh starts it from the tap itself, with options fetched before it (M9e step 2). */
  const fresh = async () => {
    if (freshNow) return;
    await reauthWith(check.take());
    await reload();
  };

  const makeLink = () =>
    run("link", async () => {
      await fresh();
      setLink(await call<{ link: string; expires: string }>("POST", membersAddress(id, "invites"), {}));
      await load();
    });

  const cancelLinks = () =>
    run("cancel", async () => {
      const r = await call<{ cancelled: number }>("DELETE", membersAddress(id, "invites"));
      setLink(undefined);
      await load();
      setNotice(r.cancelled === 1 ? "That link no longer works." : `Those ${r.cancelled} links no longer work.`);
    });

  const setRole = (m: ProjectMember, role: Role) =>
    run(`role:${m.account}`, async () => {
      await fresh();
      await call("PATCH", membersAddress(id, `members/${encodeURIComponent(m.account)}`), { role });
      await load();
      setNotice(role === "owner" ? `${m.handle} is an owner now.` : `${m.handle} is a member now, no longer an owner.`);
    });

  const remove = (m: ProjectMember) =>
    run(`remove:${m.account}`, async () => {
      await call("DELETE", membersAddress(id, `members/${encodeURIComponent(m.account)}`));
      setRemoving(undefined);
      if (m.you) {
        // Gone from it: its desk is no longer yours to open.
        await reload();
        return go("/", { replace: true });
      }
      await load();
      setNotice(`${m.handle} is no longer a member. Their machines are signed out of this project, and their answers stay.`);
    });

  if (data === "not-yours") {
    return (
      <Shell who={account.handle}>
        <Sheet title="Not one of your projects" lead="This address is for a project you aren't a member of, or one that doesn't exist. Your own projects are listed on your projects page.">
          <To to="/" className="confirm site-go">
            Go to your projects
          </To>
        </Sheet>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell who={account.handle}>
        <Sheet title={`Members of ${name}`}>
          <Problem text={problem} />
          {!problem && <p className="small">Loading…</p>}
        </Sheet>
      </Shell>
    );
  }

  const owner = data.role === "owner";
  const waiting = linksLine(data.invites ?? []);
  return (
    <Shell who={account.handle}>
      <Sheet
        title={`Members of ${name}`}
        lead={
          owner
            ? "Everyone here sees this project's cards and can answer any of them. A card is sent first to whoever runs the agent that filed it. Owners also add and remove members, and change the project's settings and rules."
            : "Everyone here sees this project's cards and can answer any of them. A card is sent first to whoever runs the agent that filed it. Its owners add and remove members, and change its settings and rules."
        }
      >
        <Notice text={notice} />
        <Problem text={problem} />
        <ul className="site-rows" aria-label="Members">
          {data.members.map((m) =>
            removing === m.account ? (
              <li key={m.account} className="site-row editing">
                <p>
                  {m.you ? (
                    <>
                      <b>Leave {name}?</b> You'll stop seeing its cards, and your machines are signed out of it. Your answers stay. To come back, an owner sends you a new link.
                    </>
                  ) : (
                    <>
                      <b>Remove {m.handle}?</b> They'll stop seeing this project's cards, and their machines are signed out of it. Their answers stay, and the cards sent to them become the owners'.
                    </>
                  )}
                </p>
                <div className="site-actions">
                  <button type="button" className="confirm" disabled={busy !== undefined} onClick={() => void remove(m)}>
                    {m.you ? "Leave the project" : `Remove ${m.handle}`}
                  </button>
                  <button type="button" className="cancel" disabled={busy !== undefined} onClick={() => setRemoving(undefined)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={m.account} className="site-row member">
                <span className="nm">
                  {m.handle}
                  {m.you && <span className="tag-here">you</span>}
                </span>
                <span className="st">{memberLine(m)}</span>
                {(owner || m.you) && !m.holds && (
                  <span className="ends">
                    {owner && !m.you && (
                      <button type="button" className="switch" disabled={busy !== undefined || !check.ready} onClick={() => void setRole(m, m.role === "owner" ? "member" : "owner")} aria-label={m.role === "owner" ? `Make ${m.handle} a member` : `Make ${m.handle} an owner`}>
                        {m.role === "owner" ? "Make a member" : "Make an owner"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="switch"
                      disabled={busy !== undefined}
                      aria-label={m.you ? "Leave this project" : `Remove ${m.handle}`}
                      onClick={() => {
                        setRemoving(m.account);
                        setNotice(undefined);
                        setProblem(undefined);
                      }}
                    >
                      {m.you ? "Leave" : "Remove"}
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
        <p className="small after">
          <To to={`/projects/${encodeURIComponent(id)}`}>Back to the desk</To>
        </p>
      </Sheet>

      {owner && (
        <Sheet title="Add someone" sub label="Add someone" lead="Make a link and send it to them yourself. It adds one person, once, and stops working after seven days. Baesian keeps no address for them.">
          {link ? (
            <ShownOnce
              label="The link"
              value={link.link}
              why={
                <>
                  Copy it now: it's shown once. Whoever opens it first, signed in, joins as a member, so send it only to the person you mean. It works until {day(link.expires)}.
                </>
              }
            />
          ) : (
            <Go busy={busy === "link"} busyText={freshNow ? "Making the link…" : "Waiting for your passkey…"} disabled={busy !== undefined || !check.ready} onClick={() => void makeLink()}>
              {freshNow ? "Make a link" : "Make a link with your passkey"}
            </Go>
          )}
          {link && (
            <button type="button" className="switch site-alt" disabled={busy !== undefined} onClick={() => setLink(undefined)}>
              Done
            </button>
          )}
          {waiting && (
            <p className="small">
              {waiting}{" "}
              <button type="button" className="link" disabled={busy !== undefined} onClick={() => void cancelLinks()}>
                {(data.invites ?? []).length === 1 ? "Cancel it" : "Cancel them"}
              </button>
            </p>
          )}
        </Sheet>
      )}
    </Shell>
  );
}
