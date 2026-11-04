import { vi } from "vitest";
import { type Received, type TestBrowser, readPush, testBrowser } from "./push-decrypt.js";

export { type Received, type TestBrowser, decrypt, testBrowser } from "./push-decrypt.js";

// A stand-in push service for the relay's tests (B-nk97q): browsers' subscriptions made in the test, with their own key
// pairs, and a push service that takes what the relay sends, checks its VAPID token, and decrypts it as a browser would
// (RFC 8291), so a test reads the notification that would have been shown. It answers as a test tells it to: 201, or 404
// or 410 for a subscription that's gone. Nothing leaves the test: `fetch` is stood in for, for the relay too, since the
// Worker and its Durable Objects run in the test's own isolate.

/**
 * The stand-in push service, put in place of `fetch`: pushes to its host are read and decrypted, and answered with the
 * status a test gives for that endpoint (201 by default); anything else is refused, so nothing leaves the test.
 */
export class PushStandIn {
  readonly received: Received[] = [];
  private readonly browsers = new Map<string, TestBrowser>();
  private readonly statuses = new Map<string, number>();
  readonly spy;

  constructor(readonly host = "push.test") {
    this.spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      if (url.host !== this.host) throw new Error(`the test reached for ${request.url}: only the stand-in push service answers`);
      const browser = this.browsers.get(request.url);
      const status = this.statuses.get(request.url) ?? (browser ? 201 : 404);
      if (browser && status < 300) this.received.push(await readPush(request.url, Object.fromEntries(request.headers), new Uint8Array(await request.arrayBuffer()), browser));
      return new Response(null, { status });
    });
  }

  /** A new browser subscribed at this push service. */
  async browser(): Promise<TestBrowser> {
    const b = await testBrowser(this.host);
    this.browsers.set(b.endpoint, b);
    return b;
  }

  /** What the push service answers for a browser from now on: 410 or 404 when its subscription is gone. */
  answer(b: TestBrowser, status: number): void {
    this.statuses.set(b.endpoint, status);
  }

  /** The pushes one browser received. */
  to(b: TestBrowser): Received[] {
    return this.received.filter((r) => r.endpoint === b.endpoint);
  }

  restore(): void {
    this.spy.mockRestore();
  }
}
