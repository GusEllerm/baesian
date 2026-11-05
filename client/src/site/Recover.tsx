import { useState } from "react";
import { type CreationOptionsJSON, makePasskey } from "../webauthn";
import { ApiError, call, useConfig } from "./api";
import { go } from "./nav";
import { Field, Go, Problem, Sheet, Shell, ShownOnce, To } from "./Page";
import { Turnstile } from "./Turnstile";

// Getting back in after losing every passkey (B-jzgy4): an emailed code and the recovery code you saved, together, then
// a new passkey. Every other sign-in is ended, a notice is emailed, and a new recovery code is shown, once. The new
// passkey's line for CI is on the account page, beside it, any time (B-yj5d5).

type Step =
  | { step: "email" }
  | { step: "codes"; flow: string; email: string }
  | { step: "passkey"; flow: string; options: CreationOptionsJSON }
  | { step: "done"; handle: string; recovery: string };

export function Recover({ onIn }: { onIn: () => Promise<void> }) {
  const config = useConfig();
  const [step, setStep] = useState<Step>({ step: "email" });
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string>();
  const [resetBot, setResetBot] = useState(0);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await f();
    } catch (e) {
      if (e instanceof ApiError && typeof e.body.attempts_left === "number" && e.body.attempts_left > 0) {
        setProblem(`${e.message}: ${e.body.attempts_left} ${e.body.attempts_left === 1 ? "try" : "tries"} left`);
      } else setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (step.step === "done") {
    return (
      <Shell who={step.handle}>
        <Sheet title="You're back in" lead={<>Your new passkey is added, and this browser is signed in as <b>{step.handle}</b>. Every other sign-in was ended, and we emailed you a notice.</>}>
          <ShownOnce label="Your new recovery code" value={step.recovery} mono="big" why="The one you used is spent. Keep this one where you kept it: it's shown only now." />
          <label className="site-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I've saved my new recovery code</span>
          </label>
          <Go disabled={!saved} onClick={() => go("/", { replace: true })}>
            Go to your projects
          </Go>
          <p className="small">
            The hard cards you answer with the new passkey count in CI once its line is in your CI's <code>BAESIAN_TRUST</code>. Your account page has it, beside the passkey.
          </p>
        </Sheet>
      </Shell>
    );
  }

  if (step.step === "passkey") {
    return (
      <Shell>
        <Sheet title="Make a new passkey" lead="The codes match. Make a passkey on this device: it signs you in from now on, and confirms your answers on hard cards.">
          <Problem text={problem} />
          <Go
            busy={busy}
            busyText="Waiting for your passkey…"
            onClick={() =>
              void run(async () => {
                const response = await makePasskey(step.options);
                const r = await call<{ account: { handle: string }; recovery_code: string }>("POST", "/v1/recover/finish", { flow: step.flow, response });
                await onIn();
                setStep({ step: "done", handle: r.account.handle, recovery: r.recovery_code });
              })
            }
          >
            Make a passkey
          </Go>
        </Sheet>
      </Shell>
    );
  }

  if (step.step === "codes") {
    return (
      <Shell>
        <Sheet
          title="Enter both codes"
          lead={
            <>
              If <b>{step.email}</b> has an account, we've emailed it a six-digit code, which works for 15 minutes. You need it and the recovery code you saved when you signed up.
            </>
          }
        >
          <Problem text={problem} />
          <Field label="The code from the email" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={12} autoFocus mono />
          <Field label="Your recovery code" hint="Four groups of five letters and digits; dashes and spaces don't matter." value={recovery} onChange={setRecovery} autoComplete="off" maxLength={40} mono />
          <Go
            busy={busy}
            disabled={!code.trim() || !recovery.trim()}
            onClick={() =>
              void run(async () => {
                const r = await call<{ options: CreationOptionsJSON }>("POST", "/v1/recover/verify", { flow: step.flow, code: code.trim(), recovery_code: recovery });
                setStep({ step: "passkey", flow: step.flow, options: r.options });
              })
            }
          >
            Continue
          </Go>
          <p className="small after">
            No email? Check your spam folder, or{" "}
            <button type="button" className="link" onClick={() => setStep({ step: "email" })}>
              start again
            </button>
            .
          </p>
        </Sheet>
      </Shell>
    );
  }

  return (
    <Shell>
      <Sheet
        title="Get back in"
        lead="Lost every passkey? We'll email a code to your account's address. With it and the recovery code you saved, you make a new passkey. If you still have a passkey, sign in with it instead."
      >
        <Problem text={problem} />
        <Field label="Your account's email address" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} autoFocus />
        {config ? <Turnstile siteKey={config.turnstile_site_key} onToken={setToken} reset={resetBot} /> : <p className="small">Loading the bot check…</p>}
        <Go
          busy={busy}
          disabled={!email.includes("@") || !token}
          onClick={() =>
            void run(async () => {
              try {
                const r = await call<{ flow: string }>("POST", "/v1/recover/email", { email, turnstile: token });
                setStep({ step: "codes", flow: r.flow, email: email.trim() });
              } finally {
                setToken(undefined);
                setResetBot((n) => n + 1);
              }
            })
          }
        >
          Email me a code
        </Go>
        <p className="small after">
          Have a passkey? <To to="/sign-in">Sign in</To>.
        </p>
      </Sheet>
    </Shell>
  );
}
