import { useState } from "react";
import { type RequestOptionsJSON, signWithPasskey } from "../webauthn";
import { ApiError, type Ceremony, call, useConfig, usePrepared } from "./api";

/** A sign-in's options (`POST /v1/signin/start`): any of the site's passkeys. */
const signinStart = () => call<Ceremony<RequestOptionsJSON>>("POST", "/v1/signin/start", {});
import { go, nextPage, takeFragment } from "./nav";
import { Go, Notice, Problem, Sheet, Shell, To } from "./Page";

// Signing in (M9c): with a passkey, any of this site's (discoverable), or through Globus (D176). A Globus round trip that
// went wrong comes back here with what happened in the address's fragment (`error`, `message`). A closed account (M9f,
// B-b46z3) isn't signed in: its passkey offers to restore it, within its 14 days; and the account page sends you here
// once you've deleted yours (`?closed=`), saying until when.

/** A date as the page says it. */
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** What the service says of a closed account's sign-in (409): whose, when it's deleted, and the flow that restores it. */
interface Closed {
  handle: string;
  deletes: string;
  restore: string;
}

export function SignIn({ onIn }: { onIn: () => Promise<void> }) {
  const config = useConfig();
  const [problem, setProblem] = useState<string | undefined>(() => takeFragment().get("message") ?? undefined);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Closed>();
  // Just deleted on the account page: until when it can be restored.
  const [justClosed] = useState(() => new URLSearchParams(location.search).get("closed") ?? undefined);
  // The passkey starts from the tap itself, with options fetched when the page opened (Safari's rule, M9e step 2).
  const start = usePrepared(signinStart);
  const signIn = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const c = start.take();
      const response = await signWithPasskey(c.options);
      await call("POST", "/v1/signin/finish", { flow: c.flow, response });
      await onIn();
      go(nextPage(), { replace: true });
    } catch (e) {
      const c = e instanceof ApiError && e.status === 409 ? (e.body.closed as Omit<Closed, "restore"> | undefined) : undefined;
      if (c && e instanceof ApiError && typeof e.body.restore === "string") setClosed({ ...c, restore: e.body.restore });
      else setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async (c: Closed) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await call("POST", "/v1/signin/restore", { restore: c.restore });
      await onIn();
      go("/account", { replace: true });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (closed) {
    return (
      <Shell>
        <Sheet title="This account is closed" lead={<>The account <b>{closed.handle}</b> will be deleted on {dayOf(closed.deletes)}, with every project it owns and all their cards and answers on the service. Restore it to keep it, as it was.</>}>
          <Problem text={problem} />
          <div className="site-actions">
            <Go busy={busy} onClick={() => void restore(closed)}>
              Restore my account
            </Go>
            <button type="button" className="switch site-alt" disabled={busy} onClick={() => setClosed(undefined)}>
              Leave it closed
            </button>
          </div>
          <p className="small">Restored, its machines sign in again with baesian login, and notifications are turned on again from your account.</p>
        </Sheet>
      </Shell>
    );
  }
  const next = nextPage("");
  return (
    <Shell>
      <Sheet
        title="Sign in"
        lead={
          next.startsWith("/device")
            ? "Sign in to approve the machine that's asking."
            : next.startsWith("/join")
              ? "Sign in to join the project you were sent a link to. New here? Create an account first: this tab keeps the link meanwhile."
              : "Use the passkey you made when you signed up: on this device, your phone, or a security key."
        }
      >
        {justClosed && <Notice text={`Your account is closed, and you're signed out. It will be deleted on ${dayOf(justClosed)}, with everything in it. To keep it, sign in with your passkey before then.`} />}
        <Problem text={problem} />
        <Go busy={busy} busyText="Waiting for your passkey…" disabled={!start.ready} onClick={() => void signIn()}>
          Sign in with your passkey
        </Go>
        {config?.globus && (
          <a className="switch site-alt" href="/v1/globus/start?purpose=signin">
            Sign in through Globus
          </a>
        )}
        <p className="small after">
          New here? <To to="/sign-up">Create an account</To>.
        </p>
        <p className="small">
          Lost every passkey? <To to="/recover">Get back in with your recovery code</To>.
        </p>
      </Sheet>
    </Shell>
  );
}
