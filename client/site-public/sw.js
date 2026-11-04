// Baesian's service worker (M9e step 2), registered by the website at scope /, for its notifications (D130). It shows a
// notification for every push, since Safari takes back the permission from a site whose push shows nothing, and opens the
// project's page when one is tapped. A notification has no answer buttons: answering takes opening the card (P15
// section 7). It caches nothing and handles no fetch, so every request, /v1/ and a project's state included, goes to the
// network as if it weren't here. docs/vault/Design/Client Build.md, item 20, describes it.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** What a push the service couldn't be read as says: something is waiting, with nothing about what. */
const FALLBACK = { title: "Cards are waiting in Baesian", body: "Tap to open your projects.", url: "/", tag: "baesian" };

/** A page of the site's own, never another site's. */
const ownPage = (url) => typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/v1/");

/** The service's message (B-mjf3g: counts and levels, the project's page, a tag per project), or the fallback. */
function messageOf(data) {
  try {
    const m = data ? data.json() : undefined;
    if (m && typeof m.title === "string" && ownPage(m.url)) {
      return { title: m.title.slice(0, 200), body: typeof m.body === "string" ? m.body.slice(0, 200) : "", url: m.url, tag: typeof m.tag === "string" ? m.tag : "baesian" };
    }
  } catch {
    // not JSON: the fallback says something is waiting
  }
  return FALLBACK;
}

self.addEventListener("push", (event) => {
  const m = messageOf(event.data);
  // One tag per project: a newer notification replaces the older on the device, and alerts again (renotify).
  event.waitUntil(
    self.registration.showNotification(m.title, {
      body: m.body,
      tag: m.tag,
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: m.url, shown: Date.now() },
    }),
  );
});

/**
 * A notification opened is counted (D141, B-7nq85): the minutes since it was shown, and its project, for the account
 * signed in here; the service counts nothing for an account that opted out, or for nobody signed in.
 */
async function countOpened(data) {
  try {
    const project = /^\/projects\/([^/]+)$/.exec(data?.url ?? "")?.[1];
    const minutes = Math.max(0, Math.round((Date.now() - (data?.shown ?? Date.now())) / 60_000));
    await fetch("/v1/account/push/opened", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minutes_after: minutes, ...(project ? { project: decodeURIComponent(project) } : {}) }),
    });
  } catch {
    // not counted: nothing else depends on it
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(ownPage(event.notification.data?.url) ? event.notification.data.url : "/", self.location.origin);
  event.waitUntil(
    Promise.all([
      (async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const open = windows.find((w) => new URL(w.url).pathname === url.pathname);
        if (open) return open.focus();
        return self.clients.openWindow(url.href);
      })(),
      countOpened(event.notification.data),
    ]),
  );
});

// A browser that renews its subscription by itself (Firefox does) tells the service the new one, as the page would.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const config = await (await fetch("/v1/config", { credentials: "same-origin" })).json();
      if (!config.vapid_public_key) return;
      const sub = event.newSubscription ?? (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: config.vapid_public_key }));
      await fetch("/v1/account/push", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    })(),
  );
});
