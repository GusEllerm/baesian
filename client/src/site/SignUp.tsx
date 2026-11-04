import { useState } from "react";
import { type CreationOptionsJSON, makePasskey } from "../webauthn";
import { ApiError, call, useConfig } from "./api";
import { go, takeFragment } from "./nav";
import { Field, Go, Problem, Sheet, Shell, ShownOnce, To } from "./Page";
import { Turnstile } from "./Turnstile";

// Signing up (M9c, D153): an email address and the code sent to it, behind Turnstile (B-1a03b); a handle; then a passkey.
// Or, sent back from Globus (D176) with `#flow=…&via=globus`, only the handle and the passkey. Then the recovery code
// and the passkey's line for CI, each shown exactly once.

type Step =
  | { step: "email" }
  | { step: "code"; flow: string; email: string; globus: boolean }
  | { step: "passkey"; flow: string; options: CreationOptionsJSON; handle: string }
  | { step: "done"; handle: string; recovery: string; pin: string };

/** Turn the service's reason into what to do, where it knows more. */
const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SignUp({ onIn }: { onIn: () => Promise<void> }) {
  const config = useConfig();
  const [step, setStep] = useState<Step>(() => {
    const f = takeFragment();
    const flow = f.get("flow");
    return flow && f.get("via") === "globus" ? { step: "code", flow, email: "", globus: true } : { step: "email" };
  });
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string>();
  const [resetBot, setResetBot] = useState(0);
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await f();
    } catch (e) {
      setProblem(why(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      try {
        const r = await call<{ flow: string }>("POST", "/v1/signup/email", { email, turnstile: token });
        setStep({ step: "code", flow: r.flow, email: email.trim(), globus: false });
      } finally {
        // A token is used once: the widget gives a new one for the next try.
        setToken(undefined);
        setResetBot((n) => n + 1);
      }
    });

  const check = (s: Extract<Step, { step: "code" }>) =>
    run(async () => {
      try {
        const r = await call<{ options: CreationOptionsJSON }>("POST", "/v1/signup/verify", { flow: s.flow, ...(s.globus ? {} : { code: code.trim() }), handle: handle.trim() });
        setStep({ step: "passkey", flow: s.flow, options: r.options, handle: handle.trim() });
      } catch (e) {
        if (e instanceof ApiError && typeof e.body.attempts_left === "number" && e.body.attempts_left > 0) {
          throw new Error(`${e.message}: ${e.body.attempts_left} ${e.body.attempts_left === 1 ? "try" : "tries"} left`);
        }
        throw e;
      }
    });

  const makeIt = (s: Extract<Step, { step: "passkey" }>) =>
    run(async () => {
      const response = await makePasskey(s.options);
      const r = await call<{ recovery_code: string; passkey: { pin: string } }>("POST", "/v1/signup/finish", { flow: s.flow, response });
      await onIn();
      setStep({ step: "done", handle: s.handle, recovery: r.recovery_code, pin: r.passkey.pin });
    });

  if (step.step === "done") {
    return (
      <Shell who={step.handle}>
        <Sheet title="Save your recovery code" lead={<>Your account is made, and this browser is signed in as <b>{step.handle}</b>.</>}>
          <ShownOnce
            label="Your recovery code"
            value={step.recovery}
            mono="big"
            why="If you lose every passkey, this code and one we email you get you back in. It's shown only now: keep it in your password manager, or on paper somewhere safe."
          />
          <ShownOnce
            label="Your passkey's line for CI"
            value={step.pin}
            why={
              <>
                For <code>baesian verify</code> to count the hard cards you answer with this passkey, add this line to your CI's <code>BAESIAN_TRUST</code> setting. It's shown only now; each passkey you add gives its own.
              </>
            }
          />
          <label className="site-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I've saved my recovery code</span>
          </label>
          <Go disabled={!saved} onClick={() => go("/", { replace: true })}>
            Go to your projects
          </Go>
        </Sheet>
      </Shell>
    );
  }

  if (step.step === "passkey") {
    return (
      <Shell>
        <Sheet
          title="Make your passkey"
          lead="Your passkey signs you in, and confirms your answers on hard cards, so they're known to be yours. Your device asks for your face, your fingerprint or its screen lock; nothing like a password is sent."
        >
          <Problem text={problem} />
          <Go busy={busy} busyText="Waiting for your passkey…" onClick={() => void makeIt(step)}>
            Make a passkey
          </Go>
        </Sheet>
      </Shell>
    );
  }

  if (step.step === "code") {
    return (
      <Shell>
        <Sheet
          title={step.globus ? "Choose your handle" : "Check your email"}
          lead={
            step.globus ? (
              "Globus says who you are. Choose the handle your answers will carry, then make a passkey: it's how you sign in from now on, and how you confirm hard answers."
            ) : (
              <>
                We sent a six-digit code to <b>{step.email}</b>. It works for 15 minutes.
              </>
            )
          }
        >
          <Problem text={problem} />
          {!step.globus && <Field label="The code from the email" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={12} autoFocus mono />}
          <Field
            label="Your handle"
            hint="How the record names you beside your answers: 2 to 32 letters, digits, dots, dashes or underscores."
            value={handle}
            onChange={setHandle}
            autoComplete="username"
            maxLength={32}
            autoFocus={step.globus}
          />
          <Go busy={busy} disabled={(!step.globus && !code.trim()) || !handle.trim()} onClick={() => void check(step)}>
            Continue
          </Go>
          {!step.globus && (
            <p className="small after">
              No email? Check your spam folder, or{" "}
              <button type="button" className="link" onClick={() => setStep({ step: "email" })}>
                send another code
              </button>
              .
            </p>
          )}
        </Sheet>
      </Shell>
    );
  }

  return (
    <Shell>
      <Sheet title="Create your account" lead="Your agents file their decisions as cards; here you answer them, from a laptop or a phone. First, your email address: we'll send a code to check it's yours.">
        <Problem text={problem} />
        <Field label="Email address" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} autoFocus />
        {config ? <Turnstile siteKey={config.turnstile_site_key} onToken={setToken} reset={resetBot} /> : <p className="small">Loading the bot check…</p>}
        <Go busy={busy} disabled={!email.includes("@") || !token} onClick={() => void sendCode()}>
          Email me a code
        </Go>
        {config?.globus && (
          <a className="switch site-alt" href="/v1/globus/start?purpose=signin">
            Sign up through Globus instead
          </a>
        )}
        <p className="small after">
          Have an account? <To to="/sign-in">Sign in</To>.
        </p>
      </Sheet>
    </Shell>
  );
}
