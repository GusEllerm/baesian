import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "./live";

// A project's live connection, as the desk and the projects page hold it (B-bv49e, B-gty71): each version the relay
// announces is heard, a connection that closes is opened again, later each time, and a ping keeps it from idling out.

class FakeSocket {
  static OPEN = 1;
  static made: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  /** The relay accepts it. */
  accept() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  /** The connection drops. */
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const last = () => FakeSocket.made.at(-1)!;

beforeEach(() => {
  FakeSocket.made = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a project's live connection", () => {
  it("hears each version the relay announces, and nothing else it's sent", () => {
    const heard: number[] = [];
    const stop = listen("wss://baesian.test/v1/projects/p-1/live", { changed: (v) => heard.push(v) });
    expect(last().url).toBe("wss://baesian.test/v1/projects/p-1/live");
    last().accept();
    last().onmessage!({ data: JSON.stringify({ type: "changed", version: 7 }) });
    last().onmessage!({ data: "pong" });
    last().onmessage!({ data: JSON.stringify({ type: "something-else", version: 9 }) });
    last().onmessage!({ data: JSON.stringify({ type: "changed", version: 8 }) });
    // With no version, it's newer than anything.
    last().onmessage!({ data: JSON.stringify({ type: "changed" }) });
    expect(heard).toEqual([7, 8, Number.POSITIVE_INFINITY]);
    stop();
    expect(last().closed).toBe(true);
  });

  it("is opened again when it closes, later each time, saying so first; and from the start again once one opens", () => {
    const events: string[] = [];
    const stop = listen("wss://x/live", { changed: (v) => events.push(`changed ${v}`), reopening: () => events.push("reopening") });
    last().accept();
    last().drop();
    expect(FakeSocket.made).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.made).toHaveLength(2);
    expect(events).toEqual(["reopening"]);
    // It doesn't open: the next try waits longer, then longer still, up to ten seconds.
    for (const wait of [2000, 5000, 10_000, 10_000]) {
      last().drop();
      const had = FakeSocket.made.length;
      vi.advanceTimersByTime(wait - 1);
      expect(FakeSocket.made).toHaveLength(had);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.made).toHaveLength(had + 1);
    }
    // Open again, it hears, and the next drop starts from a second.
    last().accept();
    last().onmessage!({ data: JSON.stringify({ type: "changed", version: 3 }) });
    expect(events.at(-1)).toBe("changed 3");
    last().drop();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.made).toHaveLength(7);
    stop();
  });

  it("pings while it's open, and once stopped does nothing more", () => {
    const stop = listen("wss://x/live", { changed: () => {} });
    vi.advanceTimersByTime(30_000);
    expect(last().sent).toEqual([]);
    last().accept();
    vi.advanceTimersByTime(60_000);
    expect(last().sent).toEqual(["ping", "ping"]);
    stop();
    const socket = last();
    socket.drop();
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.made).toHaveLength(1);
    expect(socket.sent).toEqual(["ping", "ping"]);
  });
});
