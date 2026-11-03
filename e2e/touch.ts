import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Locator, Page } from "@playwright/test";

// A finger on a phone's screen, for the phone layout's browser tests (D130). Playwright taps, but doesn't swipe or
// press and hold, so these send Chromium's own touch events: the browser turns them into pointer events, and scrolls
// for them where the page lets it (touch-action), just as on a phone.

export const PHONES = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "small Android", width: 360, height: 740 },
] as const;

/** A phone's browser: its size, touch, and a mobile viewport. */
export const phone = (size: { width: number; height: number }) => ({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

export class Finger {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  static async on(page: Page): Promise<Finger> {
    return new Finger(page, await page.context().newCDPSession(page));
  }

  private touch(type: "touchStart" | "touchMove" | "touchEnd", x?: number, y?: number) {
    return this.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined || y === undefined ? [] : [{ x, y }] });
  }

  /** Where a locator's middle is, or a point that far into it. */
  async at(target: Locator, dx = 0.5, dy = 0.5): Promise<{ x: number; y: number }> {
    await target.scrollIntoViewIfNeeded();
    const b = (await target.boundingBox())!;
    return { x: b.x + b.width * dx, y: b.y + b.height * dy };
  }

  /**
   * A swipe from `from`, by (dx, dy), in steps a frame apart on the page's clock (Playwright's, when it's installed).
   * With `hold`, the finger stays down at the end until `lift()`.
   */
  async swipe(from: { x: number; y: number }, dx: number, dy: number, opts: { steps?: number; hold?: boolean; clock?: boolean } = {}) {
    const steps = opts.steps ?? 12;
    await this.touch("touchStart", from.x, from.y);
    for (let i = 1; i <= steps; i++) {
      await this.touch("touchMove", from.x + (dx * i) / steps, from.y + (dy * i) / steps);
      await this.frame(opts.clock);
    }
    if (!opts.hold) await this.lift(opts.clock);
  }

  /** A press held for `ms` on the page's clock, then lifted. */
  async press(at: { x: number; y: number }, ms: number) {
    await this.touch("touchStart", at.x, at.y);
    await this.page.clock.runFor(ms);
    await this.lift(true);
  }

  async lift(clock = true) {
    await this.touch("touchEnd");
    await this.frame(clock);
  }

  private async frame(clock = true) {
    if (clock) await this.page.clock.runFor(16);
    else await this.page.waitForTimeout(16);
  }
}

/** With BAESIAN_SHOTS set to a folder, a screenshot of the screen, for looking at. Only at the iPhone's size. */
export async function shot(page: Page, name: string) {
  const dir = process.env.BAESIAN_SHOTS;
  if (!dir || page.viewportSize()?.width !== 390) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}
