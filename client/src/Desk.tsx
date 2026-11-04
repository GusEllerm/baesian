import { AnimatePresence, type MotionStyle, animate, motion, useIsPresent, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ApiAliasInput, ApiCard, ApiState } from "../../src/api";
import { isOwnCard, suggestPreset } from "../../src/routing";
import { nearTopics } from "../../src/similarity";
import type { OptionKind } from "../../src/schema";
import { type Answer, HOLD_MS, READ_FIRST_MS, UNDO_MS, describeAnswer, verdictFor } from "./answer";
import { laterSuperseded, recap } from "./calibration";
import { ARROW, Card, type CardProps, type Mode, type Side } from "./Card";
import { usePresence } from "./live";
import { addSpent, loadSpent, useBriefed, useSeen, useSetupOffered } from "./local";
import { type Rarity, agentOf, areaOf, byId, heldBack, isHeld, keyOf, liveDependents, ownText, parked, queue, quoted, rarityOf, relationsOf, serverNow, sidesFor, stakesLine, waitState } from "./model";
import { useNotifications } from "./notify";
import { Outbox, postVerdictTo } from "./outbox";
import { postAnswer, useEndpoints } from "./endpoints";
import { ProofPrompt } from "./proof";
import { PHONE, TOUCH, useMedia } from "./media";
import { CalibrationPanel, DeckBriefing, DeckPanel, EmptyDesk, HeldPanel, KeysPanel, MoreMenu, type PanelKind, hasBriefing, moveInMenu } from "./Panels";
import { type CardMotion, Path, type PathProps, flyToBar } from "./Path";
import { PathSheet } from "./Sheet";
import { POSITION_NAMES, ROW_NAMES, type Draft, pastCards, replacesOf, rowInSentence, surveyAnswersOf, surveyChange } from "./prefs";
import { PreferencesPanel, postPreferences, usePresets } from "./Preferences";
import { AskFace, OfferFace, ResultFace, SURVEY_SIDES, type Setup } from "./Survey";

// M4 steps 5c to 5e: the desk, where you answer. It holds what you've answered this session, the mode the card is
// in, the reading time (D91), the keys, the lean and the drag, the hold on mythic cards (D67), and the undo window
// (D82); every card goes through the reveal (D86). M8b: audits come through the queue and held cards from their list,
// both answered blind first (D151); the setup survey comes before the cards, once (B-5na1k). Beside the card, the path
// (Path.tsx); under it, the pile of the rest of its area. In the header, the menu and its panels (Panels.tsx,
// Preferences.tsx). While it's open, it says you're there
// (D41), and notifies you of cards an agent stops for (D40). Round 5's behaviour, ported:
// design/explorations/round5/app.js. On a phone (D130), the card fills the screen and the path folds into a sheet you
// pull up (Sheet.tsx); a card longer than the screen scrolls, so a vertical swipe on it scrolls rather than answers.

/** How far a drag must go to choose: sideways, and up or down. */
const THRESH_X = 150, THRESH_Y = 110;
/** The card follows a drag only this much, held to the desk. */
const DRAG_ELASTIC = 0.16;
/**
 * How far the card moves when a drag reaches its threshold, and so the most it leans. Round 5 leaned a held arrow
 * 105 px, which slid the card over the path and hid the very rows that light up to say what leaning does (5f).
 */
const LEAN_X = THRESH_X * DRAG_ELASTIC;
/** How far a card moved by hand leans before the path lights what that side would do: past the shake's 6 px. */
const LEAN_LIGHT = 8;
const NEXT_MAX = 3;
/** Small counts in words, as round 5's summary has them. */
const NUMBER = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** The flight of your choice into the path, and the pause before the next card arrives. */
const MOVE_MS = 700;
type Dir = Side | "up" | "down";
/**
 * Which ways the card can be dragged: all four, or, on a phone whose desk scrolls, only sideways, so a vertical swipe
 * scrolls the card as the two-finger swipe already does on a desktop (5f).
 */
type Axis = true | "x";
/** How the card on the desk leaves: toward the answer you gave, or, moving between cards or undoing, just fading. */
type Leave = Dir | "fade";

