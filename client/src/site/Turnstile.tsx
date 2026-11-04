import { useEffect, useRef, useState } from "react";

// Turnstile, Cloudflare's bot check (B-1a03b), on the two forms that send email: sign-up and getting back in. Managed
// mode: most people see a box that ticks itself; some are asked to tick it. Its script comes from Cloudflare, so the
// site's policy allows that one origin, for scripts and frames, and nothing else (client/site-public/_headers).

interface TurnstileApi {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | undefined;

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("the bot check didn't load")));
    s.onerror = () => {
      loading = undefined;
      reject(new Error("the bot check couldn't be loaded: check your connection, or allow challenges.cloudflare.com"));
    };
    document.head.append(s);
  });
  return loading;
}

/** The widget: `onToken` gets its token once it passes, and `undefined` when the token expires or fails. */
export function Turnstile({ siteKey, onToken, reset }: { siteKey: string; onToken: (token: string | undefined) => void; reset: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string>();
  const latest = useRef(onToken);
  latest.current = onToken;
  useEffect(() => {
    let id: string | undefined;
    let api: TurnstileApi | undefined;
    let stopped = false;
    load().then(
      (t) => {
        if (stopped || !box.current) return;
        api = t;
        id = t.render(box.current, {
          sitekey: siteKey,
          appearance: "always",
          theme: "light",
          size: "flexible",
          callback: (token: string) => latest.current(token),
          "expired-callback": () => latest.current(undefined),
          "error-callback": () => {
            latest.current(undefined);
            setProblem("the bot check failed: reload the page and try again");
          },
        });
      },
      (e: unknown) => !stopped && setProblem(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      stopped = true;
      if (api && id) api.remove(id);
    };
  }, [siteKey, reset]);
  return (
    <div className="turnstile">
      <div ref={box} />
      {problem && (
        <p className="problem" role="alert">
          {problem[0]!.toUpperCase() + problem.slice(1)}.
        </p>
      )}
    </div>
  );
}
