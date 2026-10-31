import { AnimatePresence, type MotionStyle, animate, motion, useIsPresent, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ApiCard, ApiState } from "../../src/api";
import type { OptionKind } from "../../src/schema";
import { type Answer, HOLD_MS, READ_FIRST_MS, UNDO_MS, describeAnswer, verdictFor } from "./answer";
import { Card, type CardProps, type Mode, type Side } from "./Card";
import { byId, liveDependents, queue, rarityOf, serverNow, sidesFor, stakesLine, waitState } from "./model";
import { Outbox, postVerdict } from "./outbox";

// M4 step 5c: the desk, where you answer. It holds what you've answered this session, the mode the card is in,
// the reading time (D91), the keys, the lean and the drag, the hold on mythic cards (D67), and the undo window
// (D82). Every card goes through the reveal (D86). Round 5's behaviour, ported: design/explorations/round5/app.js.

const THRESH_X = 150, THRESH_Y = 110;
type Dir = Side | "up" | "down";
/** How the card on the desk leaves: toward the answer you gave, or, moving between cards or undoing, just fading. */
type Leave = Dir | "fade";

interface Answered {
  answer: Answer;
  phase: "held" | "sent";
  words: string;
  agent: string;
}
interface Toast {
  text: string;
  undoUntil?: number;
  id: number;
}

/** A card's identity for this session: a revised card is a new question, so it comes back. */
const keyOf = (c: ApiCard) => `${c.meta.id}@${c.meta.revision}`;