interface Answered {
  answer: Answer;
  phase: "held" | "sent";
  words: string;
  agent: string;
  /** What the toast says once it's recorded. */
  sent: string;
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

/** Your answer, as the path says it. A held card's agent went ahead, so you kept it or overturned it (D151). */
function pathState(card: ApiCard, answer: Answer): string {
  const { proposal, alternative } = card.meta;
  if (answer.kind === "choose" && isHeld(card)) return answer.option === "proposal" ? `you kept ${quoted(proposal)}` : `you overturned it, for ${quoted(alternative)}`;
  if (answer.kind === "choose") return answer.option === "proposal" ? `you chose ${quoted(proposal)}` : `you chose ${quoted(alternative)}, not ${agentOf(card)}'s pick`;
  return answer.kind === "write" ? "you wrote an answer" : "you couldn't judge it";
}

/** What the toast says once an answer is recorded: a slider proposal accepted moves its row (B-y6jn6); Baesian's own cards go to no agent. */
function sentWords(card: ApiCard, answer: Answer): string {
  const m = card.meta;
  if (m.pref_row && m.pref_to && answer.kind === "choose") {
    return answer.option === "proposal" ? `Saved: ${ROW_NAMES[m.pref_row]} is at “${POSITION_NAMES[m.pref_to]}” now.` : `Recorded: the setting for ${rowInSentence(m.pref_row)} stays as it is.`;
  }
  return isOwnCard(m) ? "Recorded." : `Sent to ${m.source_agent}.`;
}

/** Baesian's own cards, for people: its card IDs and references become words (D69). An agent's own words are left as they are. */
function forPeople(card: ApiCard, cards: Map<string, ApiCard>): ApiCard {
  if (!isOwnCard(card.meta)) return card;
  const { crux_fact } = card.meta;
  return { ...card, body: ownText(card.body, cards), meta: { ...card.meta, ...(crux_fact ? { crux_fact: ownText(crux_fact, cards) } : {}) } };
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
  /** The side the card in play leans to under a drag or a swipe, which lights the path as a held arrow does. */
  const [handLean, setHandLean] = useState<Side>();
  /** The card in play's motion, so the path's line follows it. A card that's leaving gives it up. */
  const [cardMotion, setCardMotion] = useState<CardMotion>();
  const showMotion = useCallback((m: CardMotion | undefined, from?: CardMotion) => setCardMotion((cur) => (m ? m : cur === from ? undefined : cur)), []);
  const [hold, setHold] = useState<number>();
  const [nudged, setNudged] = useState(0);
  const [fly, setFly] = useState<Fly>();
  const firstChoice = useRef(new Map<string, OptionKind>());
  const exitDir = useRef<Leave>("fade");
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKind>();
  /** The setup survey, once you've started it (B-5na1k); before that, it may be offered. */
  const [setupStep, setSetupStep] = useState<Setup>();
  /** A draft for the preferences panel to open with: the survey's suggestion, to adjust. */
  const [prefsInitial, setPrefsInitial] = useState<Draft>();
  const project = state.project.name;
  /** Where it reads and answers: the local server, or on the website the project's relay (M9e). */
  const endpoints = useEndpoints();
  /** The phone layout (D130), and a screen you touch: see media.ts. */
  const phone = useMedia(PHONE);
  const touch = useMedia(TOUCH);
  const deskRef = useRef<HTMLElement>(null);
  usePresence();
  const seen = useSeen(state);
  const briefed = useBriefed(state);
  const setupOffered = useSetupOffered(state);

  const now = serverNow(state, fetchedAt);
  const cards = byId(state);
  const ordered = queue(state, now).filter((c) => !answered.has(keyOf(c)));
  const aside = parked(state).filter((c) => !answered.has(keyOf(c)));
  const held = heldBack(state).filter((c) => !answered.has(keyOf(c)));
  const reviewCard = reviewing ? state.cards.find((c) => keyOf(c) === reviewing) : undefined;
  // The card in front of you stays until you answer it or move on. When the queue re-sorts (an answer reaching
  // the server, an agent starting to wait), that changes what comes next, never the card you're reading (5f).
  const [shownKey, setShownKey] = useState("");
  const staying = ordered.find((c) => keyOf(c) === shownKey);
  // A card you put aside can be answered after all, and so can one held back (D150): picked from their lists.
  const picked = pick ? (ordered.find((c) => c.meta.id === pick) ?? aside.find((c) => c.meta.id === pick) ?? held.find((c) => c.meta.id === pick)) : undefined;
  const current = reviewCard ?? picked ?? staying ?? ordered[0];
  const key = current ? keyOf(current) : "";
  const deck = current ? state.decks.find((d) => d.meta.id === current.meta.deck) : undefined;
  // With no preference file, the setup survey is offered once, before the cards (B-5na1k), unless an agent has
  // stopped for you: then it waits until none has.
  const waitingNow = ordered.filter((c) => waitState(c, now) === "waiting").length;
  const offerDue = !setupOffered.offered && !state.routing.preferences && !state.routing.problem && waitingNow === 0 && !reviewCard && !picked;
  const setup: Setup | undefined = setupStep ?? (offerDue ? { step: "offer" } : undefined);
  const presets = usePresets(panel === "preferences" || setup !== undefined, state.version);
  // The first card you reach from a deck with a briefing comes after its briefing card, once per deck (B-j6b75).
  // A card reopened from the path is one you've already reached.
  const briefing = !setup && !reviewCard && hasBriefing(deck) && !briefed.has(deck.meta.id) ? deck : undefined;
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
  // A card counts as seen once it's been on the desk, not behind its deck's briefing or the setup survey: it loses its "new" tag.
  const behind = !!briefing || !!setup;
  useEffect(() => {
    if (key && !behind) seen.mark(key);
  }, [key, behind, seen.mark]);
  // Its reading time (D91) starts once it's in front of you.
  const wasBehind = useRef(behind);
  if (wasBehind.current !== behind) {
    wasBehind.current = behind;
    if (!behind) setShownAt(performance.now());
  }
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
    outbox.current = new Outbox(postVerdictTo(endpoints), UNDO_MS, {
      sent: (k, posted) => {
        const a = answeredRef.current.get(k);
        setAnswered((m) => (m.has(k) ? new Map(m).set(k, { ...m.get(k)!, phase: "sent" }) : m));
        // Baesian may have proposed something from your answer (D161, B-y6jn6): it's in the queue now.
        const n = posted?.filed?.length ?? 0;
        const filed = n ? ` Baesian has ${n === 1 ? "a proposal" : `${NUMBER[n]?.toLowerCase() ?? n} proposals`} from your answers, in your queue.` : "";
        say(`${a?.sent ?? "Sent."}${filed}`);
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
      new Map(m).set(key, { answer, phase: "held", words, agent: agentOf(current), sent: sentWords(current, answer), name: current.meta.title, rarity: r!.rarity, state: pathState(current, answer) }),
    );
    const waiting = outbox.current!.hold(key, v.verdict);
    // Round 5 took your answer out of this toast: the path shows it.
    say(isOwnCard(current.meta) ? "Recording it in" : `Sending to ${current.meta.source_agent} in`, waiting.until);
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
    commit({
      kind: "choose",
      option: mode.option,
      first: mode.first,
      ...(mode.why.trim() ? { why: mode.why } : {}),
      ...(mode.rule ? { rule: true } : {}),
      ...(mode.retire?.length ? { retire: mode.retire } : {}),
      ...(mode.asked ? { asked: true } : {}),
    });
  };
  // The other option breaks other rules, if any: what you meant to retire goes with the option you left.
  const switchToPick = () => mode.kind === "reveal" && setMode({ ...mode, option: "proposal", side: sideOf("proposal"), why: "", retire: [] });
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
    // Going to a card leaves the setup survey, as "Not now" does.
    if (setup) setupAway();
    if (id === current?.meta.id) return;
    exitDir.current = "fade";
    const answeredKey = [...answered.keys()].find((k) => k.startsWith(`${id}@`));
    if (answeredKey) setReviewing(answeredKey);
    else {
      setReviewing(undefined);
      setPick(id);
    }
    // The row you went from unmounts once its card is in play: focus moves to the card, not to the page.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".stage article.card:not([data-leaving])")?.focus({ preventScroll: true }));
  };

  // Topics that look like the card's (D44, D111): the same rule `baesian file` warns with, over the topics in use.
  // Baesian names its own cards' topics after the decisions they come from, so they look alike by design: never offered.
  const topicCounts = new Map<string, number>();
  for (const c of state.cards) if (!isOwnCard(c.meta)) topicCounts.set(c.canonicalTopic, (topicCounts.get(c.canonicalTopic) ?? 0) + 1);
  const near = current && !isOwnCard(current.meta) ? nearTopics(current.canonicalTopic, topicCounts.keys()).map((topic) => ({ topic, count: topicCounts.get(topic)! })) : [];
  const merge = async (into: string) => {
    if (!current) return;
    const from = current.canonicalTopic;
    const body: ApiAliasInput = { from, to: into };
    try {
      const r = await postAnswer(endpoints, endpoints.aliases, body);
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
  const showPanel = (kind: PanelKind) => {
    if (kind === "preferences") setPrefsInitial(undefined);
    setPanel((p) => (p === kind ? undefined : kind));
  };

  // The setup survey (B-5na1k): the offer, the example decisions one by one, then the preset they suggest.
  const survey = presets?.survey;
  const focusCard = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(".stage article.card:not([data-leaving])")?.focus({ preventScroll: true }));
  const setupAway = () => {
    setupOffered.mark();
    exitDir.current = "fade";
    setSetupStep(undefined);
    focusCard();
  };
  const setupStart = () => {
    if (!survey) return;
    setupOffered.mark();
    setPanel(undefined);
    exitDir.current = "fade";
    setSetupStep({ step: "ask", i: 0, answers: {} });
    focusCard();
  };
  const setupAnswer = (side: Side | "down") => {
    if (setup?.step !== "ask" || !survey) return;
    const item = survey.items[setup.i]!;
    const answers = { ...setup.answers };
    if (side === "down") delete answers[item.row];
    else answers[item.row] = SURVEY_SIDES[side];
    exitDir.current = side;
    setSetupStep(setup.i + 1 < survey.items.length ? { step: "ask", i: setup.i + 1, answers } : { step: "result", answers });
  };
  const setupBack = () => {
    if (setup?.step !== "ask" || setup.i === 0) return;
    exitDir.current = "fade";
    setSetupStep({ ...setup, i: setup.i - 1 });
  };
  const setupUse = async () => {
    if (setup?.step !== "result") return;
    setSetupStep({ ...setup, saving: true });
    const result = await postPreferences(endpoints, surveyChange(setup.answers, replacesOf(state.routing)));
    if ("ok" in result) {
      const preset = suggestPreset(surveyAnswersOf(setup.answers));
      say(result.ok.file.mode === "shadow" ? `Saved: “${preset.name}”, in shadow. Nothing is held back yet.` : `Saved: “${preset.name}”. It applies to the next cards agents file.`);
      setupAway();
    } else {
      setSetupStep({ ...setup, saving: false, problem: "stale" in result ? "Your preferences changed meanwhile, so nothing was saved. Open them, in the menu, to see them as they are." : `That wasn't saved: ${result.error}.` });
    }
  };
  const setupAdjust = () => {
    if (setup?.step !== "result") return;
    const answers = surveyAnswersOf(setup.answers);
    const preset = suggestPreset(answers);
    setPrefsInitial({ mode: state.routing.settings.mode, rows: { ...preset.rows }, preset: preset.id, survey: answers });
    setupAway();
    setPanel("preferences");
  };
  const setupKey = (k: Dir | "enter") => {
    if (setup?.step === "offer" && (k === "right" || k === "enter")) setupStart();
    else if (setup?.step === "ask" && (k === "left" || k === "right" || k === "down")) setupAnswer(k);
    else if (setup?.step === "result" && k === "enter") void setupUse();
  };
  /** On from the briefing to the deck's card, whose reading time starts now (D91). */
  const dismissBriefing = () => {
    if (!briefing) return;
    briefed.mark(briefing.meta.id);
    setShownAt(performance.now());
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".stage article.card:not([data-leaving])")?.focus({ preventScroll: true }));
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
  const handlers = useRef({ mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity, menuOpen, panel, briefing: !!briefing, dismissBriefing, setup: !!setup, setupKey, setupAway });
  handlers.current = { mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity, menuOpen, panel, briefing: !!briefing, dismissBriefing, setup: !!setup, setupKey, setupAway };
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
        else if (h.setup) h.setupAway();
        else if (h.briefing) h.dismissBriefing();
        else if (h.mode.kind !== "live" || reviewingRef.current) h.back();
        else if (keyHeld.current) {
          keyHeld.current = undefined;
          setLean(undefined);
        }
        return;
      }
      // Typing goes to the field, and a radio button keeps its arrows; a ticked box (make this a rule) leaves the keys
      // to the card. Inside a panel, the keys are the panel's.
      if (e.target instanceof Element && e.target.closest('input:not([type="checkbox"]), textarea, .panel, .sheet')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "z" || e.key === "Z") return h.undo();
      if (e.key === "?") return setPanel((p) => (p === "keys" ? undefined : "keys"));
      const dir = ARROWS[e.key];
      // The setup survey has the arrows, and Enter, to itself. A focused button takes its own Enter.
      if (h.setup) {
        const enter = e.key === "Enter" && !(e.target instanceof HTMLButtonElement);
        if (dir || enter) {
          e.preventDefault();
          if (!e.repeat) h.setupKey(dir ?? "enter");
        }
        return;
      }
      if ((e.key === "j" || e.key === "k") && h.mode.kind === "live" && h.ordered.length) {
        const i = h.current ? h.ordered.indexOf(h.current) : -1;
        const next = h.ordered[(i + (e.key === "j" ? 1 : h.ordered.length - 1) + h.ordered.length) % h.ordered.length];
        exitDir.current = "fade";
        setReviewing(undefined);
        return setPick(next?.meta.id);
      }
      // A briefing card: any arrow, or Enter, goes on to the card. A focused button takes its own Enter.
      if (h.briefing) {
        if (dir || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))) {
          e.preventDefault();
          if (!e.repeat) h.dismissBriefing();
        }
        return;
      }
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

  // The path: your answers this session, the card's relationships, and what's next. Behind the setup survey, no card
  // is in play: the path shows only what's next.
  const inPlay = setup ? undefined : current;
  const relations = inPlay ? relationsOf(inPlay, state) : [];
  const relById = new Map(relations.map((x) => [x.id, x]));
  const trail = [...answered.entries()]
    .filter(([k]) => k !== key)
    .map(([k, a]) => {
      const id = k.split("@")[0]!;
      const link = relById.get(id);
      return { key: k, id, name: a.name, state: a.state, rarity: a.rarity, ...(link ? { link } : {}) };
    });
  const ahead = inPlay ? ordered.filter((c) => c.meta.id !== inPlay.meta.id) : setup ? ordered : [];
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
  const leaning = lean ?? handLean ?? hover;
  const leanKind = mode.kind === "live" ? (leaning ? sides[leaning] : undefined) : mode.kind === "reveal" ? mode.option : undefined;

  // On a phone (D130). Whether the desk has somewhere to scroll: then a vertical swipe on the card scrolls it.
  const [deskScrolls, setDeskScrolls] = useState(false);
  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!phone || !desk) return setDeskScrolls(false);
    const check = () => setDeskScrolls(desk.scrollHeight > desk.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(desk);
    for (const child of desk.children) ro.observe(child);
    check();
    return () => ro.disconnect();
  }, [phone]);
  const axis: Axis = phone && deskScrolls ? "x" : true;
  // Each new card, survey step or briefing starts at its top.
  const faceKey = setup ? `setup:${setup.step}:${setup.step === "ask" ? setup.i : ""}` : briefing ? `brief:${briefing.meta.id}` : current ? key : "empty";
  useLayoutEffect(() => {
    if (phone) deskRef.current?.scrollTo({ top: 0 });
  }, [faceKey, phone]);
  // The reveal and the written answers open under the options: brought into view, with their buttons if they fit.
  useEffect(() => {
    if (!phone || (mode.kind !== "reveal" && mode.kind !== "write" && mode.kind !== "pass")) return;
    const desk = deskRef.current;
    const inner = desk?.querySelector<HTMLElement>(".stage article.card:not([data-leaving]) .panel-in");
    if (!desk || !inner) return;
    const d = desk.getBoundingClientRect(), r = inner.getBoundingClientRect();
    const by = r.height <= d.height - 24 ? r.bottom - d.bottom + 12 : r.top - d.top - 12;
    if (by > 0) desk.scrollBy({ top: by, behavior: reduced ? "auto" : "smooth" });
  }, [phone, mode.kind, key]);
  // The keyboard coming up shrinks the page (index.html: resizes-content): the field you're writing in stays in view.
  useEffect(() => {
    if (!phone) return;
    const keep = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches('.stage textarea, .stage input[type="text"]')) el.scrollIntoView({ block: "nearest" });
    };
    const vv = window.visualViewport;
    addEventListener("resize", keep);
    vv?.addEventListener("resize", keep);
    return () => {
      removeEventListener("resize", keep);
      vv?.removeEventListener("resize", keep);
    };
  }, [phone]);
  // With the path folded away, your choice flies into the sheet's bar instead of into its row.
  const sheetOpen = phone && panel === "path";
  useLayoutEffect(() => {
    if (!phone || !fly || sheetOpen) return;
    const bar = document.querySelector<HTMLElement>(".sheet-peek");
    if (bar) flyToBar(fly, bar);
    setFly(undefined);
  }, [fly, phone, sheetOpen]);
  useEffect(() => {
    if (!phone) setPanel((p) => (p === "path" ? undefined : p));
  }, [phone]);
  const openSheet = (open: boolean) => setPanel((p) => (open ? "path" : p === "path" ? undefined : p));
  const pathProps: PathProps = {
    trail,
    current: inPlay && r ? { id: inPlay.meta.id, name: inPlay.meta.title, rarity: r.rarity, stopped: waitState(inPlay, now) === "waiting", conflict: (inPlay.meta.conflict_of?.length ?? 0) > 0 } : undefined,
    relations,
    upcoming: nextUp,
    more: Math.max(0, ahead.length - NEXT_MAX),
    lean: leanKind,
    optionLabel: (k) => `${ARROW[sideOf(k)]} ${quoted(current?.meta[k] ?? "")}`,
    onGoTo: goTo,
    layoutKey: `${key}:${mode.kind}`,
  };

  // The pile: the rest of this card's area, slightly messy, under it; under the survey, the examples still to come.
  const surveyLeft = !setup || !survey ? 0 : setup.step === "offer" ? survey.items.length : setup.step === "ask" ? survey.items.length - setup.i - 1 : 0;
  const pile = setup
    ? Array.from({ length: Math.min(4, surveyLeft) }, (_, i) => `survey-${i}`)
    : inPlay
      ? ahead.filter((c) => areaOf(c) === areaOf(inPlay)).slice(0, 4).map((c) => c.meta.id)
      : [];

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
        {endpoints.hosted ? (
          // On the website (M9e): the wordmark goes to your projects, and the project's name says where you are (B-zqkwk).
          <>
            <a className="wordmark" href="/" title="Your projects">
              Baesian
            </a>
            <span className="place" title={endpoints.hosted.name ? undefined : endpoints.hosted.project}>
              {endpoints.hosted.name ?? "Unnamed project"}
            </span>
          </>
        ) : (
          <span className="wordmark">Baesian</span>
        )}
        <p className="summary" aria-live="polite">
          {summary}
        </p>
        <MoreMenu open={menuOpen} notify={notifications.status} held={held.length} touch={touch} site={!!endpoints.hosted} onOpen={setMenuOpen} onPanel={showPanel} onNotify={() => void toggleNotify()} />
      </header>
      {endpoints.hosted && <ProofPrompt />}
      {panel === "keys" && <KeysPanel touch={touch} phone={phone} onClose={() => setPanel(undefined)} />}
      {panel === "calibration" && <CalibrationPanel spent={loadSpent(project)} superseded={laterSuperseded(state)} routing={state.routing} onClose={() => setPanel(undefined)} />}
      {panel === "held" && (
        <HeldPanel
          held={held}
          mode={state.routing.settings.mode}
          onOpen={(id) => {
            setPanel(undefined);
            goTo(id);
          }}
          onClose={() => setPanel(undefined)}
        />
      )}
      {panel === "preferences" && (
        <PreferencesPanel
          routing={state.routing}
          cards={pastCards(state.cards)}
          presets={presets}
          {...(prefsInitial ? { initial: prefsInitial } : {})}
          onSaved={(text) => say(text)}
          onSurvey={setupStart}
          onClose={() => setPanel(undefined)}
        />
      )}
      {panel === "deck" && deck && (
        <DeckPanel
          deck={deck}
          titleOf={(id) => cards.get(id)?.meta.title}
          onOpen={(id) => {
            setPanel(undefined);
            goTo(id);
          }}
          onClose={() => setPanel(undefined)}
        />
      )}
      <main className="desk" ref={deskRef} inert={sheetOpen}>
        {/* On a phone, the path is in the sheet, below. */}
        {!phone && <Path {...pathProps} {...(cardMotion ? { card: cardMotion } : {})} {...(fly ? { fly, onFlown: () => setFly(undefined) } : {})} />}
        <section className="stage" aria-label="The card to answer">
          <p className="crumbs">
            {setup ? (
              <>
                setting up › <b>Your preferences</b>
              </>
            ) : (
              current && (
              <>
                {areaOf(current)} ›{" "}
                {/* The deck's briefing and its context notes open from its name (M6). */}
                {deck && (deck.body.trim() || deck.notes.length) ? (
                  <button type="button" className="crumb-deck" aria-expanded={panel === "deck"} aria-controls="deck-panel" title="The briefing" onClick={() => showPanel("deck")}>
                    <b>{deck.meta.title}</b>
                  </button>
                ) : (
                  <b>{deck?.meta.title ?? current.meta.deck}</b>
                )}
              </>
              )
            )}
          </p>
          <div className="deck">
            <div className="pile" aria-hidden="true">
              {pile.map((id, i) => {
                const m = messy(id, i + 1);
                return <div key={id} className="under" style={{ "--r": `${m.r.toFixed(2)}deg`, "--dx": `${m.dx}px`, "--dy": `${m.dy}px`, zIndex: 10 - i } as CSSProperties} />;
              })}
            </div>
            {/* Not mode="popLayout": that injects a <style> element, which the page's policy refuses (D99). A leaving
                card is taken out of the flow by style.css instead, through its data-leaving mark. */}
            <AnimatePresence custom={exitDir.current} initial={false}>
              {setup ? (
                <SetupCard
                  key={setup.step === "ask" ? `setup:ask:${setup.i}` : `setup:${setup.step}`}
                  label={setup.step === "offer" ? "Setting up your preferences" : setup.step === "ask" && survey ? survey.items[setup.i]!.question : "The preset your answers suggest"}
                  exit={exitDir.current}
                  axis={axis}
                  {...(setup.step === "ask" ? { onSwipe: (dir: Side | "down") => setupAnswer(dir) } : {})}
                >
                  {(armed) =>
                    setup.step === "offer" ? (
                      <OfferFace count={survey?.items.length} onStart={setupStart} onAway={setupAway} />
                    ) : setup.step === "ask" && survey ? (
                      <AskFace survey={survey} i={setup.i} armed={armed} onAnswer={setupAnswer} onSkip={() => setupAnswer("down")} onBack={setupBack} onAway={setupAway} />
                    ) : setup.step === "result" && presets ? (
                      <ResultFace
                        presets={presets}
                        answers={setup.answers}
                        mode={state.routing.settings.mode}
                        saving={setup.saving}
                        problem={setup.problem}
                        onUse={() => void setupUse()}
                        onAdjust={setupAdjust}
                        onAway={setupAway}
                      />
                    ) : (
                      <div className="face">
                        <p className="doing">Reading the example decisions…</p>
                      </div>
                    )
                  }
                </SetupCard>
              ) : briefing ? (
                <BriefingCard
                  key={`brief:${briefing.meta.id}`}
                  deck={briefing}
                  waiting={ordered.filter((c) => c.meta.deck === briefing.meta.id).length}
                  titleOf={(id) => cards.get(id)?.meta.title}
                  onOpen={(id) => {
                    dismissBriefing();
                    goTo(id);
                  }}
                  onDone={dismissBriefing}
                />
              ) : current && r ? (
                <LiveCard
                  key={key}
                  exit={exitDir.current}
                  axis={axis}
                  arriveAfter={fly && fly.key !== key ? MOVE_MS * 0.65 : 0}
                  lean={lean}
                  onMotion={showMotion}
                  onHandLean={setHandLean}
                  nudged={nudged}
                  locked={readLeft > 0}
                  rarity={r.rarity}
                  card={{
                    card: forPeople(current, cards),
                    rarity: r.rarity,
                    stakes: stakesLine(current, deps),
                    wait: waitState(current, now),
                    sides,
                    mode,
                    rules: state.rules,
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
                    touch,
                  }}
                />
              ) : (
                <motion.div key="empty" className="empty" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyDesk
                    recap={recap([...answered.values()].map((a) => a.answer))}
                    parked={aside}
                    held={held}
                    notify={notifications.status}
                    onNotify={() => void toggleNotify()}
                    onOpen={goTo}
                    onAllHeld={() => setPanel("held")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
      {phone && (
        <PathSheet open={sheetOpen} answered={trail.length} connected={relations} next={ahead.length} lean={leanKind} onOpen={openSheet}>
          <Path
            {...pathProps}
            sheet
            onGoTo={(id) => {
              openSheet(false);
              goTo(id);
            }}
            {...(fly ? { fly, onFlown: () => setFly(undefined) } : {})}
          />
        </PathSheet>
      )}
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
function LiveCard(p: {
  card: CardProps;
  lean: Side | undefined;
  onMotion: (m: CardMotion | undefined, from?: CardMotion) => void;
  onHandLean: (side: Side | undefined) => void;
  nudged: number;
  locked: boolean;
  exit: Leave;
  axis: Axis;
  rarity: string;
  arriveAfter: number;
}) {
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

  // While it's the card in play, the path's line follows its motion; once it's leaving, the next card's does.
  const motionOf = useMemo<CardMotion>(() => ({ x, y, rotate }), [x, y, rotate]);
  const { onMotion, onHandLean } = p;
  useLayoutEffect(() => {
    if (!present) return;
    onMotion(motionOf);
    return () => onMotion(undefined, motionOf);
  }, [present, motionOf, onMotion]);
  // A drag or a swipe that leans the card lights the path as a held arrow does, from the card's own motion.
  const presentNow = useRef(present);
  presentNow.current = present;
  useEffect(() => {
    let side: Side | undefined;
    const off = x.on("change", (v) => {
      const next: Side | undefined = !presentNow.current ? undefined : v <= -LEAN_LIGHT ? "left" : v >= LEAN_LIGHT ? "right" : undefined;
      if (next === side) return;
      side = next;
      onHandLean(next);
    });
    return () => {
      off();
      if (side) onHandLean(undefined);
    };
  }, [x, onHandLean]);

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
      tabIndex={-1}
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
      drag={live ? p.axis : false}
      dragSnapToOrigin
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      // Sideways only, a vertical drag is the desk's to scroll: it never answers.
      onDrag={(_e, info) => arm(info.offset.x, p.axis === "x" ? 0 : info.offset.y)}
      onDragEnd={(_e, info) => {
        arm(0, 0);
        const { dir, progress } = gesture(info.offset.x, p.axis === "x" ? 0 : info.offset.y);
        const speed = dir === "left" || dir === "right" ? Math.abs(info.velocity.x) : Math.abs(info.velocity.y);
        if (progress >= 1 || (speed > 900 && progress > 0.3)) p.card.onReach(dir);
      }}
    >
      <div className="frame" aria-hidden="true" />
      <Card {...p.card} {...(armed && live ? { armed } : {})} />
    </motion.article>
  );
}

/**
 * A deck's briefing, before the first of its cards you reach (B-j6b75): its briefing and context notes, then on to
 * the card with any arrow, Enter, a drag or a two-finger swipe. A vertical swipe scrolls a long briefing.
 */
function BriefingCard(p: { deck: ApiState["decks"][number]; waiting: number; titleOf: (id: string) => string | undefined; onOpen: (id: string) => void; onDone: () => void }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const x = useMotionValue(0);
  const rotate = useTransform(x, (v) => v * 0.06);
  const el = useRef<HTMLElement>(null);
  const done = useRef(p.onDone);
  done.current = p.onDone;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let sum = 0;
    let idle = 0;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      sum -= e.deltaX;
      x.set(Math.max(-LEAN_X, Math.min(LEAN_X, sum * DRAG_ELASTIC)));
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        const far = Math.abs(sum) >= THRESH_X;
        sum = 0;
        animate(x, 0, reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 });
        if (far) done.current();
      }, SWIPE_IDLE_MS);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      clearTimeout(idle);
    };
  }, [x, reduced]);
  const cards = `${p.waiting} ${p.waiting === 1 ? "card" : "cards"}`;
  return (
    <motion.article
      ref={el}
      tabIndex={-1}
      className="card briefing-card"
      data-leaving={present ? undefined : true}
      inert={!present}
      aria-label={`The briefing for ${p.deck.meta.title}`}
      style={{ x, rotate, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24 } }}
      exit={{ opacity: 0, y: -16, transition: { duration: reduced ? 0 : 0.2, ease: "easeIn" } }}
      drag={present ? "x" : false}
      dragSnapToOrigin
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_e, info) => {
        const far = Math.abs(info.offset.x) >= THRESH_X;
        if (far || (Math.abs(info.velocity.x) > 900 && Math.abs(info.offset.x) > THRESH_X * 0.3)) p.onDone();
      }}
    >
      <div className="frame" aria-hidden="true" />
      <div className="face">
        <p className="doing">
          <b>{cards}</b> in this work {p.waiting === 1 ? "is" : "are"} waiting for you.
        </p>
        <h1>{p.deck.meta.title}</h1>
        <DeckBriefing deck={p.deck} titleOf={p.titleOf} onOpen={p.onOpen} />
        <div className="briefing-foot">
          <button type="button" className="confirm" onClick={p.onDone}>
            Go to its cards <kbd>→</kbd>
          </button>
          <p className="small">Shown once. The deck's name above each card opens it again.</p>
        </div>
      </div>
    </motion.article>
  );
}

