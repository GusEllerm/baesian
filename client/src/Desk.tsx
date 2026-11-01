import { AnimatePresence, type MotionStyle, animate, motion, useIsPresent, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ApiAliasInput, ApiCard, ApiState } from "../../src/api";
import { nearTopics } from "../../src/similarity";
import type { OptionKind } from "../../src/schema";
import { type Answer, HOLD_MS, READ_FIRST_MS, UNDO_MS, describeAnswer, verdictFor } from "./answer";
import { laterSuperseded, recap } from "./calibration";
import { ARROW, Card, type CardProps, type Mode, type Side } from "./Card";
import { usePresence } from "./live";
import { addSpent, loadSpent, useSeen } from "./local";
import { type Rarity, areaOf, byId, keyOf, liveDependents, parked, queue, rarityOf, relationsOf, serverNow, sidesFor, stakesLine, waitState } from "./model";
import { useNotifications } from "./notify";
import { Outbox, postVerdict } from "./outbox";
import { CalibrationPanel, EmptyDesk, KeysPanel, MoreMenu, type PanelKind, moveInMenu } from "./Panels";
import { Path } from "./Path";

// M4 steps 5c to 5e: the desk, where you answer. It holds what you've answered this session, the mode the card is
// in, the reading time (D91), the keys, the lean and the drag, the hold on mythic cards (D67), and the undo window
// (D82); every card goes through the reveal (D86). Beside the card, the path (Path.tsx); under it, the pile of the
// rest of its area. In the header, the menu and its panels (Panels.tsx). While it's open, it says you're there
// (D41), and notifies you of cards an agent stops for (D40). Round 5's behaviour, ported:
// design/explorations/round5/app.js.

/** How far a drag must go to choose: sideways, and up or down. */
const THRESH_X = 150, THRESH_Y = 110;
/** The card follows a drag only this much, held to the desk. */
const DRAG_ELASTIC = 0.16;
/**
 * How far the card moves when a drag reaches its threshold, and so the most it leans. Round 5 leaned a held arrow
 * 105 px, which slid the card over the path and hid the very rows that light up to say what leaning does (5f).
 */
const LEAN_X = THRESH_X * DRAG_ELASTIC;
const NEXT_MAX = 3;
/** Small counts in words, as round 5's summary has them. */
const NUMBER = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** The flight of your choice into the path, and the pause before the next card arrives. */
const MOVE_MS = 700;
type Dir = Side | "up" | "down";
/** How the card on the desk leaves: toward the answer you gave, or, moving between cards or undoing, just fading. */
type Leave = Dir | "fade";

interface Answered {
  answer: Answer;
  phase: "held" | "sent";
  words: string;
  agent: string;
  /** For the path: the card's name and rarity, and your answer in a few words. */
  name: string;
  rarity: Rarity;
  state: string;
}
interface Toast {
  text: string;
  undoUntil?: number;
  id: number;
}
interface Fly {
  key: string;
  from: { x: number; y: number };
  text: string;
}

/** Your answer, as the path says it. */
function pathState(card: ApiCard, answer: Answer): string {
  if (answer.kind === "choose") return answer.option === "proposal" ? `you chose “${card.meta.proposal}”` : `you chose “${card.meta.alternative}”, not ${card.meta.source_agent}'s pick`;
  return answer.kind === "write" ? "you wrote an answer" : "you couldn't judge it";
}

/** Fixed per card, so the pile looks tossed together but doesn't jitter between answers. */
function messy(id: string, depth: number) {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { r: ((h % 9) - 4) * 0.55 + (depth % 2 ? 0.9 : -0.9), dx: ((h >> 4) % 9) - 4, dy: 3 + depth * 3 + ((h >> 8) % 3) };
}

