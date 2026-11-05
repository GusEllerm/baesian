import { type MotionStyle, type MotionValue, animate, motion, useMotionValue } from "motion/react";
import { type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// B-yfehp: on a touch screen, a card is answered by holding it until it lifts, then dragging it toward an answer. A drag
// that moves before the card lifts is the page's: it scrolls, on every card, long or short, wherever it starts, text or
// not. Held still for LIFT_MS, the card rises off the desk (a little larger, a deeper shadow), the desk dims, and each
// answer is named at its edge of the screen (<LiftSignals />). Lifted, the card follows the finger, the page doesn't
// scroll, and the answer it's dragged toward lights up, filling as it goes, until it says to let go. Letting go there
// answers as that swipe always has (the card's onReach, so the gesture table, the reveal and the rest are the desk's);
// letting go short of it puts the card down. Taps still answer, and a hold never also clicks.
//
// Pointer events carry the logic; a non-passive touchmove stops the page scrolling while the card is lifted, the
// pointer is captured on lift, and the long press opens no menu (style.css keeps it from selecting text or opening the
// callout). A mouse, and every pointer on a screen that isn't mainly touch, keep the desktop's drag (Desk.tsx).

export type Dir = "left" | "right" | "up" | "down";
const DIRS: readonly Dir[] = ["left", "right", "up", "down"];

/** How long a finger holds the card still before it lifts: 350 ms, the user's choice (B-yfehp). */
export const LIFT_MS = 350;
/** How far a finger may wander while it holds, before the hold counts as a scroll. */
export const LIFT_SLOP = 8;
/** How far a lifted card goes to reach an answer: sideways, and up or down; less where the screen's edge is nearer. */
const REACH_X = 96, REACH_Y = 110;
/** The least a reach can be, and how much of the room to the screen's edge it takes when that room is short. */
const REACH_MIN = 44, REACH_ROOM = 0.7;
/** Until it has moved this far, a lifted card points at no answer. */
const DEAD = 12;
/** The card rises a little while held, and a little more once lifted; a lifted card tilts less as it moves. */
const PRESS_SCALE = 1.012, LIFT_SCALE = 1.035;
export const LIFT_TILT = 0.035;
const SPRING = { type: "spring", stiffness: 520, damping: 34 } as const;

/** What the card says on a touch screen, where there are no arrows (B-yfehp). */
export const LIFT_HINT = "Hold the card until it lifts, then drag it to an answer.";

/** An answer as it's named at its edge of the screen: what it is, and the two words above it, before and once it's reached. */
export interface LiftLabel {
  name: string;
  /** The two options are in their sides' colours; the rest in ink. */
  tone: "left" | "right" | "ink";
  hint: string;
  letGo: string;
}
export type LiftLabels = Partial<Record<Dir, LiftLabel>>;
export const choiceLabel = (name: string, tone: "left" | "right"): LiftLabel => ({ name, tone, hint: "Choose", letGo: "Let go to choose" });
export const answerLabel = (name: string): LiftLabel => ({ name, tone: "ink", hint: "Answer", letGo: "Let go to answer" });

/**
 * A lifted card, as it renders: the answer it's dragged toward, and whether it has reached it. Only a lift renders; a
 * hold before it is marked on the element (`data-lift="pressing"`), since a render between a tap's press and its click
 * moves the click off the button tapped, in Chromium.
 */
export interface LiftState {
  phase: "lifted";
  dir: Dir | undefined;
  armed: boolean;
}

/** How far a lifted card must go each way, from where the finger lifted it on a screen this size. */
export function reachFrom(x0: number, y0: number, width: number, height: number): Record<Dir, number> {
  const room: Record<Dir, number> = { left: x0, right: width - x0, up: y0, down: height - y0 };
  const reach = (d: Dir) => Math.max(REACH_MIN, Math.min(d === "left" || d === "right" ? REACH_X : REACH_Y, room[d] * REACH_ROOM));
  return { left: reach("left"), right: reach("right"), up: reach("up"), down: reach("down") };
}

/** Which of `dirs` a lifted card dragged by (dx, dy) points to, and how far toward it: 1 at its reach. */
export function pointing(dx: number, dy: number, dirs: readonly Dir[], reach: Record<Dir, number>): { dir: Dir | undefined; progress: number } {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DEAD) return { dir: undefined, progress: 0 };
  const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
  if (!dirs.includes(dir)) return { dir: undefined, progress: 0 };
  return { dir, progress: Math.abs(dir === "left" || dir === "right" ? dx : dy) / reach[dir] };
}

