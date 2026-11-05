import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Locator, Page } from "@playwright/test";

// A finger on a phone's screen, for the phone layout's browser tests (D130). Playwright taps, but doesn't swipe or
// press and hold, so these send Chromium's own touch events: the browser turns them into pointer events, and scrolls
// for them where the page lets it (touch-action), just as on a phone. A card is held until it lifts, then dragged
// (B-yfehp): `hold()` puts the finger down and keeps it still, `move()` drags it, and `lift()` lets go.

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
    await this.touch("touchStart", from.x, from.y);
    this.point = from;
    await this.move(dx, dy, opts);
    if (!opts.hold) await this.lift(opts.clock);
  }

  /** Where the finger is while it's down. */
  private point: { x: number; y: number } | undefined;

  /**
   * The finger put down at `at` and held still for `ms`, on the page's clock unless `clock` is false: past 350 ms, a
   * card lifts. It stays down.
   */
  async hold(at: { x: number; y: number }, ms = 400, clock = true) {
    await this.touch("touchStart", at.x, at.y);
    this.point = at;
    if (clock) await this.page.clock.runFor(ms);
    else await this.page.waitForTimeout(ms);
  }

  /** The finger that's down moved by (dx, dy), in steps a frame apart; it stays down until `lift()`. */
  async move(dx: number, dy: number, opts: { steps?: number; clock?: boolean } = {}) {
    const from = this.point!;
    const steps = opts.steps ?? 12;
    for (let i = 1; i <= steps; i++) {
      await this.touch("touchMove", from.x + (dx * i) / steps, from.y + (dy * i) / steps);
      await this.frame(opts.clock);
    }
    this.point = { x: from.x + dx, y: from.y + dy };
  }

  /** A press held for `ms` on the page's clock, then lifted. */
  async press(at: { x: number; y: number }, ms: number) {
    await this.touch("touchStart", at.x, at.y);
    await this.page.clock.runFor(ms);
    await this.lift(true);
  }

  async lift(clock = true) {
    await this.touch("touchEnd");
    this.point = undefined;
    await this.frame(clock);
  }

  private async frame(clock = true) {
    if (clock) await this.page.clock.runFor(16);
    else await this.page.waitForTimeout(16);
  }
}

/**
 * With BAESIAN_SHOTS set to a folder, a screenshot of the screen, for looking at. Only at the iPhone's size, unless
 * `everySize`: then at each, named with its size.
 */
export async function shot(page: Page, name: string, everySize = false) {
  const dir = process.env.BAESIAN_SHOTS;
  const size = page.viewportSize();
  if (!dir || (!everySize && size?.width !== 390)) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, everySize && size ? `${name}-${size.width}x${size.height}.png` : `${name}.png`) });
}