/**
 * A card of the setup survey (B-5na1k), with the card's own gestures: an example decision is answered by dragging or a
 * two-finger swipe, sideways for its two answers or down for "not sure", as well as by the arrows and by clicking. The
 * offer and the suggestion are read and clicked.
 */
function SetupCard(p: { label: string; exit: Leave; axis: Axis; onSwipe?: (dir: Side | "down") => void; children: (armed: Dir | undefined) => ReactNode }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, (v) => v * 0.06);
  const pl = useTransform(x, [-LEAN_X, 0], [1, 0], { clamp: true });
  const pr = useTransform(x, [0, LEAN_X], [0, 1], { clamp: true });
  const [armed, setArmed] = useState<Dir>();
  const el = useRef<HTMLElement>(null);
  const swipe = useRef(p.onSwipe);
  swipe.current = present ? p.onSwipe : undefined;
  const answer = (dir: Dir) => dir !== "up" && swipe.current?.(dir);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let sum = 0;
    let idle = 0;
    const wheel = (e: WheelEvent) => {
      if (!swipe.current || e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      sum -= e.deltaX;
      x.set(Math.max(-LEAN_X, Math.min(LEAN_X, sum * DRAG_ELASTIC)));
      setArmed(Math.abs(sum) >= THRESH_X ? (sum > 0 ? "right" : "left") : undefined);
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        const far = Math.abs(sum) >= THRESH_X;
        const dir = sum > 0 ? "right" : "left";
        sum = 0;
        setArmed(undefined);
        animate(x, 0, reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 });
        if (far) swipe.current?.(dir);
      }, SWIPE_IDLE_MS);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      clearTimeout(idle);
    };
  }, [x, reduced]);
  const out = (dir: Leave) => ({
    x: dir === "left" ? -130 : dir === "right" ? 130 : 0,
    y: dir === "up" ? -40 : dir === "down" ? 40 : 0,
    opacity: 0,
    transition: { duration: reduced ? 0 : 0.22, ease: "easeIn" as const },
  });
  const draggable = present && !!p.onSwipe;
  return (
    <motion.article
      ref={el}
      tabIndex={-1}
      className="card setup-card"
      data-leaving={present ? undefined : true}
      inert={!present}
      aria-label={p.label}
      style={{ x, y, rotate, "--pl": pl, "--pr": pr, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24 } }}
      exit={out(p.exit)}
      drag={draggable ? p.axis : false}
      dragSnapToOrigin
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDrag={(_e, info) => {
        const g = gesture(info.offset.x, p.axis === "x" ? 0 : info.offset.y);
        setArmed(g.progress >= 1 && g.dir !== "up" ? g.dir : undefined);
      }}
      onDragEnd={(_e, info) => {
        setArmed(undefined);
        const { dir, progress } = gesture(info.offset.x, p.axis === "x" ? 0 : info.offset.y);
        const speed = dir === "left" || dir === "right" ? Math.abs(info.velocity.x) : Math.abs(info.velocity.y);
        if (progress >= 1 || (speed > 900 && progress > 0.3)) answer(dir);
      }}
    >
      <div className="frame" aria-hidden="true" />
      {p.children(armed)}
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
