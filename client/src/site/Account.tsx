import { useEffect, useState } from "react";
import { type CreationOptionsJSON, makePasskey } from "../webauthn";
import { type Account as AccountData, ago, call, day, fresh, projectName, reauth, useConfig } from "./api";
import { go, takeFragment } from "./nav";
import { Go, Notice, Problem, Sheet, Shell, ShownOnce } from "./Page";

// Your account (M9c): your passkeys, and adding one, with its line for CI shown once (D159); where you're signed in, and
// ending any of it (B-vtr1r, B-7bq05); your machines, and ending any (B-84e0d); Globus, linked or not (D176); and signing
// out, here or everywhere. What adds a way in asks for your passkey afresh.

interface SignInRow {
  id: string;
  name: string;
  created: string;
  last_used: string;
  current: boolean;
}
interface MachineRow {
  id: string;
  machine: string;
  project: string;
  project_name: string | null;
  created: string;
  last_used: string;
}

export function Account({ account, reload }: { account: AccountData; reload: () => Promise<void> }) {
  const config = useConfig();
  const [signIns, setSignIns] = useState<SignInRow[]>();
  const [machines, setMachines] = useState<MachineRow[]>();
  const [added, setAdded] = useState<{ name: string; pin: string }>();
  const [busy, setBusy] = useState<string>();
  // A Globus round trip comes back with what happened in the address's fragment (M9c).
  const [fragment] = useState(takeFragment);
  const [notice, setNotice] = useState<string | undefined>(fragment.get("globus") === "linked" ? "Globus is linked: you can sign in through it from now on." : undefined);
  const [problem, setProblem] = useState<string | undefined>(fragment.get("message") ?? undefined);

  const lists = async () => {
    const [s, m] = await Promise.all([call<{ sessions: SignInRow[] }>("GET", "/v1/account/sessions"), call<{ machines: MachineRow[] }>("GET", "/v1/account/machines")]);
    setSignIns(s.sessions);
    setMachines(m.machines);
  };
  useEffect(() => {
    lists().catch((e) => setProblem(e instanceof Error ? e.message : String(e)));
  }, []);

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

  const addPasskey = () =>
    run("passkey", async () => {
      const start = await fresh(() => call<{ flow: string; options: CreationOptionsJSON }>("POST", "/v1/account/passkeys/start", {}));
      const response = await makePasskey(start.options);
      const r = await call<{ passkey: { name: string; pin: string } }>("POST", "/v1/account/passkeys/finish", { flow: start.flow, response });
      setAdded(r.passkey);
      await reload();
    });

  const endSignIn = (s: SignInRow) =>
    run(`session:${s.id}`, async () => {
      await call("DELETE", `/v1/account/sessions/${encodeURIComponent(s.id)}`);
      if (s.current) return go("/sign-in", { replace: true });
      await lists();
      setNotice(`Signed out of ${s.name}.`);
    });

  const endMachine = (m: MachineRow) =>
    run(`machine:${m.id}`, async () => {
      await call("DELETE", `/v1/account/machines/${encodeURIComponent(m.id)}`);
      await lists();
      setNotice(`${m.machine} is signed out of ${m.project_name ?? "its project"}. It can sign in again with baesian login.`);
    });

  const signOut = (everywhere: boolean) =>
    run(everywhere ? "everywhere" : "here", async () => {
      await call("POST", "/v1/account/signout", { everywhere });
      go("/sign-in", { replace: true });
    });

  const linkGlobus = () =>
    run("globus", async () => {
      if (Date.parse(account.fresh_until) < Date.now() + 30_000) await reauth();
      location.assign("/v1/globus/start?purpose=link");
    });

  const unlinkGlobus = () =>
    run("globus", async () => {
      await call("DELETE", "/v1/account/globus");
      await reload();
      setNotice("Globus is unlinked: sign in with your passkey.");
    });

  return (
    <Shell who={account.handle} wide>
      <Sheet title="Your account" lead={<>Signed in as <b>{account.handle}</b>{account.emails.length ? <>, with {account.emails.map((e) => e.address).join(", ")}</> : null}.</>}>
        <Problem text={problem} />
        <Notice text={notice} />
      </Sheet>

      <Sheet title="Passkeys" sub label="Your passkeys" lead="They sign you in, and confirm your answers on hard cards. Add one on each device you answer from.">
        <ul className="site-rows">
          {account.passkeys.map((p) => (
            <li key={p.credential} className="site-row">
              <span className="nm">{p.name}</span>
              <span className="st">
                Added {day(p.enrolled)} · last used {ago(p.last_used)}
              </span>
            </li>
          ))}
        </ul>
        {added && (
          <ShownOnce
            label={`The line for CI, for ${added.name}`}
            value={added.pin}
            why={
              <>
                For <code>baesian verify</code> to count the hard cards you answer with this passkey, add this line to your CI's <code>BAESIAN_TRUST</code> setting. It's shown only now.
              </>
            }
          />
        )}
        <Go busy={busy === "passkey"} busyText="Waiting for your passkey…" onClick={() => void addPasskey()}>
          Add a passkey
        </Go>
        <p className="small">Adding one asks for a passkey you have first, and emails you a notice.</p>
      </Sheet>

      <Sheet title="Where you're signed in" sub label="Your sign-ins" lead="Each browser stays signed in until 30 days unused, or 90 days in all. Only its name and when it was last used are kept.">
        {!signIns ? (
          <p className="small">Loading…</p>
        ) : (
          <ul className="site-rows">
            {signIns.map((s) => (
              <li key={s.id} className="site-row">
                <span className="nm">
                  {s.name}
                  {s.current && <span className="tag-here">this browser</span>}
                </span>
                <span className="st">
                  Signed in {day(s.created)} · last used {ago(s.last_used)}
                </span>
                <button type="button" className="switch end" disabled={busy !== undefined} onClick={() => void endSignIn(s)} aria-label={`Sign out ${s.current ? "this browser" : s.name}`}>
                  Sign out
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet title="Machines" sub label="Your machines" lead="A machine files cards and hears your answers in one project. It can never answer. Signing one out ends its access; it can sign in again with baesian login.">
        {!machines ? (
          <p className="small">Loading…</p>
        ) : machines.length === 0 ? (
          <p className="small">No machines are signed in.</p>
        ) : (
          <ul className="site-rows">
            {machines.map((m) => (
              <li key={m.id} className="site-row">
                <span className="nm">{m.machine}</span>
                <span className="st">
                  {projectName({ name: m.project_name })} · signed in {day(m.created)} · last used {ago(m.last_used)}
                </span>
                <button type="button" className="switch end" disabled={busy !== undefined} onClick={() => void endMachine(m)} aria-label={`Sign out ${m.machine}`}>
                  Sign out
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {config?.globus && (
        <Sheet title="Globus" sub label="Globus" lead={account.globus ? `Linked ${day(account.globus.linked)}: you can sign in through Globus as well as with your passkey.` : "Link your Globus identity to sign in through it as well as with your passkey."}>
          {account.globus ? (
            <button type="button" className="switch" disabled={busy !== undefined} onClick={() => void unlinkGlobus()}>
              Unlink Globus
            </button>
          ) : (
            <Go busy={busy === "globus"} onClick={() => void linkGlobus()}>
              Link Globus
            </Go>
          )}
        </Sheet>
      )}

      <Sheet title="Sign out" sub label="Signing out">
        <div className="site-actions">
          <button type="button" className="switch" disabled={busy !== undefined} onClick={() => void signOut(false)}>
            Sign out of this browser
          </button>
          <button type="button" className="switch" disabled={busy !== undefined} onClick={() => void signOut(true)}>
            Sign out everywhere
          </button>
        </div>
        <p className="small">Everywhere means every browser. Machines stay signed in: sign them out above.</p>
      </Sheet>
    </Shell>
  );
}
