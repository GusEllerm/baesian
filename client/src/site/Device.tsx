import { useEffect, useState } from "react";
import { ApiError, call, projectName, reauthStart, reauthWith, useFresh, usePrepared } from "./api";
import { Field, Go, Problem, Sheet, Shell, To } from "./Page";

// Approving a machine (B-t5wxr, B-84e0d): `baesian login` prints a code and this page's address. The page says which
// machine asks for which project, and that approving it lets it file cards and hear answers, never answer. A project the
// service hasn't seen is made by approving, yours, so the page says so plainly and asks what to call it (B-zqkwk). Approving
// asks for your passkey afresh (M9c).

interface Asked {
  machine: string;
  project: string;
  new_project: boolean;
  yours: boolean;
  name?: string | null;
  expires: string;
}

type Step = { step: "code" } | { step: "asked"; code: string; asked: Asked } | { step: "approved"; machine: string; project: string; name: string | null } | { step: "refused"; machine: string };

/** The code as `baesian login` prints it: XXXX-XXXX, whatever was typed. */
const tidy = (code: string) => {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : code.trim().toUpperCase();
};

export function Device({ handle, freshUntil }: { handle: string; freshUntil: string }) {
  const given = new URLSearchParams(location.search).get("code") ?? "";
  const [code, setCode] = useState(given);
  const [step, setStep] = useState<Step>({ step: "code" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const freshNow = useFresh(freshUntil);
  const check = usePrepared(freshNow ? undefined : reauthStart);

  const look = async (c: string) => {
    setBusy("look");
    setProblem(undefined);
    try {
      const asked = await call<Asked>("GET", `/v1/account/machines/approve?code=${encodeURIComponent(tidy(c))}`);
      setStep({ step: "asked", code: tidy(c), asked });
    } catch (e) {
      setStep({ step: "code" });
      setProblem(e instanceof ApiError && e.status === 404 ? "no machine is waiting with that code. Codes last 10 minutes: run baesian login again for a new one" : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };
  useEffect(() => {
    if (given) void look(given);
  }, []);

  const answer = async (s: Extract<Step, { step: "asked" }>, approve: boolean) => {
    setBusy(approve ? "approve" : "refuse");
    setProblem(undefined);
    try {
      if (!approve) {
        await call("POST", "/v1/account/machines/approve", { code: s.code, approve: false });
        return setStep({ step: "refused", machine: s.asked.machine });
      }
      // The passkey is checked afresh first, when the last check is old, started by this tap with options fetched before it.
      if (!freshNow) await reauthWith(check.take());
      const r = await call<{ machine: string; project: string; name: string | null }>("POST", "/v1/account/machines/approve", { code: s.code, approve: true, ...(s.asked.new_project ? { name } : {}) });
      setStep({ step: "approved", machine: r.machine, project: r.project, name: r.name });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  if (step.step === "approved") {
    return (
      <Shell who={handle}>
        <Sheet title="Machine approved" lead={<><b>{step.machine}</b> is signed in to <b>{projectName(step)}</b>. Back in your terminal, <code>baesian login</code> carries on by itself.</>}>
          <To to={`/projects/${encodeURIComponent(step.project)}`} className="confirm site-go">
            Open {projectName(step)}
          </To>
        </Sheet>
      </Shell>
    );
  }
  if (step.step === "refused") {
    return (
      <Shell who={handle}>
        <Sheet title="Machine refused" lead={<><b>{step.machine}</b> wasn't signed in, and nothing was made. <code>baesian login</code> says so in your terminal.</>}>
          <To to="/" className="switch site-alt">
            Go to your projects
          </To>
        </Sheet>
      </Shell>
    );
  }
  if (step.step === "asked") {
    const a = step.asked;
    const where = a.new_project ? "a new project" : a.yours ? projectName({ name: a.name ?? null }) : "a project you aren't a member of";
    return (
      <Shell who={handle}>
        <Sheet title="Sign in a machine?" lead={<><b>{a.machine}</b> asks to sign in to <b>{where}</b>.</>}>
          <p className="site-code">
            Check that your terminal shows this code: <b>{step.code}</b>
          </p>
          <p>
            If you approve, it can file cards and hear {a.new_project ? "your answers" : "the answers to them"} in this project. It can never answer them: only {a.new_project ? "you" : "a person"} can, here.
            {!a.new_project && a.yours && " The cards its agents file are sent to you first."}
          </p>
          {a.new_project && (
            <div className="site-callout">
              <p>
                <b>Approving makes a new project, owned by you.</b> Its cards come from this repo, and only you answer them, until you add someone else to it.
              </p>
              <Field
                label="What should it be called?"
                hint="Any name you like, up to 60 characters. It's kept on the service and shown on your pages and devices; your repo's own name is never sent."
                value={name}
                onChange={setName}
                autoComplete="off"
                maxLength={60}
                autoFocus
              />
            </div>
          )}
          {!a.yours && (
            <div className="site-callout">
              <p>
                <b>You aren't a member of this project,</b> so this machine can't sign in to it here. Refuse it. To join the project, ask one of its owners for a link, then run <code>baesian login</code> again. To answer this repo's cards in a project of your own instead, take <code>service</code> and <code>project</code> out of the repo's <code>.baesian/config.json</code> first: <code>baesian login</code> then links the repo as a new project of yours.
              </p>
            </div>
          )}
          <Problem text={problem} />
          <div className="site-actions">
            {a.yours && (
              <Go busy={busy === "approve"} busyText="Waiting for your passkey…" disabled={(a.new_project && !name.trim()) || busy !== undefined || !check.ready} onClick={() => void answer(step, true)}>
                Approve with your passkey
              </Go>
            )}
            <button type="button" className="switch" disabled={busy !== undefined} onClick={() => void answer(step, false)}>
              Refuse
            </button>
          </div>
        </Sheet>
      </Shell>
    );
  }
  return (
    <Shell who={handle}>
      <Sheet title="Approve a machine" lead="Type the code that baesian login printed in your terminal.">
        <Problem text={problem} />
        <Field label="The code" hint="Eight letters, like BCDF-GHJK." value={code} onChange={setCode} autoComplete="off" maxLength={12} autoFocus mono />
        <Go busy={busy === "look"} disabled={tidy(code).length !== 9} onClick={() => void look(code)}>
          Continue
        </Go>
        <p className="small after">
          No code? In the repo, run <code>baesian login</code>.
        </p>
      </Sheet>
    </Shell>
  );
}
