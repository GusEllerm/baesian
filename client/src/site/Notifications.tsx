import { useState } from "react";
import { type PushRow, isInstalled, isIos, useInstall, usePush } from "./app";
import { ago, day } from "./api";
import { Go, Notice, Problem, Sheet } from "./Page";

// Notifications, on the account page (M9e step 2, D130): turning them on in this browser, from a tap; on an iPhone, how to
// add Baesian to the Home Screen first, since only the app there can get them; installing it as an app where the browser
// offers to; and every browser that gets them, each removable. What one says is counts and levels, never a card's text
// (B-mjf3g), and none comes while you're on the project's page (D41).

export function Notifications({ vapidKey }: { vapidKey: string | null | undefined }) {
  const push = usePush(vapidKey);
  const install = useInstall();
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();

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

  const remove = (r: PushRow) =>
    run(`remove:${r.id}`, async () => {
      await push.remove(r);
      setNotice(r.key === push.here?.key ? "This browser won't get notifications any more." : `${r.name} won't get notifications any more.`);
    });

  const ios = isIos();
  const installed = isInstalled();
  return (
    <Sheet title="Notifications" sub label="Notifications" lead="Your phone or computer can tell you when cards are waiting: how many, and how many are hard, never what they say. None comes while you're on the project's page.">
      <Problem text={problem} />
      <Notice text={notice} />
      <div className="push-here">
        {push.status === "loading" && <p className="small">Loading…</p>}
        {push.status === "unsupported" && <p>This browser can't get notifications from a website. Recent versions of Chrome, Edge, Firefox and Safari can.</p>}
        {push.status === "unavailable" && <p>This service can't send notifications yet.</p>}
        {push.status === "install-first" && (
          <div className="site-callout">
            <p>
              <b>On an iPhone or iPad, notifications come only to Baesian on your Home Screen.</b>
            </p>
            <ol className="push-steps">
              <li>In Safari, tap the Share button.</li>
              <li>Tap Add to Home Screen, then Add.</li>
              <li>Open Baesian from your Home Screen, sign in, and come back to this page to turn them on.</li>
            </ol>
          </div>
        )}
        {push.status === "blocked" && <p>Notifications are blocked for this site in this browser. To get them, allow them in the browser's settings for this site, then come back here.</p>}
        {push.status === "off" && (
          <>
            <Go busy={busy === "on"} busyText="Waiting for your browser…" onClick={() => void run("on", async () => {
              await push.turnOn();
            })}>
              Turn on notifications
            </Go>
            <p className="small">Your browser asks whether to allow them. {ios && installed ? "On an iPhone, tap Allow." : ""}</p>
          </>
        )}
        {push.status === "on" && (
          <p role="status">
            <b>This browser gets notifications.</b> To stop them here, remove this browser below.
          </p>
        )}
      </div>

      {install.canPrompt && !installed && (
        <div className="push-install">
          <button type="button" className="switch" disabled={busy !== undefined} onClick={() => void run("install", async () => {
            if (await install.prompt()) setNotice("Baesian is installed: open it from your dock, Start menu or Home Screen.");
          })}>
            Install Baesian as an app
          </button>
          <p className="small">It opens in a window of its own, and gets notifications even with the browser closed.</p>
        </div>
      )}

      {push.rows && push.rows.length > 0 && (
        <>
          <h3 className="site-sub">Browsers that get them</h3>
          <ul className="site-rows">
            {push.rows.map((r) => (
              <li key={r.id} className="site-row">
                <span className="nm">
                  {r.name}
                  {r.key === push.here?.key && <span className="tag-here">this browser</span>}
                </span>
                <span className="st">
                  Since {day(r.created)} · last notified {r.last_sent ? ago(r.last_sent) : "not yet"}
                </span>
                <button type="button" className="switch end" disabled={busy !== undefined} onClick={() => void remove(r)} aria-label={`Stop notifications to ${r.key === push.here?.key ? "this browser" : r.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