export function Desk({ state, fetchedAt }: { state: ApiState; fetchedAt: number }) {
  const salt = useMemo(() => Math.random().toString(36).slice(2), []);
  const [answered, setAnswered] = useState<Map<string, Answered>>(() => new Map());
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  const [pick, setPick] = useState<string>();
  const [mode, setMode] = useState<Mode>({ kind: "live" });
  const [problem, setProblem] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [lean, setLean] = useState<Side>();
  const [hold, setHold] = useState<number>();
  const [nudged, setNudged] = useState(0);
  const firstChoice = useRef(new Map<string, OptionKind>());
  const exitDir = useRef<Leave>("fade");

  const now = serverNow(state, fetchedAt);
  const cards = byId(state);
  const ordered = queue(state, now).filter((c) => !answered.has(keyOf(c)));
  const current = (pick ? ordered.find((c) => c.meta.id === pick) : undefined) ?? ordered[0];
  const key = current ? keyOf(current) : "";
  const deps = current ? liveDependents(current, cards).length : 0;
  const r = current ? rarityOf(current, deps) : undefined;
  const sides = current ? sidesFor(current.meta.id, salt) : { left: "alternative" as const, right: "proposal" as const };
  const sideOf = (kind: OptionKind): Side => (sides.left === kind ? "left" : "right");

  // A new card starts in the choice, with its reading time (D91). Reset while rendering, not in an effect: an effect
  // runs after the paint, and could land after the first key you press on the new card.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setMode({ kind: "live" });
    setProblem(undefined);
    setLean(undefined);
    setShownAt(performance.now());
  }
  const dwell = r ? READ_FIRST_MS[r.rarity] : 0;
  const [, setFrame] = useState(0);
  const readLeft = Math.max(0, dwell - (performance.now() - shownAt));
  useEffect(() => {
    if (readLeft <= 0) return;
    const f = requestAnimationFrame(() => setFrame((n) => n + 1));
    return () => cancelAnimationFrame(f);
  });

  const say = (text: string, undoUntil?: number) => setToast({ text, ...(undoUntil ? { undoUntil } : {}), id: Date.now() + Math.random() });

  // The undo window (D82): one answer waits; undo takes it back; the next answer, or closing the page, sends it.
  const outbox = useRef<Outbox>(undefined);
  if (!outbox.current) {
    outbox.current = new Outbox(postVerdict, UNDO_MS, {
      sent: (k) => {
        const a = answeredRef.current.get(k);
        setAnswered((m) => (m.has(k) ? new Map(m).set(k, { ...m.get(k)!, phase: "sent" }) : m));
        say(`Sent to ${a?.agent ?? "the agent"}.`);
      },
      failed: (k, error) => {
        setAnswered((m) => {
          const n = new Map(m);
          n.delete(k);
          return n;
        });
        say(`That answer wasn't recorded: ${error}. The card is back.`);
      },
    });
  }
  useEffect(() => {
    const leave = () => outbox.current!.flush(true);
    addEventListener("pagehide", leave);
    return () => removeEventListener("pagehide", leave);
  }, []);

  const commit = (answer: Answer) => {
    if (!current) return;
    const v = verdictFor(current, answer);
    if ("problem" in v) return setProblem(v.problem);
    const words = describeAnswer(current, answer);
    exitDir.current = answer.kind === "choose" ? sideOf(answer.option) : answer.kind === "write" ? "up" : "down";
    setAnswered((m) => new Map(m).set(key, { answer, phase: "held", words, agent: current.meta.source_agent }));
    const held = outbox.current!.hold(key, v.verdict);
    say(`${words} Sending to ${current.meta.source_agent} in`, held.until);
    setPick(undefined);
  };

  const undo = () => {
    const k = outbox.current!.undo();
    if (!k) return;
    setAnswered((m) => {
      const n = new Map(m);
      n.delete(k);
      return n;
    });
    exitDir.current = "fade";
    setPick(k.split("@")[0]);
    say("Undone. The card is back.");
  };

  const reach = (dir: Dir) => {
    if (!current || mode.kind !== "live") return;
    setLean(undefined);
    if (dir === "up") return setMode({ kind: "write", text: "" });
    if (dir === "down") return setMode({ kind: "pass", text: "" });
    if (readLeft > 0) return setNudged((n) => n + 1);
    const option = sides[dir];
    // The choice made before the agent's pick was ever shown is the one recorded (D88), even after Esc.
    if (!firstChoice.current.has(key)) firstChoice.current.set(key, option);
    setMode({ kind: "reveal", option, side: dir, first: firstChoice.current.get(key)!, why: "" });
  };

  const confirm = () => {
    if (mode.kind !== "reveal") return;
    commit({ kind: "choose", option: mode.option, first: mode.first, ...(mode.why.trim() ? { why: mode.why } : {}) });
  };
  const switchToPick = () => mode.kind === "reveal" && setMode({ ...mode, option: "proposal", side: sideOf("proposal"), why: "" });
  const send = () => {
    if (mode.kind !== "write" && mode.kind !== "pass") return;
    if (!mode.reason) return setProblem("Choose a reason first.");
    commit(mode.kind === "write" ? { kind: "write", reason: mode.reason, text: mode.text } : { kind: "pass", reason: mode.reason, text: mode.text });
  };
  const back = () => {
    setMode({ kind: "live" });
    setProblem(undefined);
  };

  // A mythic card is held to confirm (D67): the bar fills over HOLD_MS; letting go early starts again.
  const holdStart = useRef<number>(undefined);
  const beginHold = () => {
    if (mode.kind !== "reveal" || holdStart.current !== undefined) return;
    holdStart.current = performance.now();
    const step = () => {
      if (holdStart.current === undefined) return;
      const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdStart.current = undefined;
        setHold(undefined);
        return handlers.current.confirm();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const endHold = () => {
    if (holdStart.current === undefined) return;
    holdStart.current = undefined;
    setHold(undefined);
    say("Keep holding until the bar fills.");
  };

  // The keys, read through a ref so the listeners always see the latest state.
  const handlers = useRef({ mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity });
  handlers.current = { mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity };
  const keyHeld = useRef<Side>(undefined);
  // Before the first paint, so a key pressed the moment the card appears is never missed.
  useLayoutEffect(() => {
    const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const down = (e: KeyboardEvent) => {
      const h = handlers.current;
      if (e.key === "Escape") {
        if (h.mode.kind !== "live") h.back();
        else if (keyHeld.current) {
          keyHeld.current = undefined;
          setLean(undefined);
        }
        return;
      }
      if (e.target instanceof Element && e.target.closest("input, textarea")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "z" || e.key === "Z") return h.undo();
      if ((e.key === "j" || e.key === "k") && h.mode.kind === "live" && h.ordered.length) {
        const i = h.current ? h.ordered.indexOf(h.current) : -1;
        const next = h.ordered[(i + (e.key === "j" ? 1 : h.ordered.length - 1) + h.ordered.length) % h.ordered.length];
        exitDir.current = "fade";
        return setPick(next?.meta.id);
      }
      const dir = ARROWS[e.key];
      if (!dir || !h.current) return;
      e.preventDefault();
      if (e.repeat) return;
      if (h.mode.kind === "reveal") {
        if (dir !== h.mode.side) return;
        keyHeld.current = dir;
        return h.rarity === "mythic" ? h.beginHold() : h.confirm();
      }
      if (h.mode.kind !== "live") return;
      if (dir === "up" || dir === "down") return h.reach(dir);
      // Holding an arrow leans the card toward that option; letting go chooses it.
      keyHeld.current = dir;
      setLean(dir);
    };
    const up = (e: KeyboardEvent) => {
      const dir = ARROWS[e.key];
      if (!dir || keyHeld.current !== dir) return;
      keyHeld.current = undefined;
      const h = handlers.current;
      if (h.mode.kind === "reveal") return h.endHold();
      if (h.mode.kind === "live") h.reach(dir);
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, []);

  const waitingNow = ordered.filter((c) => waitState(c, now) === "waiting").length;
  const summary = ordered.length
    ? `${ordered.length} to answer.${waitingNow ? ` ${waitingNow === 1 ? "An agent has" : `${waitingNow} agents have`} stopped for you.` : ""}`
    : "Nothing to answer.";

  return (
    <>
      <header className="bar">
        <span className="wordmark">Baesian</span>
        <p className="summary" aria-live="polite">
          {summary}
        </p>
      </header>
      <main className="desk">
        <section className="stage" aria-label="The card to answer">
          {/* Not mode="popLayout": that injects a <style> element, which the page's policy refuses (D99). A leaving
              card is taken out of the flow by style.css instead, through its data-leaving mark. */}
          <AnimatePresence custom={exitDir.current} initial={false}>
            {current && r ? (
              <LiveCard
                key={key}
                exit={exitDir.current}
                lean={lean}
                nudged={nudged}
                locked={readLeft > 0}
                rarity={r.rarity}
                card={{
                  card: current,
                  rarity: r.rarity,
                  stakes: stakesLine(current, deps),
                  wait: waitState(current, now),
                  sides,
                  mode,
                  readLeftMs: readLeft,
                  readFraction: dwell ? 1 - readLeft / dwell : 1,
                  ...(hold !== undefined ? { hold } : {}),
                  ...(problem ? { problem } : {}),
                  onReach: reach,
                  onMode: (m) => {
                    setProblem(undefined);
                    setMode(m);
                  },
                  onConfirm: confirm,
                  onSwitch: switchToPick,
                  onBack: back,
                  onSend: send,
                  onHoldStart: beginHold,
                  onHoldEnd: endHold,
                }}
              />
            ) : (
              <motion.div key="empty" className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="big">All caught up.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      <ToastView toast={toast} onUndo={undo} onDone={() => setToast(undefined)} />
    </>
  );
}

/** One card on the desk, with its own motion: the lean, the drag, and leaving toward the side you chose. */
function LiveCard(p: { card: CardProps; lean: Side | undefined; nudged: number; locked: boolean; exit: Leave; rarity: string }) {
  const reduced = useReducedMotion();
  // A card that's leaving keeps its last props for its exit. It must not answer again: no clicks, no drag.
  const present = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pl = useTransform(x, [-THRESH_X, 0], [1, 0], { clamp: true });
  const pr = useTransform(x, [0, THRESH_X], [0, 1], { clamp: true });
  const live = p.card.mode.kind === "live" && present;

  useEffect(() => {
    const to = live && p.lean ? (p.lean === "left" ? -0.7 : 0.7) * THRESH_X : 0;
    const a = animate(x, to, reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 });
    return () => a.stop();
  }, [p.lean, live, reduced, x]);

  // Too early (D91): the card shakes its head.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!reduced) animate(x, [0, -6, 6, 0], { duration: 0.32 });
  }, [p.nudged, reduced, x]);

  const out = (dir: Leave) => ({
    x: dir === "left" ? -130 : dir === "right" ? 130 : 0,
    y: dir === "up" ? -40 : dir === "down" ? 40 : 0,
    rotate: dir === "left" ? -6 : dir === "right" ? 6 : 0,
    opacity: 0,
    transition: { duration: reduced ? 0 : 0.22, ease: "easeIn" as const },
  });

  return (
    <motion.article
      className={`card rarity-${p.rarity}`}
      data-mode={p.card.mode.kind}
      data-locked={p.locked || undefined}
      data-leaving={present ? undefined : true}
      inert={!present}
      aria-label={p.card.card.meta.question}
      style={{ x, y, "--pl": pl, "--pr": pr, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24 } }}
      exit={out(p.exit)}
      drag={live}
      dragSnapToOrigin
      dragElastic={0.16}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={(_e, info) => {
        const { x: dx, y: dy } = info.offset;
        const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy < 0 ? "up" : "down";
        const progress = Math.max(Math.abs(dx) / THRESH_X, Math.abs(dy) / THRESH_Y);
        const speed = dir === "left" || dir === "right" ? Math.abs(info.velocity.x) : Math.abs(info.velocity.y);
        if (progress >= 1 || (speed > 900 && progress > 0.3)) p.card.onReach(dir);
      }}
    >
      <div className="frame" aria-hidden="true" />
      <Card {...p.card} />
    </motion.article>
  );
}

/** The toast: what just happened, and, while an answer waits, the way to take it back (Z). */
function ToastView({ toast, onUndo, onDone }: { toast: Toast | undefined; onUndo: () => void; onDone: () => void }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!toast) return;
    const t = setInterval(() => setNow((n) => n + 1), 250);
    const done = setTimeout(onDone, toast.undoUntil ? Math.max(0, toast.undoUntil - Date.now()) + 200 : 2400);
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
  }, [toast]);
  if (!toast) return null;
  const left = toast.undoUntil ? Math.max(1, Math.ceil((toast.undoUntil - Date.now()) / 1000)) : 0;
  return (
    <div className="toast on" role="status">
      <span>
        {toast.text}
        {toast.undoUntil ? <> {left}&nbsp;s.</> : null}
      </span>
      {toast.undoUntil && (
        <button type="button" className="undo" onClick={onUndo}>
          Undo <kbd>Z</kbd>
        </button>
      )}
    </div>
  );
}
