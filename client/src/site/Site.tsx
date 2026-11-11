import { useEffect, useRef, useState } from "react";
import { keptFor } from "../kept";
import { useMe } from "./api";
import { Account } from "./Account";
import { Counts } from "./Counts";
import { Device } from "./Device";
import { Join, joinWaiting, keepJoinCode } from "./Join";
import { Members } from "./Members";
import { go, signInHere, takeFragment, useWhere } from "./nav";
import { Go, Problem, Sheet, Shell, To } from "./Page";
import { Project } from "./Project";
import { Privacy } from "./Privacy";
import { Projects } from "./Projects";
import { Recover } from "./Recover";
import { SignIn } from "./SignIn";
import { SignUp } from "./SignUp";

// The website (M9e): the same React app as the desktop client (D130), built for the Worker to serve (`npm run build`'s
// site build, dist/site/). These are its pages; M9c's service redirects to them by these addresses.
//   /                   your projects, or, signed out, what Baesian is and how to get in
//   /sign-up            sign up: email, its code, Turnstile, a handle, a passkey (or from Globus: a handle, a passkey)
//   /sign-in            sign in with a passkey, or through Globus
//   /recover            get back in with an emailed code and your recovery code
//   /account            passkeys, sign-ins, machines, Globus, signing out
//   /device?code=       approve a machine `baesian login` is signing in
//   /counts             what the service counts of its use, every field (D141, B-7nq85): anyone may open it
//   /privacy            the privacy policy (M9f): anyone may open it
//   /projects/{project} the project's desk
//   /projects/{project}/members  its members, and for an owner the link that adds one (P20)
//   /join#{code}        join a project by a link its owner sent (P20, B-jsady)

// A link to join a project carries its code after the `#`: it's kept in this tab and taken out of the address before
// anything else happens, since signing in first would lose it.
if (location.pathname === "/join") keepJoinCode();

/** The pages anyone may open; every other needs you signed in. */
const OPEN = new Set(["/sign-up", "/sign-in", "/recover", "/counts", "/privacy"]);

export function Site() {
  const where = useWhere();
  const path = where.split("?")[0]!.replace(/\/+$/, "") || "/";
  const me = useMe();
  // Signed in through Globus (M9c): the service sends you to / with your handle in the fragment.
  const [welcome] = useState(() => {
    if (path !== "/" || !location.hash) return undefined;
    const f = takeFragment();
    return f.get("signed_in") ? `Signed in through Globus as ${f.get("signed_in")}.` : undefined;
  });
  // Each page reads the account afresh: a page before it may have changed it (a project made, a passkey added). The
  // first page doesn't: `useMe()` has just read it.
  const reload = me.reload;
  const shown = useRef(path);
  useEffect(() => {
    if (shown.current === path) return;
    shown.current = path;
    void reload();
  }, [path, reload]);
  // What this tab kept is for whoever is signed in now: another account, or nobody, starts afresh (B-9n2c3).
  const signedIn = me.kind === "in" ? me.account.id : me.kind === "signed-out" ? null : undefined;
  if (signedIn !== undefined) keptFor(signedIn ?? undefined);
  const needsIn = !OPEN.has(path) && path !== "/";
  useEffect(() => {
    if (needsIn && me.kind === "signed-out") signInHere();
  }, [needsIn, me.kind]);
  // Someone who signed up, or came in through Globus, to use a link lands on their projects: the link is shown next, once.
  const toJoin = path === "/" && me.kind === "in" && joinWaiting();
  useEffect(() => {
    if (toJoin) go("/join", { replace: true });
  }, [toJoin]);
  if (path === "/sign-up") return <SignUp onIn={me.reload} />;
  if (path === "/sign-in") return <SignIn onIn={me.reload} />;
  if (path === "/recover") return <Recover onIn={me.reload} />;
  if (path === "/counts") return <Counts who={me.kind === "in" ? me.account.handle : undefined} />;
  if (path === "/privacy") return <Privacy who={me.kind === "in" ? me.account.handle : undefined} />;

  if (me.kind === "loading") return <Shell>{null}</Shell>;
  if (me.kind === "error") {
    return (
      <Shell>
        <Sheet title="The service didn't answer">
          <Problem text={`${me.message}`} />
          <Go onClick={() => void me.reload()}>Try again</Go>
        </Sheet>
      </Shell>
    );
  }
  if (me.kind === "signed-out") return path === "/" ? <Welcome /> : <Shell>{null}</Shell>;

  const account = me.account;
  if (path === "/") return <Projects account={account} reload={me.reload} notice={welcome} />;
  if (path === "/account") return <Account account={account} reload={me.reload} />;
  if (path === "/device") return <Device handle={account.handle} freshUntil={account.fresh_until} />;
  if (path === "/join") return <Join account={account} reload={me.reload} />;
  const project = /^\/projects\/([^/]+)$/.exec(path)?.[1];
  if (project) return <Project key={project} id={decodeURIComponent(project)} account={account} />;
  const members = /^\/projects\/([^/]+)\/members$/.exec(path)?.[1];
  if (members) return <Members key={members} id={decodeURIComponent(members)} account={account} reload={me.reload} />;
  return (
    <Shell who={account.handle}>
      <Sheet title="No page here" lead="This address isn't one of the site's pages.">
        <To to="/" className="confirm site-go">
          Go to your projects
        </To>
      </Sheet>
    </Shell>
  );
}

/** Signed out, at the front door. */
function Welcome() {
  return (
    <Shell>
      <Sheet
        title="Answer your agents' decisions"
        lead="Your coding agents file the design decisions they shouldn't make alone as cards. Here you answer them, from a laptop or a phone, and the answers go back to the agents and into the repo's record."
      >
        <div className="site-actions">
          <To to="/sign-in" className="confirm site-go">
            Sign in
          </To>
          <To to="/sign-up" className="switch site-alt">
            Create an account
          </To>
        </div>
      </Sheet>
    </Shell>
  );
}
