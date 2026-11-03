import { basename } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Marks the setup survey as offered (B-5na1k), for tests about something else: with no preference file, the client
 * offers it once, before the cards. The client keeps that per project, in the browser's storage, by the repo's name.
 */
export const skipSetup = (page: Page | BrowserContext, dir: string) => page.addInitScript((key) => localStorage.setItem(key, "true"), `baesian:${basename(dir)}:setup`);
