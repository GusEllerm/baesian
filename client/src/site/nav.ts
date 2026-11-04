import { type MouseEvent, useSyncExternalStore } from "react";

// The website's own pages (M9e) are one app, routed in the browser: the Worker serves the same index.html for every page
// that isn't a file (single-page application), and every address under /v1/ is the service's. These are the pages.

const listeners = new Set<() => void>();
const changed = () => {
  for (const l of listeners) l();
};
addEventListener("popstate", changed);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Where the browser is: the path and query, which pick the page. */
export const useWhere = () => useSyncExternalStore(subscribe, () => `${location.pathname}${location.search}`);

/** Go to one of the site's pages, without loading the app again. */
export function go(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  scrollTo({ top: 0 });
  changed();
}

/** A link's click, kept in the app; a click with a modifier opens a new tab, as a link does. */
export const follow = (to: string) => (e: MouseEvent) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go(to);
};

/** Where to go after signing in: `?next=`, if it's one of the site's own pages. */
export function nextPage(fallback = "/"): string {
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/v1/") ? next : fallback;
}

/** The sign-in page, coming back here afterwards. */
export const signInHere = () => go(`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`, { replace: true });

/** What the service put in the address's fragment after a round trip (Globus, M9c): read once, then cleared. */
export function takeFragment(): URLSearchParams {
  const f = new URLSearchParams(location.hash.slice(1));
  if (location.hash) history.replaceState(null, "", `${location.pathname}${location.search}`);
  return f;
}
