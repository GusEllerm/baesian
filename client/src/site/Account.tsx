import { useEffect, useId, useState } from "react";
import { keptFor } from "../kept";
import { waitingByProject, waitingLine } from "../waiting";
import { type CreationOptionsJSON, type RequestOptionsJSON, makePasskey } from "../webauthn";
import { type Account as AccountData, type Ceremony, type Passkey, ago, call, day, projectName, reauthStart, reauthWith, useConfig, useFresh, usePrepared } from "./api";
import { go, takeFragment } from "./nav";
import { Notifications } from "./Notifications";
import { Copyable, Field, Go, Notice, Problem, Sheet, Shell, To } from "./Page";

// Your account (M9c): your passkeys, each with its line for CI on request, any time (D159, B-yj5d5), and adding one;
// where you're signed in, and ending any of it (B-vtr1r, B-7bq05); your machines, and ending any (B-84e0d); Globus, linked
// or not (D176); and signing out, here or everywhere. What adds a way in asks for your passkey afresh. And deleting the
// account (M9f, B-b46z3): closed at once, restorable with its passkey for 14 days, then deleted.

/** A new passkey's options (`POST /v1/account/passkeys/start`), which take a recent check. */
const enrolStart = () => call<Ceremony<CreationOptionsJSON>>("POST", "/v1/account/passkeys/start", {});

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
  // The passkeys whose line for CI is open: none at first, and a new one's, opened for you.
  const [lines, setLines] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string>();
  // A Globus round trip comes back with what happened in the address's fragment (M9c).
  const [fragment] = useState(takeFragment);
  const [notice, setNotice] = useState<string | undefined>(fragment.get("globus") === "linked" ? "Globus is linked: you can sign in through it from now on." : undefined);
  const [problem, setProblem] = useState<string | undefined>(fragment.get("message") ?? undefined);
  // What asks for your passkey afresh (adding one, linking Globus) starts it from the tap itself, with options fetched
  // before it: the check's while the last one is old, the new passkey's once it's recent (M9e step 2).
  const freshNow = useFresh(account.fresh_until);
  const check = usePrepared(freshNow ? undefined : reauthStart);
  const enrol = usePrepared(freshNow ? enrolStart : undefined);
  const [checked, setChecked] = useState(false);

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

  // Two taps when the last check is old: one for a passkey you have, then one to make the new one, since each starts a
  // passkey and a browser starts one only from a tap.
  const addPasskey = () =>
    run("passkey", async () => {
      if (!freshNow) {
        await reauthWith(check.take());
        await reload();
        setChecked(true);
        return setNotice("That's you. Now make the new passkey.");
      }
      const c = enrol.take();
      const response = await makePasskey(c.options);
      const r = await call<{ passkey: { credential: string; name: string } }>("POST", "/v1/account/passkeys/finish", { flow: c.flow, response });
      setChecked(false);
      await reload();
      setLines((open) => new Set(open).add(r.passkey.credential));
      setNotice("The new passkey is added, with its line for CI open in the list below.");
    });

  const toggleLine = (credential: string) =>
    setLines((open) => {
      const next = new Set(open);
      if (!next.delete(credential)) next.add(credential);
      return next;
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
      // What this tab kept of your projects goes with you (B-9n2c3).
      keptFor(undefined);
      go("/sign-in", { replace: true });
    });

  const linkGlobus = () =>
    run("globus", async () => {
      if (!freshNow) await reauthWith(check.take());
      location.assign("/v1/globus/start?purpose=link");
    });

  const unlinkGlobus = () =>
    run("globus", async () => {
      await call("DELETE", "/v1/account/globus");
      await reload();
      setNotice("Globus is unlinked: sign in with your passkey.");
    });

  return (
    <Shell who={account.handle}>
      <Sheet title="Your account" lead={<>Signed in as <b>{account.handle}</b>{account.emails.length ? <>, with {account.emails.map((e) => e.address).join(", ")}</> : null}.</>}>
        <Problem text={problem} />
        <Notice text={notice} />
      </Sheet>

      <Notifications vapidKey={config === undefined ? undefined : config.vapid_public_key} />

      <Sheet title="Passkeys" sub label="Your passkeys" lead="They sign you in, and confirm your answers on hard cards. Add one on each device you answer from.">
        <ul className="site-rows">
          {account.passkeys.map((p) => (
            <PasskeyRow key={p.credential} passkey={p} open={lines.has(p.credential)} onToggle={() => toggleLine(p.credential)} />
          ))}
        </ul>
        <Go busy={busy === "passkey"} busyText="Waiting for your passkey…" disabled={!(freshNow ? enrol.ready : check.ready)} onClick={() => void addPasskey()}>
          {checked && freshNow ? "Make the new passkey" : "Add a passkey"}
        </Go>
        <p className="small">Adding one asks for a passkey you have first, unless you used it in the last few minutes, and emails you a notice.</p>
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
            <Go busy={busy === "globus"} disabled={!check.ready} onClick={() => void linkGlobus()}>
              Link Globus
            </Go>
          )}
        </Sheet>
      )}

      <UsageCounts counted={account.usage.counted} reload={reload} />

      <Sheet title="Sign out" sub label="Signing out">
        <WaitingHere account={account} />
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

      <DeleteAccount handle={account.handle} fresh={freshNow} check={check} />
    </Shell>
  );
}

