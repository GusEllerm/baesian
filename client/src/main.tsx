// Fonts are bundled, so the client works offline and never contacts Google (D99).
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/alegreya/wght.css";
import "@fontsource-variable/alegreya/wght-italic.css";
import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { listenForInstall, registerServiceWorker } from "./site/app";
import { Site } from "./site/Site";

// One client, two builds (D130, M9e): `baesian serve`'s (dist/client/), and the website's (dist/site/, `vite build --mode
// site`), which the Worker serves. Vite fixes the mode at build time, so each build carries only its own.
const HOSTED = import.meta.env.MODE === "site";

// The website as an app (M9e step 2): its service worker, for notifications, and the browser's install prompt, kept for
// the button that uses it.
if (HOSTED) {
  registerServiceWorker();
  listenForInstall();
}

createRoot(document.getElementById("root")!).render(<StrictMode>{HOSTED ? <Site /> : <App />}</StrictMode>);