export function Desk({ state, fetchedAt }: { state: ApiState; fetchedAt: number }) {
  const salt = useMemo(() => Math.random().toString(36).slice(2), []);
  const reduced = useReducedMotion();
  const [answered, setAnswered] = useState<Map<string, Answered>>(() => new Map());
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  const [pick, setPick] = useState<string>();
  /** A card you've answered this session, reopened from the path. */
  const [reviewing, setReviewing] = useState<string>();
  const [mode, setMode] = useState<Mode>({ kind: "live" });
  const [problem, setProblem] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [lean, setLean] = useState<Side>();
  const [hover, setHover] = useState<Side>();
  const [hold, setHold] = useState<number>();
  const [nudged, setNudged] = useState(0);
  const [fly, setFly] = useState<Fly>();
  const firstChoice = useRef(new Map<string, OptionKind>());
  const exitDir = useRef<Leave>("fade");
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind>();
  const project = state.project.name;
  usePresence();
  const seen = useSeen(state);

  const now = serverNow(state, fetchedAt);
  const cards = byId(state);
  const ordered = queue(state, now).filter((c) => !answered.has(keyOf(c)));
  const aside = parked(state).filter((c) => !answered.has(keyOf(c)));
  const reviewCard = reviewing ? state.cards.find((c) => keyOf(c) === reviewing) : undefined;
  // The card in front of you stays until you answer it or move on. When the queue re-sorts (an answer reaching
  // the server, an agent starting to wait), that changes what comes next, never the card you're reading (5f).
  const [shownKey, setShownKey] = useState("");
  const staying = ordered.find((c) => keyOf(c) === shownKey);
  // A card you put aside can be answered after all: it's picked from the empty desk.
  const picked = pick ? (ordered.find((c) => c.meta.id === pick) ?? aside.find((c) => c.meta.id === pick)) : undefined;
  const current = reviewCard ?? picked ?? staying ?? ordered[0];
  const key = current ? keyOf(current) : "";
  const deps = current ? liveDependents(current, cards).length : 0;
  const r = current ? rarityOf(current, deps) : undefined;
  const sides = current ? sidesFor(current.meta.id, salt) : { left: "alternative" as const, right: "proposal" as const };
  const sideOf = (kind: OptionKind): Side => (sides.left === kind ? "left" : "right");

  // A new card starts in the choice (or, reopened from the path, in its answer), with its reading time (D91).
  // Reset while rendering, not in an effect: an effect runs after the paint, and could land after the first key
  // you press on the new card.
  const [shownAt, setShownAt] = useState(() => performance.now());
  if (shownKey !== key) {
    setShownKey(key);
    setMode(reviewing && reviewing === key ? { kind: "review" } : { kind: "live" });
    setProblem(undefined);
    setLean(undefined);
    setHover(undefined);
    setShownAt(performance.now());
  }
  // A card counts as seen once it's been on the desk: it loses its "new" tag.
  useEffect(() => {
    if (key) seen.mark(key);
  }, [key, seen.mark]);
  const dwell = r && mode.kind !== "review" ? READ_FIRST_MS[r.rarity] : 0;
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
    // How long the card was in front of you, for your calibration: first answers only, not changes.
    if (!reviewing) addSpent(project, { rarity: r!.rarity, ms: Math.round(performance.now() - shownAt), at: new Date().toISOString() });
    exitDir.current = answer.kind === "choose" ? sideOf(answer.option) : answer.kind === "write" ? "up" : "down";
    // Your choice flies from the card into the path (round 5's one sequenced movement).
    if (answer.kind === "choose" && !reduced) {
      const h2 = document.querySelector<HTMLElement>(`.stage article.card:not([data-leaving]) .opt[data-kind="${answer.option}"] h2`);
      const rect = h2?.getBoundingClientRect();
      if (rect) setFly({ key, from: { x: rect.left, y: rect.top }, text: current.meta[answer.option] });
    }
    // A changed answer keeps its place on the path (Map.set keeps the order) and replaces what was there.
    setAnswered((m) =>
      new Map(m).set(key, { answer, phase: "held", words, agent: current.meta.source_agent, name: current.meta.title, rarity: r!.rarity, state: pathState(current, answer) }),
    );
    const held = outbox.current!.hold(key, v.verdict);
    // Round 5 took your answer out of this toast: the path shows it.
    say(`Sending to ${current.meta.source_agent} in`, held.until);
    setPick(undefined);
    setReviewing(undefined);
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
    setReviewing(undefined);
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
    commit({ kind: "choose", option: mode.option, first: mode.first, ...(mode.why.trim() ? { why: mode.why } : {}), ...(mode.rule ? { rule: true } : {}) });
  };
  const switchToPick = () => mode.kind === "reveal" && setMode({ ...mode, option: "proposal", side: sideOf("proposal"), why: "" });
  const send = () => {
    if (mode.kind !== "write" && mode.kind !== "pass") return;
    if (!mode.reason) return setProblem("Choose a reason first.");
    commit(mode.kind === "write" ? { kind: "write", reason: mode.reason, text: mode.text, ...(mode.rule ? { rule: true } : {}) } : { kind: "pass", reason: mode.reason, text: mode.text });
  };
  const back = () => {
    setProblem(undefined);
    if (reviewing && (mode.kind === "review" || answered.has(reviewing))) {
      exitDir.current = "fade";
      setReviewing(undefined);
      return;
    }
    setMode({ kind: "live" });
  };

  /** Changing an answer you've already given (D81): the card comes back to the choice, where it was on the path. */
  const change = () => {
    if (!reviewing) return;
    const a = answered.get(reviewing);
    if (a?.phase === "held") {
      outbox.current!.undo();
      setAnswered((m) => {
        const n = new Map(m);
        n.delete(reviewing);
        return n;
      });
    }
    setMode({ kind: "live" });
    setShownAt(performance.now());
  };

  /** Clicking a decision on the path: a card to answer opens; one you've answered reopens. */
  const goTo = (id: string) => {
    if (mode.kind === "write" || mode.kind === "pass") return say("Send or cancel your written answer first.");
    if (id === current?.meta.id) return;
    exitDir.current = "fade";
    const answeredKey = [...answered.keys()].find((k) => k.startsWith(`${id}@`));
    if (answeredKey) return setReviewing(answeredKey);
    setReviewing(undefined);
    setPick(id);
  };

  // Topics that look like the card's (D44, D111): the same rule `baesian file` warns with, over the topics in use.
  const topicCounts = new Map<string, number>();
  for (const c of state.cards) topicCounts.set(c.canonicalTopic, (topicCounts.get(c.canonicalTopic) ?? 0) + 1);
  const near = current ? nearTopics(current.canonicalTopic, topicCounts.keys()).map((topic) => ({ topic, count: topicCounts.get(topic)! })) : [];
  const merge = async (into: string) => {
    if (!current) return;
    const from = current.canonicalTopic;
    const body: ApiAliasInput = { from, to: into };
    try {
      const r = await fetch("/api/aliases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `the server answered ${r.status}`);
      say(`Merged: “${from}” now counts as “${into}”.`);
    } catch (e) {
      say(`The topics weren't merged: ${e instanceof Error ? e.message : String(e)}.`);
    }
  };

  const notifications = useNotifications(state, goTo);
  const toggleNotify = async () => {
    const was = notifications.status;
    const now = await notifications.toggle();
    if (now === "on") say("Notifications are on. Keep this page open to get them.");
    else if (now === "blocked") say("Your browser blocks notifications for this page. Its site settings can allow them.");
    else if (was === "on") say("Notifications are off.");
  };
  const showPanel = (kind: PanelKind) => setPanel((p) => (p === kind ? undefined : kind));

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
  const handlers = useRef({ mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity, menuOpen, panel });
  handlers.current = { mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity, menuOpen, panel };
  const keyHeld = useRef<Side>(undefined);
  // Before the first paint, so a key pressed the moment the card appears is never missed.
  useLayoutEffect(() => {
    const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const down = (e: KeyboardEvent) => {
      const h = handlers.current;
      // The menu, while it's open, has the keys to itself.
      if (h.menuOpen) {
        if (e.key === "Escape") setMenuOpen(false);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          moveInMenu(e.key === "ArrowDown" ? "down" : "up");
        }
        return;
      }
      if (e.key === "Escape") {
        if (h.panel) setPanel(undefined);
        else if (h.mode.kind !== "live" || reviewingRef.current) h.back();
        else if (keyHeld.current) {
          keyHeld.current = undefined;
          setLean(undefined);
        }
        return;
      }
      // Typing goes to the field; a ticked box (make this a rule) leaves the keys to the card.
      if (e.target instanceof Element && e.target.closest('input:not([type="checkbox"]), textarea')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "z" || e.key === "Z") return h.undo();
      if (e.key === "?") return setPanel((p) => (p === "keys" ? undefined : "keys"));
      if ((e.key === "j" || e.key === "k") && h.mode.kind === "live" && h.ordered.length) {
        const i = h.current ? h.ordered.indexOf(h.current) : -1;
        const next = h.ordered[(i + (e.key === "j" ? 1 : h.ordered.length - 1) + h.ordered.length) % h.ordered.length];
        exitDir.current = "fade";
        setReviewing(undefined);
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
  const reviewingRef = useRef(reviewing);
  reviewingRef.current = reviewing;

  // The path: your answers this session, the card's relationships, and what's next.
  const relations = current ? relationsOf(current, state) : [];
  const relById = new Map(relations.map((x) => [x.id, x]));
  const trail = [...answered.entries()]
    .filter(([k]) => k !== key)
    .map(([k, a]) => {
      const id = k.split("@")[0]!;
      const link = relById.get(id);
      return { key: k, id, name: a.name, state: a.state, rarity: a.rarity, ...(link ? { link } : {}) };
    });
  const ahead = current ? ordered.filter((c) => c.meta.id !== current.meta.id) : [];
  const nextUp = ahead.slice(0, NEXT_MAX).map((c) => {
    const link = relById.get(c.meta.id);
    return {
      id: c.meta.id,
      name: c.meta.title,
      rarity: rarityOf(c, liveDependents(c, cards).length).rarity,
      stopped: waitState(c, now) === "waiting",
      fresh: seen.isNew(keyOf(c)),
      ...(link ? { link } : {}),
    };
  });
  const leanKind = mode.kind === "live" ? (lean ? sides[lean] : hover ? sides[hover] : undefined) : mode.kind === "reveal" ? mode.option : undefined;

  // The pile: the rest of this card's area, slightly messy, under it.
  const pile = current ? ahead.filter((c) => areaOf(c) === areaOf(current)).slice(0, 4) : [];
  const deck = current ? state.decks.find((d) => d.meta.id === current.meta.deck) : undefined;

  const waitingNow = ordered.filter((c) => waitState(c, now) === "waiting").length;
  const summary = ordered.length ? (
    <>
      <b>{ordered.length} to answer.</b>
      {waitingNow > 0 && (
        <>
          {" "}
          <span className="stop-dot" aria-hidden="true" />
          {NUMBER[waitingNow] ?? waitingNow} {waitingNow === 1 ? "agent has" : "agents have"} stopped for you.
        </>
      )}
    </>
  ) : (
    <b>Nothing to answer.</b>
  );

  return (
    <>
      <header className="bar">
        <span className="wordmark">Baesian</span>
        <p className="summary" aria-live="polite">
          {summary}
        </p>
        <MoreMenu open={menuOpen} notify={notifications.status} onOpen={setMenuOpen} onPanel={showPanel} onNotify={() => void toggleNotify()} />
      </header>
      {panel === "keys" && <KeysPanel onClose={() => setPanel(undefined)} />}
      {panel === "calibration" && <CalibrationPanel spent={loadSpent(project)} superseded={laterSuperseded(state)} onClose={() => setPanel(undefined)} />}
      <main className="desk">
        <Path
          trail={trail}
          current={current && r ? { id: current.meta.id, rarity: r.rarity, stopped: waitState(current, now) === "waiting", conflict: (current.meta.conflict_of?.length ?? 0) > 0 } : undefined}
          relations={relations}
          upcoming={nextUp}
          more={Math.max(0, ahead.length - NEXT_MAX)}
          lean={leanKind}
          optionLabel={(k) => `${ARROW[sideOf(k)]} “${current?.meta[k] ?? ""}”`}
          onGoTo={goTo}
          layoutKey={`${key}:${mode.kind}`}
          {...(fly ? { fly, onFlown: () => setFly(undefined) } : {})}
        />
        <section className="stage" aria-label="The card to answer">
          <p className="crumbs">
            {current && (
              <>
                {areaOf(current)} › <b>{deck?.meta.title ?? current.meta.deck}</b>
              </>
            )}
          </p>
          <div className="deck">
            <div className="pile" aria-hidden="true">
              {pile.map((c, i) => {
                const m = messy(c.meta.id, i + 1);
                return <div key={c.meta.id} className="under" style={{ "--r": `${m.r.toFixed(2)}deg`, "--dx": `${m.dx}px`, "--dy": `${m.dy}px`, zIndex: 10 - i } as CSSProperties} />;
              })}
            </div>
            {/* Not mode="popLayout": that injects a <style> element, which the page's policy refuses (D99). A leaving
                card is taken out of the flow by style.css instead, through its data-leaving mark. */}
            <AnimatePresence custom={exitDir.current} initial={false}>
              {current && r ? (
                <LiveCard
                  key={key}
                  exit={exitDir.current}
                  arriveAfter={fly && fly.key !== key ? MOVE_MS * 0.65 : 0}
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
                    ...(reviewing && answered.get(reviewing) ? { review: { words: answered.get(reviewing)!.words, sent: answered.get(reviewing)!.phase === "sent" } } : {}),
                    ...(near.length ? { near, onMerge: (into: string) => void merge(into) } : {}),
                    onReach: reach,
                    onMode: (m) => {
                      setProblem(undefined);
                      setMode(m);
                    },
                    onConfirm: confirm,
                    onSwitch: switchToPick,
                    onBack: back,
                    onSend: send,
                    onChange: change,
                    onHover: setHover,
                    onHoldStart: beginHold,
                    onHoldEnd: endHold,
                  }}
                />
              ) : (
                <motion.div key="empty" className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyDesk
                    recap={recap([...answered.values()].map((a) => a.answer))}
                    parked={aside}
                    notify={notifications.status}
                    onNotify={() => void toggleNotify()}
                    onOpen={goTo}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
      <ToastView toast={toast} onUndo={undo} onDone={() => setToast(undefined)} />
    </>
  );
}

/** Where a gesture that moved this far points, and whether it went far enough to choose. */
function gesture(dx: number, dy: number): { dir: Dir; progress: number } {
  const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy < 0 ? "up" : "down";
  return { dir, progress: Math.max(Math.abs(dx) / THRESH_X, Math.abs(dy) / THRESH_Y) };
}
/** A two-finger swipe ends once the wheel events stop for this long; the next can't start for the cooldown. */
const SWIPE_IDLE_MS = 110, SWIPE_COOLDOWN_MS = 650;

/** One card on the desk, with its own motion: the lean, the drag, the swipe, and leaving toward the side you chose. */
function LiveCard(p: { card: CardProps; lean: Side | undefined; nudged: number; locked: boolean; exit: Leave; rarity: string; arriveAfter: number }) {
  const reduced = useReducedMotion();
  // A card that's leaving keeps its last props for its exit. It must not answer again: no clicks, no drag.
  const present = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // How strongly each option is picked out: fully once the card has moved as far as a drag's threshold takes it.
  const pl = useTransform(x, [-LEAN_X, 0], [1, 0], { clamp: true });
  const pr = useTransform(x, [0, LEAN_X], [0, 1], { clamp: true });
  // The card tilts as it moves (round 5): about a degree at a full lean, and more as it leaves.
  const rotate = useTransform(x, (v) => v * 0.06);
  const live = p.card.mode.kind === "live" && present;
  // Read once, when the card arrives: clearing the flight must not restart its entrance without the pause.
  const [arriveAfter] = useState(p.arriveAfter);

  useEffect(() => {
    // While you still have to read (D91), the card resists: it leans a third as far, as round 5's did.
    const to = live && p.lean ? (p.lean === "left" ? -1 : 1) * (p.locked ? 0.25 : 0.7) * LEAN_X : 0;
    const a = animate(x, to, reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 });
    return () => a.stop();
  }, [p.lean, p.locked, live, reduced, x]);

  // A two-finger swipe moves the card as a drag would, and chooses when it stops (round 5). Not React's onWheel,
  // which can't prevent scrolling. A vertical swipe scrolls the desk instead, if the desk has somewhere to scroll.
  const el = useRef<HTMLElement>(null);
  // Where a drag or swipe that has gone far enough points: the card fills that answer in.
  const [armed, setArmed] = useState<Dir>();
  const arm = (dx: number, dy: number) => {
    const g = gesture(dx, dy);
    setArmed(g.progress >= 1 ? g.dir : undefined);
  };
  const swipe = useRef({ live, reduced, onReach: p.card.onReach, arm });
  swipe.current = { live, reduced, onReach: p.card.onReach, arm };
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let sum = { x: 0, y: 0 };
    let idle = 0;
    let cooldown = 0;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // a pinch zooms
      const desk = node.closest(".desk");
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && desk && desk.scrollHeight > desk.clientHeight) return;
      e.preventDefault();
      if (!swipe.current.live || performance.now() < cooldown) return;
      sum = { x: sum.x - e.deltaX, y: sum.y - e.deltaY };
      swipe.current.arm(sum.x, sum.y);
      x.set(Math.max(-LEAN_X, Math.min(LEAN_X, sum.x * DRAG_ELASTIC)));
      y.set(Math.max(-LEAN_X, Math.min(LEAN_X, sum.y * DRAG_ELASTIC)));
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        cooldown = performance.now() + SWIPE_COOLDOWN_MS;
        const g = gesture(sum.x, sum.y);
        sum = { x: 0, y: 0 };
        swipe.current.arm(0, 0);
        const back = swipe.current.reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 520, damping: 34 };
        animate(x, 0, back);
        animate(y, 0, back);
        if (g.progress >= 1) swipe.current.onReach(g.dir);
      }, SWIPE_IDLE_MS);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      clearTimeout(idle);
    };
  }, [x, y]);

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
    opacity: 0,
    transition: { duration: reduced ? 0 : 0.22, ease: "easeIn" as const },
  });

  return (
    <motion.article
      ref={el}
      className={`card rarity-${p.rarity}`}
      data-mode={p.card.mode.kind}
      data-locked={p.locked || undefined}
      data-leaving={present ? undefined : true}
      inert={!present}
      aria-label={p.card.card.meta.question}
      style={{ x, y, rotate, "--pl": pl, "--pr": pr, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24, delay: reduced ? 0 : arriveAfter / 1000 } }}
      exit={out(p.exit)}
      drag={live}
      dragSnapToOrigin
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDrag={(_e, info) => arm(info.offset.x, info.offset.y)}
      onDragEnd={(_e, info) => {
        arm(0, 0);
        const { dir, progress } = gesture(info.offset.x, info.offset.y);
        const speed = dir === "left" || dir === "right" ? Math.abs(info.velocity.x) : Math.abs(info.velocity.y);
        if (progress >= 1 || (speed > 900 && progress > 0.3)) p.card.onReach(dir);
      }}
    >
      <div className="frame" aria-hidden="true" />
      <Card {...p.card} {...(armed && live ? { armed } : {})} />
    </motion.article>
  );
}

/** The toast: what just happened, and, while an answer waits, the way to take it back (Z). */
function ToastView({ toast, onUndo, onDone }: { toast: Toast | undefined; onUndo: () => void; onDone: () => void }) {
  const [, setNow] = useState(0);
  const reduced = useReducedMotion();
  // The undo window runs down as a line along the toast's foot (round 5), through Web Animations.
  const timer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!toast?.undoUntil || reduced || !timer.current) return;
    const a = timer.current.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: Math.max(0, toast.undoUntil - Date.now()), easing: "linear", fill: "forwards" });
    return () => a.cancel();
  }, [toast, reduced]);
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
        <>
          <button type="button" className="undo" onClick={onUndo}>
            Undo <kbd>Z</kbd>
          </button>
          <i className="timer" ref={timer} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
