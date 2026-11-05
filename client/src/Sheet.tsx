import { type PointerEvent, type ReactNode, useLayoutEffect, useRef } from "react";
import type { OptionKind } from "../../src/schema";
import type { Relation } from "./model";

// The path on a phone (D130, Hosted Service §7): "the path beside the card folds into a sheet you pull up". A bar at
// the foot of the screen says what's in it: your answers this session, what the card is connected to, and what's next.
// Tap it or pull it up, and the path (Path.tsx) opens over the desk; tap outside it, pull its head down, or press Esc,
// and it closes. Leaning toward an option lights the path's rows on a desktop; here the bar says what that option
// does to the card's connections, since the rows are folded away.

/** How far a pull on the bar or the sheet's head opens or closes it. */
const PULL = 24;
const CLOSE_PULL = 60;

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function PathSheet(p: {
  open: boolean;
  answered: number;
  /** The card in play's connections, from the path's own relations. */
  connected: Relation[];
  next: number;
  /** The option you're leaning toward, or have chosen in the reveal. */
  lean: OptionKind | undefined;
  onOpen: (open: boolean) => void;
  /** The path, drawn in the sheet. */
  children: ReactNode;
  /** Under something modal (the branches drawer, filling a phone): no keys, clicks or screen reader reach it. */
  inert?: boolean;
}) {
  const bar = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const pulled = useRef(false);

  // Open: the sheet's head has the focus, so Esc and a screen reader start there. Closed: back to the bar.
  const wasOpen = useRef(p.open);
  useLayoutEffect(() => {
    if (p.open) head.current?.focus({ preventScroll: true });
    else if (wasOpen.current && (!document.activeElement || document.activeElement === document.body)) bar.current?.focus({ preventScroll: true });
    wasOpen.current = p.open;
  }, [p.open]);

  // A pull: the bar opens when pulled up; the head drags the sheet down with the finger, and closes it past CLOSE_PULL.
  // Where it started is kept across renders: the desk renders again mid-pull whenever the card settles.
  const start = useRef<{ id: number; y: number }>(undefined);
  const pull = (dir: "up" | "down") => {
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        start.current = { id: e.pointerId, y: e.clientY };
        pulled.current = false;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
        const from = start.current;
        if (!from || e.pointerId !== from.id) return;
        const dy = e.clientY - from.y;
        if (dir === "up" && dy < -PULL && !pulled.current) {
          pulled.current = true;
          p.onOpen(true);
        }
        if (dir === "down" && sheet.current) {
          if (Math.abs(dy) > 4) pulled.current = true;
          sheet.current.style.transform = `translateY(${Math.max(0, dy)}px)`;
        }
      },
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
        const from = start.current;
        if (!from || e.pointerId !== from.id) return;
        const dy = e.clientY - from.y;
        start.current = undefined;
        if (dir === "down" && sheet.current) {
          sheet.current.style.transform = "";
          if (dy > CLOSE_PULL) p.onOpen(false);
        }
      },
      onPointerCancel: () => {
        start.current = undefined;
        if (sheet.current) sheet.current.style.transform = "";
      },
    };
  };
  // A pull isn't also a tap.
  const tap = (open: boolean) => () => {
    if (pulled.current) {
      pulled.current = false;
      return;
    }
    p.onOpen(open);
  };

  const effects = p.lean ? p.connected.flatMap((r) => (r.effect?.[p.lean!] ? [{ ...r.effect[p.lean!]!, name: r.name }] : [])) : [];
  const parts = [p.answered ? `${p.answered} answered` : "", p.connected.length ? `${p.connected.length} connected` : "", p.next ? `${p.next} next` : ""].filter(Boolean);
  const flag = p.connected.some((r) => r.kind === "conflict" || r.kind === "rule");
  const fx = effects.length ? (effects.some((e) => e.bad) ? "bad" : "good") : undefined;

  return (
    <>
      <div className="sheet-bar" data-fx={fx} inert={p.inert}>
        <button type="button" ref={bar} className="sheet-peek" aria-expanded={p.open} aria-controls="path-sheet" onClick={tap(!p.open)} {...pull("up")}>
          <span className="grip" aria-hidden="true" />
          <span className="peek-text">
            {fx ? (
              effects.map((e, i) => (
                <span key={i} className={e.bad ? "fx bad" : "fx good"}>
                  {e.bad ? "✗" : "✓"} {cap(e.text)}: {e.name}
                </span>
              ))
            ) : (
              <>
                <b>Your path</b>
                {parts.length > 0 && <span className="soft">{parts.join(" · ")}</span>}
                {flag && <i className="rdot c" aria-hidden="true" />}
              </>
            )}
          </span>
        </button>
      </div>
      {p.open && (
        <>
          <div className="sheet-backdrop" aria-hidden="true" onClick={() => p.onOpen(false)} />
          <div className="sheet" id="path-sheet" role="dialog" aria-modal="true" aria-label="Your path" ref={sheet}>
            <button type="button" ref={head} className="sheet-head" onClick={tap(false)} {...pull("down")}>
              <span className="grip" aria-hidden="true" />
              <b>Your path</b>
              <span className="soft">Close</span>
            </button>
            <div className="sheet-body">
              <div className="sheet-path">{p.children}</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