/**
 * Before you sign out: answers this tab's desks left waiting for your passkey (B-a6xpc). Signed out, they can't be confirmed
 * until you sign in again, and the service drops them 30 minutes after you answered.
 */
function WaitingHere({ account }: { account: AccountData }) {
  const [waiting] = useState(() => [...waitingByProject()].filter(([id]) => account.projects.some((p) => p.id === id)));
  if (!waiting.length) return null;
  return (
    <div className="site-warn" role="note">
      {waiting.map(([id, n]) => {
        const p = account.projects.find((x) => x.id === id)!;
        const one = n === 1;
        return (
          <p key={id}>
            {waitingLine(n)} {one ? "It's" : "They're"} on the desk of <To to={`/projects/${encodeURIComponent(id)}`}>{projectName(p)}</To>: confirm {one ? "it" : "them"} there before you sign out. Signed out,{" "}
            {one ? "it waits" : "they wait"} until you sign in again, for up to 30 minutes from when you answered; then {one ? "it's" : "they're"} dropped, unrecorded.
          </p>
        );
      })}
    </div>
  );
}

/**
 * One passkey: its name, when it was added and last used, and its line for CI, open on request, any time (B-yj5d5). The
 * line is what CI's `BAESIAN_TRUST` pins for it (D159): its key file on one line, as every project of yours holds it. It's
 * public, and signs nobody in.
 */
function PasskeyRow({ passkey: p, open, onToggle }: { passkey: Passkey; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <li className="site-row">
      <span className="nm">{p.name}</span>
      <span className="st">
        Added {day(p.enrolled)} · last used {ago(p.last_used)}
      </span>
      <button type="button" className="switch end" aria-expanded={open} aria-controls={id} aria-label={`Line for CI, for ${p.name}`} onClick={onToggle}>
        Line for CI
      </button>
      {open && (
        <div className="ci-line" id={id}>
          <p className="hint">
            For <code>baesian verify</code> to count the hard cards you answer with this passkey, add this line to your CI's <code>BAESIAN_TRUST</code> setting. <code>baesian ci</code> prints it too, with the rest of the setting.
          </p>
          <Copyable label={`The line for CI, for ${p.name}`} value={p.pin} />
        </div>
      )}
    </li>
  );
}

/**
 * Deleting the account (M9f, B-b46z3, "Closed for 14 days, then deleted"): the handle typed out, and the passkey checked
 * afresh from the tap when the last check is old. Closed at once; the sign-in page then says until when it can be restored.
 */
function DeleteAccount({ handle, fresh, check }: { handle: string; fresh: boolean; check: ReturnType<typeof usePrepared<Ceremony<RequestOptionsJSON>>> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const matches = typed.trim().toLowerCase() === handle.toLowerCase();
  const remove = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      if (!fresh) await reauthWith(check.take());
      const r = await call<{ closed: true; deletes: string }>("POST", "/v1/account/delete", { handle: typed.trim() });
      go(`/sign-in?closed=${encodeURIComponent(r.deletes)}`, { replace: true });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Delete your account" sub label="Deleting your account">
      <p>
        Deleting closes your account at once: every browser and machine is signed out, and nothing more is relayed or counted. For 14 days, signing in with your passkey can restore it. Then it's deleted for good, with every project you own and all their cards and answers on the service.
      </p>
      <p className="small">Your repositories keep their own record. Daily usage totals, which name no one, stay.</p>
      <p className="small">
        <To to="/privacy">What else is kept, and for how long</To>
      </p>
      <Problem text={problem} />
      <Field label={`Type your handle, ${handle}, to confirm`} value={typed} onChange={setTyped} autoComplete="off" maxLength={32} />
      <Go busy={busy} busyText="Waiting for your passkey…" disabled={!matches || (!fresh && !check.ready)} onClick={() => void remove()}>
        Delete my account
      </Go>
      <p className="small">It asks for your passkey first, unless you used it in the last few minutes, and emails you a notice.</p>
    </Sheet>
  );
}

/**
 * Usage counts (D141, B-7nq85): every account is counted unless it opts out, here. Opting out stops counting and deletes
 * what was kept for the account; the public page lists every field.
 */
function UsageCounts({ counted, reload }: { counted: boolean; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  // What the box shows: the answer just given, while the service is told, then the account's own.
  const [shown, setShown] = useState<boolean>();
  const [notice, setNotice] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const set = async (on: boolean) => {
    setBusy(true);
    setShown(on);
    setNotice(undefined);
    setProblem(undefined);
    try {
      await call("POST", "/v1/account/usage", { counted: on });
      await reload();
      setNotice(on ? "Your use is counted again, under a new ID that isn't linked to before." : "Nothing more is counted for your account, and what was kept for it is deleted.");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setShown(undefined);
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="Usage counts"
      sub
      label="Usage counts"
      lead="The service counts how it's used, to know whether it works and what it costs: how many cards are filed and answered, how long they wait, whether notifications arrive. Never what a card says, nor anyone's name."
    >
      <Problem text={problem} />
      <Notice text={notice} />
      <label className="site-check">
        <input type="checkbox" checked={shown ?? counted} disabled={busy} onChange={(e) => void set(e.target.checked)} />
        Count my use of the service
      </label>
      <p className="small">Unticking it deletes what was kept for your account at once.</p>
      <p className="small">
        <To to="/counts">Every field it counts, and what it never does</To>
      </p>
      <p className="small">
        <To to="/privacy">Everything the service keeps, and why</To>
      </p>
    </Sheet>
  );
}
