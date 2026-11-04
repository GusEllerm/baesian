import { useState } from "react";
import { type RequestOptionsJSON, signWithPasskey } from "../webauthn";
import { call, useConfig } from "./api";
import { go, nextPage, takeFragment } from "./nav";
import { Go, Problem, Sheet, Shell, To } from "./Page";

// Signing in (M9c): with a passkey, any of this site's (discoverable), or through Globus (D176). A Globus round trip that
// went wrong comes back here with what happened in the address's fragment (`error`, `message`).

export function SignIn({ onIn }: { onIn: () => Promise<void> }) {
  const config = useConfig();
  const [problem, setProblem] = useState<string | undefined>(() => takeFragment().get("message") ?? undefined);
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const start = await call<{ flow: string; options: RequestOptionsJSON }>("POST", "/v1/signin/start", {});
      await call("POST", "/v1/signin/finish", { flow: start.flow, response: await signWithPasskey(start.options) });
      await onIn();
      go(nextPage(), { replace: true });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const next = nextPage("");
  return (
    <Shell>
      <Sheet title="Sign in" lead={next.startsWith("/device") ? "Sign in to approve the machine that's asking." : "Use the passkey you made when you signed up: on this device, your phone, or a security key."}>
        <Problem text={problem} />
        <Go busy={busy} busyText="Waiting for your passkey…" onClick={() => void signIn()}>
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