/** A light vibration, where the phone allows one: iPhones ignore it, and browsers refuse it before the page's first tap. */
function buzz(ms: number) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch {
    // Not allowed here: the lift needs none.
  }
}

interface Session {
  id: number;
  x0: number;
  y0: number;
  timer: number;
  phase: "pressing" | "lifted";
  dir: Dir | undefined;
  armed: boolean;
  reach: Record<Dir, number>;
}

/**
 * The hold and the lifted drag, for a card whose element is `el` and whose motion is `x`, `y` and `scale`. `dirs` are
 * the answers it has now; with none, or off a touch screen, it never lifts. `onMouse` is a mouse's press on a touch
 * screen, which drags as on a desktop. Spread `handlers` on the card, and mark it with `attr` (`data-lift`).
 */
export function useLift(o: {
  el: RefObject<HTMLElement | null>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  touch: boolean;
  dirs: readonly Dir[];
  onReach: (dir: Dir) => void;
  reduced: boolean;
  onMouse?: (e: PointerEvent<HTMLElement>) => void;
}) {
  const [state, setState] = useState<LiftState>();
  /** 1 while the card is lifted, for the transforms that change with it (its tilt, which option it lights). */
  const lifted = useMotionValue(0);
  /** How far toward the answer it points to the lifted card has gone, 0 to 1. */
  const progress = useMotionValue(0);
  const session = useRef<Session>(undefined);
  /** A hold ended: the click the browser may send after it isn't a tap. */
  const noClick = useRef(false);
  const latest = useRef(o);
  latest.current = o;
  const enabled = o.touch && o.dirs.length > 0;

  const putDown = (choose?: Dir) => {
    const s = session.current;
    if (!s) return;
    clearTimeout(s.timer);
    session.current = undefined;
    const { x, y, scale, reduced, el, onReach } = latest.current;
    lifted.set(0);
    progress.set(0);
    if (s.phase === "lifted") {
      setState(undefined);
      const back = reduced ? { duration: 0 } : SPRING;
      animate(x, 0, back);
      animate(y, 0, back);
      animate(scale, 1, back);
    } else {
      if (el.current?.dataset.lift === "pressing") el.current.dataset.lift = "ready";
      animate(scale, 1, reduced ? { duration: 0 } : { duration: 0.12 });
    }
    if (choose) onReach(choose);
  };

  const lift = () => {
    const s = session.current;
    if (!s || s.phase !== "pressing") return;
    const { el, scale, reduced } = latest.current;
    s.phase = "lifted";
    s.reach = reachFrom(s.x0, s.y0, window.innerWidth, window.innerHeight);
    try {
      el.current?.setPointerCapture(s.id);
    } catch {
      // The finger has already gone: its pointerup puts the card down.
    }
    lifted.set(1);
    animate(scale, LIFT_SCALE, reduced ? { duration: 0 } : SPRING);
    buzz(12);
    setState({ phase: "lifted", dir: undefined, armed: false });
  };

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      noClick.current = false;
      const { touch, el, scale, reduced, onMouse } = latest.current;
      if (!touch) return;
      if (e.pointerType === "mouse") return onMouse?.(e);
      if (!enabled || session.current || !e.isPrimary) return;
      // The card grows and turns about the finger, so the point you hold stays under it.
      const node = el.current;
      if (node) {
        const r = node.getBoundingClientRect();
        node.style.transformOrigin = `${e.clientX - r.left}px ${e.clientY - r.top}px`;
      }
      session.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, phase: "pressing", dir: undefined, armed: false, reach: reachFrom(0, 0, 0, 0), timer: window.setTimeout(lift, LIFT_MS) };
      // Marked on the element, not rendered: a tap renders nothing between its press and its click, which a render
      // there could move off the button tapped (the browser then clicks the card's face).
      if (node) node.dataset.lift = "pressing";
      if (!reduced) animate(scale, PRESS_SCALE, { duration: LIFT_MS / 1000, ease: "easeIn" });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
      // Moving before it lifts is a scroll, the page's to do.
      if (s.phase === "pressing") {
        if (Math.hypot(dx, dy) > LIFT_SLOP) putDown();
        return;
      }
      latest.current.x.set(dx);
      latest.current.y.set(dy);
      const { dir, progress: p } = pointing(dx, dy, latest.current.dirs, s.reach);
      progress.set(Math.min(1, p));
      const armed = p >= 1;
      if (armed && !s.armed) buzz(8);
      if (dir !== s.dir || armed !== s.armed) {
        s.dir = dir;
        s.armed = armed;
        setState({ phase: "lifted", dir, armed });
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || e.pointerId !== s.id) return;
      if (s.phase === "lifted") noClick.current = true;
      putDown(s.phase === "lifted" && s.armed ? s.dir : undefined);
    },
    // The browser took the finger, to scroll or for a gesture of its own: nothing is chosen.
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      if (session.current && e.pointerId === session.current.id) putDown();
    },
  };

  useEffect(() => {
    const node = o.el.current;
    if (!node) return;
    // Lifted, the card has the finger: the page doesn't scroll under it. Not passive, or it couldn't stop the scroll.
    const move = (e: TouchEvent) => {
      if (session.current?.phase === "lifted" && e.cancelable) e.preventDefault();
    };
    // A hold that lifted the card ends in no click: letting go over an option, or where it started, chooses nothing.
    const click = (e: MouseEvent) => {
      if (!noClick.current) return;
      noClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // The long press opens no menu.
    const menu = (e: Event) => {
      if (session.current) e.preventDefault();
    };
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("click", click, true);
    node.addEventListener("contextmenu", menu);
    // Once it's back where it rests, it turns and grows about its middle again, as when it leaves. Whichever animation
    // brings it back: the reveal's own can take over from the put-down's.
    const { x, y, scale } = latest.current;
    const rested = () => {
      if (node.style.transformOrigin && !session.current && x.get() === 0 && y.get() === 0 && scale.get() === 1) node.style.transformOrigin = "";
    };
    const offs = [x, y, scale].map((v) => v.on("animationComplete", rested));
    return () => {
      node.removeEventListener("touchmove", move);
      node.removeEventListener("click", click, true);
      node.removeEventListener("contextmenu", menu);
      for (const off of offs) off();
      clearTimeout(session.current?.timer);
    };
  }, [o.el]);

  return { lift: state, lifted, progress, handlers, attr: enabled || state ? (state?.phase ?? "ready") : undefined };
}

/**
 * While a card is lifted: the desk dimmed under it, and each answer named at its edge of the screen, the one it's
 * dragged toward lit and filling, until it says to let go. Fixed to the screen, so outside the card, whose transform
 * would carry it along.
 */
export function LiftSignals({ labels, lift, progress }: { labels: LiftLabels; lift: LiftState; progress: MotionValue<number> }) {
  return createPortal(
    <>
      <div className="lift-dim" aria-hidden="true" />
      <motion.div className="lift-signals" aria-hidden="true" data-dir={lift.dir} style={{ "--a": progress } as MotionStyle}>
        {DIRS.map((d) => {
          const label = labels[d];
          if (!label) return null;
          const on = lift.dir === d;
          const armed = on && lift.armed;
          return (
            <div key={d} className={`sig ${d}${on ? " on" : ""}${armed ? " armed" : ""}`} data-tone={label.tone}>
              <small>{armed ? label.letGo : label.hint}</small>
              <b>{label.name}</b>
            </div>
          );
        })}
      </motion.div>
    </>,
    document.body,
  );
}
