import { AnimatePresence, type MotionStyle, type MotionValue, animate, motion, useDragControls, useIsPresent, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ApiAliasInput, ApiCard, ApiState } from "../../src/api";
import { isOwnCard, suggestPreset } from "../../src/routing";
import { nearTopics } from "../../src/similarity";
import type { OptionKind } from "../../src/schema";
import { type Answer, HOLD_MS, READ_FIRST_MS, UNDO_MS, describeAnswer, verdictFor } from "./answer";
import { laterSuperseded, recap } from "./calibration";
import { ARROW, Card, type CardProps, type Mode, type Side, sideOfKind } from "./Card";
import { usePractice, usePresence } from "./live";
import { addSpent, loadSpent, useBriefed, useSeen, useSetupOffered } from "./local";
import { type DeskCard, type Practice, type Rarity, agentOf, areaOf, byId, heldBack, heldRemoved, isHard, isHeld, isSeen, keyOf, liveDependents, ownText, parked, practiceOf, queue, quoted, rarityOf, relationsOf, serverNow, sidesFor, stakesLine, waitState } from "./model";
import { useNotifications } from "./notify";
import { type Outgoing, Outbox, decidedIn, decidedWords, postPractice, postVerdictTo } from "./outbox";
import { ago, decidedByAnother, sentWords as sentToWords, useTeam } from "./team";
import { MARKS, TEST_SIZE, draws, markOf, phaseOf, practiceAnswer, practicePath, practiceWords, practised, rebuild, sources, statusOf } from "./practice";
import type { PracticeMark } from "../../src/schema";
import { PracticeResultPanel } from "./PracticePanel";
import { type Confirmed, confirmAnswers, postAnswer, useEndpoints } from "./endpoints";
import { NotConfirmed, ProofPrompt } from "./proof";
import { ASK_BEFORE_EXPIRY_MS, type Wait, askNow, confirmedLine, expiredLine, loadWaiting, saveWaiting, waitingLine } from "./waiting";
import { LIFT_TILT, type LiftLabel, LiftSignals, type LiftLabels, answerLabel, choiceLabel, useLift } from "./Lift";
import { PHONE, TOUCH, useMedia } from "./media";
import { BranchesDrawer } from "./Branches";
import { chosenOf, saidOf } from "./lanes";
import { CalibrationPanel, DeckBriefing, DeckPanel, EmptyDesk, HeldPanel, KeysPanel, MoreMenu, type PanelKind, hasBriefing, moveInMenu } from "./Panels";
import { type CardMotion, Path, type PathProps, flyToBar } from "./Path";
import { PathSheet } from "./Sheet";
import { POSITION_NAMES, ROW_NAMES, type Draft, pastCards, replacesOf, rowInSentence, surveyAnswersOf, surveyChange } from "./prefs";
import { PreferencesPanel, postPreferences, usePresets } from "./Preferences";
import { AskFace, OfferFace, ResultFace, SURVEY_SIDES, type Setup } from "./Survey";
import { follow } from "./site/nav";

// M4 steps 5c to 5e: the desk, where you answer. It holds what you've answered this session, the mode the card is
// in, the reading time (D91), the keys, the lean and the drag, the hold on mythic cards (D67), and the undo window
// (D82); every card goes through the reveal (D86). M8b: audits come through the queue and held cards from their list,
// both answered blind first (D151); the setup survey comes before the cards, once (B-5na1k). Beside the card, the path
// (Path.tsx); under it, the pile of the rest of its area. In the header, the menu and its panels (Panels.tsx,
// Preferences.tsx), and your decisions by branch, a drawer the desk moves aside for (Branches.tsx, B-v8jzy). While it's
// open, it says you're there
// (D41), and notifies you of cards an agent stops for (D40). Round 5's behaviour, ported:
// design/explorations/round5/app.js. On a phone (D130), the card fills the screen and the path folds into a sheet you
// pull up (Sheet.tsx). On a touch screen (B-yfehp), a drag on a card scrolls, and a card is answered by holding it until
// it lifts, then dragging it toward an answer (Lift.tsx); a mouse, and the desktop, drag it as before.

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
/** The answers a lifted card has (B-yfehp): the live card's four; the survey's two and "not sure"; the briefing's way on. */
const ALL_WAYS: readonly Dir[] = ["left", "right", "up", "down"];
const SURVEY_WAYS: readonly Dir[] = ["left", "right", "down"];
const SIDEWAYS: readonly Dir[] = ["left", "right"];
const NO_WAYS: readonly Dir[] = [];
/** How the card on the desk leaves: toward the answer you gave, or, moving between cards or undoing, just fading. */
type Leave = Dir | "fade";

interface Answered {
  answer: Answer;
  /**
   * In its undo window or on its way (held); on the website, held by the relay until your passkey confirms it, with
   * other answers waiting (B-a6xpc); or recorded (sent).
   */
  phase: "held" | "waiting" | "sent";
  words: string;
  agent: string;
  /** What the toast says once it's recorded. */
  sent: string;
  /** For the path: the card's name and rarity, and your answer in a few words. */
  name: string;
  rarity: Rarity;
  state: string;
  /** On the website, a hard card's: its answer will wait for your passkey (D139, B-a6xpc). */
  hard?: boolean;
  /** While it waits for your passkey: the relay's hold on it. */
  wait?: Wait;
  /** Answered in the blind test (B-xx49m): the toast and the reopened card say only that it's recorded, whatever the card. */
  test?: boolean;
  /**
   * A practice card's (B-kb5yt): the card as it was shown, whether it said an agent had stopped (B-zw55w), and what the
   * path says of it once it may say it was practice: at once, or in the blind test once the test ends.
   */
  practice?: { card: DeskCard & { practice: Practice }; stopped: boolean; said: string };
}

/**
 * The answers this tab left waiting for your passkey in a project (B-a6xpc), as the desk finds them when it opens: those
 * the relay still holds, on cards still to answer at the same revision, and the cards of those it has dropped.
 */
function restoreWaiting(project: string, state: ApiState, now: number): { kept: [string, Answered][]; expired: string[] } {
  const kept: [string, Answered][] = [];
  const expired: string[] = [];
  for (const e of loadWaiting<Answered>(project)) {
    if (e.answered?.phase !== "waiting" || !e.answered.wait) continue;
    const card = state.cards.find((c) => keyOf(c) === e.key);
    if (!card || (card.status !== "open" && card.status !== "held")) continue;
    if (Date.parse(e.expires) <= now) expired.push(e.answered.name);
    else kept.push([e.key, e.answered]);
  }
  return { kept, expired };
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
  if (answer.kind === "choose" && isSeen(card) && answer.option === "proposal") return `you confirmed ${quoted(proposal)}, your answer in chat`;
  if (answer.kind === "choose") return answer.option === "proposal" ? `you chose ${quoted(proposal)}` : `you chose ${quoted(alternative)}, not ${agentOf(card)}'s pick`;
  return answer.kind === "write" ? "you wrote an answer" : "you couldn't judge it";
}

/**
 * What a card reopened from the path says of your answer (`CardProps.review`): in the blind test, only that it's recorded,
 * whatever the card (B-xx49m); a practice card's, outside it or once it has ended, that it was practice (B-kb5yt).
 */
function reviewOf(a: Answered, testing: boolean): NonNullable<CardProps["review"]> {
  const quiet = !!a.test && testing;
  return {
    words: a.words,
    sent: a.phase === "sent",
    waiting: a.phase === "waiting",
    ...(quiet ? { test: true } : {}),
    ...(a.practice && !quiet ? { practice: practiceWords(a.practice.card, a.practice.stopped) } : {}),
  };
}

/** Where a card starts: in the choice, or for one you answered in chat, showing what you said and the pick (B-hswmx). */
const startMode = (card: ApiCard | undefined): Mode => (card && isSeen(card) ? { kind: "seen" } : { kind: "live" });


/**
 * What the toast says once an answer is recorded: a slider proposal accepted moves its row (B-y6jn6); Baesian's own cards
 * go to no agent. In the blind test, every card's says only that it's recorded (B-xx49m); a practice card's outside it
 * says it was practice (B-kb5yt).
 */
function sentWords(card: DeskCard, answer: Answer, test: boolean): string {
  const m = card.meta;
  if (test) return "Recorded.";
  if (practiceOf(card)) return "Recorded: it was practice.";
  if (m.pref_row && m.pref_to && answer.kind === "choose") {
    return answer.option === "proposal" ? `Saved: ${ROW_NAMES[m.pref_row]} is at “${POSITION_NAMES[m.pref_to]}” now.` : `Recorded: the setting for ${rowInSentence(m.pref_row)} stays as it is.`;
  }
  return isOwnCard(m) ? "Recorded." : `Sent to ${m.source_agent}.`;
}

/** Baesian may have proposed something from your answers (D161, B-y6jn6): it's in the queue now. */
const filedWords = (n: number) => (n ? ` Baesian has ${n === 1 ? "a proposal" : `${NUMBER[n]?.toLowerCase() ?? n} proposals`} from your answers, in your queue.` : "");

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

export function Desk({ state, fetchedAt, notice, refreshing = false }: { state: ApiState; fetchedAt: number; notice?: string | undefined; refreshing?: boolean }) {
  const salt = useMemo(() => Math.random().toString(36).slice(2), []);
  const reduced = useReducedMotion();
  /** Where it reads and answers: the local server, or on the website the project's relay (M9e). */
  const endpoints = useEndpoints();
  // On the website, the answers this tab left waiting for your passkey come back, while the relay holds them (B-a6xpc).
  const [restored] = useState(() => (endpoints.hosted ? restoreWaiting(state.project.name, state, serverNow(state, fetchedAt)) : { kept: [], expired: [] }));
  const [answered, setAnswered] = useState<Map<string, Answered>>(() => new Map(restored.kept));
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  /** The cards whose answers waited too long for your passkey, which the desk tells you of until you dismiss it. */
  const [expired, setExpired] = useState<string[]>(restored.expired);
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
  /** Your decisions, by branch (B-v8jzy): a drawer beside the desk, open as a panel is. */
  const drawerOpen = panel === "branches";
  /** A settled card opened on the desk from the drawer, to look at as it was settled. */
  const [viewing, setViewing] = useState<string>();
  /** The setup survey, once you've started it (B-5na1k); before that, it may be offered. */
  const [setupStep, setSetupStep] = useState<Setup>();
  /** A draft for the preferences panel to open with: the survey's suggestion, to adjust. */
  const [prefsInitial, setPrefsInitial] = useState<Draft>();
  const project = state.project.name;
  /** The phone layout (D130), and a screen you touch: see media.ts. */
  const phone = useMedia(PHONE);
  const touch = useMedia(TOUCH);
  const deskRef = useRef<HTMLElement>(null);
  usePresence();
  const seen = useSeen(state);
  const briefed = useBriefed(state);
  const setupOffered = useSetupOffered(state);

  // Practice cards with planted picks (B-kb5yt, docs/vault/Design/Practice Cards.md): your practice answers, from their own
  // address (B-rehdw); where the blind test is (B-xx49m, B-bb7ga); and whether practice cards come now. Nothing until the
  // answers have been read, so a card never comes back twice; never before the blind test, nor once it spotted them.
  const practice = usePractice(endpoints);
  const pStatus = statusOf(practice.entries);
  const phase = practice.ready ? phaseOf(pStatus) : undefined;
  const testing = phase === "test";
  /** A practice card drawn to come next, and whether the real card answered before it said its agent had stopped (B-zw55w). */
  const [planted, setPlanted] = useState<{ card: DeskCard & { practice: Practice }; stopped: boolean }>();
  /**
   * In the blind test, the card you've just answered, for your guess about it on a card of its own before the next card
   * comes (B-9prve); its answer is already on its way. While the guess is kept, `saving`; if it couldn't be, why.
   */
  const [toMark, setToMark] = useState<{ key: string; card: DeskCard; saving?: boolean; problem?: string }>();
  /** Real answers since the last practice card this sitting: none came yet, so the first may follow the first answer. */
  const sinceLast = useRef(Number.POSITIVE_INFINITY);
  /** The cards drawn as practice this sitting, before their answers are kept. */
  const drawnHere = useRef(new Set<string>());
  /** What a practice card said once answered (Practice Cards section 4), until you dismiss it. */
  const [practiceNote, setPracticeNote] = useState<string>();

  const now = serverNow(state, fetchedAt);
  const cards = byId(state);
  // On the website, in a project with members (P20): the cards sent to you lead the queue, and the rest follow (B-tzdjn).
  const team = useTeam();
  const ordered = queue(state, now, team).filter((c) => !answered.has(keyOf(c)));
  const aside = parked(state, team).filter((c) => !answered.has(keyOf(c)));
  const held = heldBack(state).filter((c) => !answered.has(keyOf(c)));
  // Held back, never answered, past 90 days: listed without their text (B-ec3kj, M9f).
  const heldGone = heldRemoved(state);
  // A practice card you answered isn't in the state: reopened from the path, it's the card as it was shown.
  const reviewCard: DeskCard | undefined = reviewing ? (state.cards.find((c) => keyOf(c) === reviewing) ?? answered.get(reviewing)?.practice?.card) : undefined;
  // The card in front of you stays until you answer it or move on. When the queue re-sorts (an answer reaching
  // the server, an agent starting to wait), that changes what comes next, never the card you're reading (5f).
  const [shownKey, setShownKey] = useState("");
  const staying = ordered.find((c) => keyOf(c) === shownKey);
  // A card you put aside can be answered after all, and so can one held back (D150): picked from their lists.
  const picked = pick ? (ordered.find((c) => c.meta.id === pick) ?? aside.find((c) => c.meta.id === pick) ?? held.find((c) => c.meta.id === pick)) : undefined;
  // A settled card opened from your decisions, by branch (B-v8jzy): on the desk to look at, not to answer.
  const pastCard = viewing ? state.cards.find((c) => c.meta.id === viewing) : undefined;
  // A practice card drawn after your last answer comes next, as a card in the queue does (B-kb5yt).
  const current: DeskCard | undefined = pastCard ?? reviewCard ?? picked ?? planted?.card ?? staying ?? ordered[0];
  const key = current ? keyOf(current) : "";
  const deck = current ? state.decks.find((d) => d.meta.id === current.meta.deck) : undefined;
  /**
   * Whether an agent is waiting on a card now (D90). A practice card has none: it says one has stopped when the real card
   * before it did, until you've answered it (B-zw55w).
   */
  const stoppedFor = (c: DeskCard): boolean | undefined => (planted?.card === c ? planted.stopped : [...answered.values()].find((a) => a.practice?.card === c)?.practice?.stopped);
  const waitOf = (c: DeskCard) => (practiceOf(c) ? (stoppedFor(c) ? "waiting" : "none") : waitState(c, now));
  // With no preference file, the setup survey is offered once, before the cards (B-5na1k), unless an agent has
  // stopped for you: then it waits until none has. A practice card in the queue counts as any card there does.
  const waitingNow = ordered.filter((c) => waitState(c, now) === "waiting").length + (planted?.stopped ? 1 : 0);
  // Never to a member who isn't an owner: a project's settings are its owners' (B-rxbss).
  const offerDue = !setupOffered.offered && !state.routing.preferences && !state.routing.problem && waitingNow === 0 && !reviewCard && !picked && !pastCard && team?.role !== "member";
  const setup: Setup | undefined = setupStep ?? (offerDue ? { step: "offer" } : undefined);
  const presets = usePresets(panel === "preferences" || setup !== undefined, state.version);
  // The first card you reach from a deck with a briefing comes after its briefing card, once per deck (B-j6b75).
  // A card reopened from the path is one you've already reached; a practice card never comes after one (B-kb5yt).
  const briefing = !setup && !reviewCard && !pastCard && !practiceOf(current) && hasBriefing(deck) && !briefed.has(deck.meta.id) ? deck : undefined;
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
    setMode(pastCard ? { kind: "past" } : reviewing && reviewing === key ? { kind: "review" } : startMode(current));
    setProblem(undefined);
    setLean(undefined);
    setHover(undefined);
    setShownAt(performance.now());
  }
  // A card counts as seen once it's been on the desk, not behind its deck's briefing or the setup survey: it loses its "new" tag.
  const behind = !!briefing || !!setup || !!toMark;
  useEffect(() => {
    if (key && !behind) seen.mark(key);
  }, [key, behind, seen.mark]);
  // Its reading time (D91) starts once it's in front of you.
  const wasBehind = useRef(behind);
  if (wasBehind.current !== behind) {
    wasBehind.current = behind;
    if (!behind) setShownAt(performance.now());
  }
  // A card answered in chat asks for no reading first: you chose already, and it confirms what you said (B-hswmx).
  const dwell = r && current && mode.kind !== "review" && !isSeen(current) ? READ_FIRST_MS[r.rarity] : 0;
  const [, setFrame] = useState(0);
  const readLeft = Math.max(0, dwell - (performance.now() - shownAt));
  useEffect(() => {
    if (readLeft <= 0) return;
    const f = requestAnimationFrame(() => setFrame((n) => n + 1));
    return () => cancelAnimationFrame(f);
  });

  const say = (text: string, undoUntil?: number) => setToast({ text, ...(undoUntil ? { undoUntil } : {}), id: Date.now() + Math.random() });

  // The undo window (D82): one answer waits; undo takes it back; the next answer, or closing the page, sends it.
  const addPractice = practice.add;
  const outbox = useRef<Outbox>(undefined);
  if (!outbox.current) {
    outbox.current = new Outbox(postVerdictTo(endpoints), UNDO_MS, {
      sent: (k, posted) => {
        const a = answeredRef.current.get(k);
        // A practice card's answer, or a mark in the blind test, is kept with your practice answers (B-rehdw).
        if (posted?.practice) addPractice(posted.practice);
        // An answer sent because you gave the next one keeps quiet: the next one's toast, with its Undo, stays. The path,
        // and the strip of answers waiting for your passkey, say what became of it.
        const quiet = !!outbox.current?.waiting();
        // On the website, a hard answer waits for your passkey, with any others waiting, and you go on (B-a6xpc).
        const wait = posted?.waiting;
        if (wait) {
          setAnswered((m) => (m.has(k) ? new Map(m).set(k, { ...m.get(k)!, phase: "waiting", wait }) : m));
          if (quiet) return;
          return say(`${a?.hard === false ? "Accepting it lets more cards past you, so it" : "It"} waits for your passkey.`);
        }
        setAnswered((m) => (m.has(k) ? new Map(m).set(k, { ...m.get(k)!, phase: "sent" }) : m));
        // Outside the blind test, a practice card says it was practice once it's recorded (B-kb5yt); in it, nothing does,
        // and no card says Baesian proposed something from it, which a practice card never could (B-xx49m).
        if (a?.practice && !a.test) setPracticeNote(practiceWords(a.practice.card, a.practice.stopped));
        if (!quiet) say(`${a?.sent ?? "Sent."}${a?.test ? "" : filedWords(posted?.filed?.length ?? 0)}`);
      },
      failed: (k, error, decided) => {
        setAnswered((m) => {
          const n = new Map(m);
          n.delete(k);
          return n;
        });
        // Another member decided it first (P20, B-v43z8): now that you've chosen too, the desk says who, and what.
        say(decided ? decidedWords(decided) : `That answer wasn't recorded: ${error}. The card is back.`);
      },
    });
  }
  useEffect(() => {
    const leave = () => outbox.current!.flush(true);
    addEventListener("pagehide", leave);
    return () => {
      removeEventListener("pagehide", leave);
      // Left within the site's app (its back button, say), the desk sends what's held as leaving the page would.
      leave();
    };
  }, []);

  // ---------------------------------------------------------------- answers waiting for your passkey (B-a6xpc)
  // On the website, a hard answer waits, marked on the path, while you go on; one tap then confirms every answer waiting.
  const waits = [...answered].filter((e): e is [string, Answered & { wait: Wait }] => e[1].phase === "waiting" && !!e[1].wait);
  const waitKey = waits.map(([, a]) => a.wait.pending).join(" ");
  const [asking, setAsking] = useState(false);
  /** Answers you said "Not now" to, or whose tap failed: the desk doesn't ask by itself again for them alone. */
  const declined = useRef(new Set<string>());
  /** Answers it has asked about as they neared expiry. */
  const warned = useRef(new Set<string>());
  /** How far the relay's clock, which a wait's expiry is by, is ahead of this browser's. */
  const skew = now - Date.now();
  const expiresAt = (a: { wait: Wait }) => Date.parse(a.wait.expires);
  // Kept in this tab while they wait, so a reload, coming back to the page or signing in again finds them (waiting.ts).
  useEffect(() => {
    if (endpoints.hosted) saveWaiting(project, waits.map(([key, a]) => ({ key, expires: a.wait.expires, answered: a })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitKey]);
  // Looked at again when one would expire within five minutes, and when it expires.
  const [, setTick] = useState(0);
  useEffect(() => {
    const at = waits.flatMap(([, a]) => [expiresAt(a) - skew - ASK_BEFORE_EXPIRY_MS, expiresAt(a) - skew]).filter((t) => t > Date.now());
    if (!at.length) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(...at) - Date.now() + 20);
    return () => clearTimeout(t);
  });

  /** Take answers off the desk that weren't recorded: their cards come back. */
  const drop = (keys: string[]) => {
    if (!keys.length) return;
    setAnswered((m) => {
      const n = new Map(m);
      for (const k of keys) n.delete(k);
      return n;
    });
    if (reviewing && keys.includes(reviewing)) setReviewing(undefined);
  };
  /** The cards of answers that waited too long, for the notice: each once, whether the desk's clock or the relay said so. */
  const noteExpired = (names: string[]) => names.length && setExpired((x) => [...new Set([...x, ...names])]);
  // An answer the relay has dropped, unconfirmed, comes off the desk, and the desk says so until you dismiss it.
  const lapsed = waits.filter(([, a]) => expiresAt(a) <= now);
  const lapsedKey = lapsed.map(([k]) => k).join(" ");
  useEffect(() => {
    if (!lapsed.length) return;
    drop(lapsed.map(([k]) => k));
    noteExpired(lapsed.map(([, a]) => a.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapsedKey]);

  /** What a tap's outcomes do on the desk: answers recorded, dropped (they waited too long), or refused (their cards changed). */
  const settle = (list: [string, Answered & { wait: Wait }][], out: Confirmed) => {
    const keyFor = new Map(list.map(([k, a]) => [a.wait.pending, k]));
    const gone = out.expired.flatMap((p) => keyFor.get(p) ?? []);
    const written: string[] = [];
    const refused: { key: string; why: string }[] = [];
    // Answers another member's came before (P20, B-v43z8): not recorded, and their cards don't come back.
    const beaten: { key: string; words: string }[] = [];
    let filed = 0;
    for (const o of out.outcomes) {
      const k = keyFor.get(o.pending);
      if (!k) continue;
      const body = o.body as { error?: string; filed?: string[] } | undefined;
      const decided = o.status === 409 ? decidedIn(body) : undefined;
      if (o.status === 201) {
        written.push(k);
        filed += body?.filed?.length ?? 0;
      } else if (o.status === 410) gone.push(k);
      else if (decided) beaten.push({ key: k, words: decidedWords(decided) });
      else refused.push({ key: k, why: body?.error ?? `the server answered ${o.status}` });
    }
    const names = new Map(list.map(([k, a]) => [k, a]));
    setAnswered((m) => {
      const n = new Map(m);
      for (const k of written) {
        const a = n.get(k);
        if (!a) continue;
        const { wait: _, ...rest } = a;
        n.set(k, { ...rest, phase: "sent" });
      }
      return n;
    });
    drop([...gone, ...refused.map((x) => x.key), ...beaten.map((x) => x.key)]);
    noteExpired(gone.map((k) => names.get(k)!.name));
    if (beaten.length) say(beaten.length === 1 ? `“${names.get(beaten[0]!.key)!.name}”: ${beaten[0]!.words}` : `${NUMBER[beaten.length] ?? beaten.length} of those cards were answered by someone else first, so your answers to them weren't recorded.`);
    else if (refused.length) {
      const one = refused.length === 1;
      say(`${one ? "That answer wasn't" : `${NUMBER[refused.length] ?? refused.length} answers weren't`} recorded: ${refused[0]!.why}. ${one ? "The card is" : "Their cards are"} back.`);
    } else if (written.length) say(`${confirmedLine(written.length, names.get(written[0]!)?.sent)}${filedWords(filed)}`);
  };

  /** Ask your passkey to confirm every answer waiting, with one tap: by the button, or by the desk's own rule. */
  const confirmWaiting = async (expiring = false) => {
    const list = waits.filter(([, a]) => expiresAt(a) > serverNow(state, fetchedAt));
    if (!list.length || !endpoints.hosted) return;
    const pendings = list.map(([, a]) => a.wait.pending);
    if (expiring) for (const p of pendings) warned.current.add(p);
    setAsking(true);
    try {
      const titles = Object.fromEntries(list.map(([, a]) => [a.wait.pending, a.name]));
      settle(list, await confirmAnswers(endpoints, pendings, { kind: "answers", titles, loosens: list.some(([, a]) => a.wait.proving.includes("preferences")) }));
    } catch (e) {
      for (const p of pendings) declined.current.add(p);
      const one = list.length === 1;
      if (e instanceof NotConfirmed) say(`Not confirmed: ${one ? "your answer waits" : "your answers wait"} for your passkey.`);
      else say(`Your passkey didn't confirm ${one ? "it" : "them"}: ${e instanceof Error ? e.message : String(e)}. ${one ? "It waits" : "They wait"} still.`);
    } finally {
      setAsking(false);
    }
  };

  // The desk asks by itself once the run of hard cards in front of you is over, or an answer nears expiry (waiting.ts).
  const busy = asking || [...answered.values()].some((a) => a.phase === "held") || mode.kind === "write" || mode.kind === "pass" || menuOpen || (!!panel && panel !== "path");
  const decision = askNow({
    waiting: waits.filter(([, a]) => expiresAt(a) > now).map(([, a]) => ({ pending: a.wait.pending, expiresAt: expiresAt(a) })),
    busy,
    hardInFront: !!current && isHard(current),
    declined: declined.current,
    warned: warned.current,
    now,
  });
  useEffect(() => {
    if (decision !== "no") void confirmWaiting(decision === "expiring");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision, waitKey]);

  // Leaving the page while answers wait, or a hard answer is still in its undo window, asks first: closed, they're lost.
  const unconfirmed = waits.length > 0 || [...answered.values()].some((a) => a.phase === "held" && a.hard);
  /** The wordmark's click, on the website: to your projects in the app, unless leaving would lose something unconfirmed. */
  const toProjects = (e: ReactMouseEvent) => {
    if (unconfirmed) return;
    outbox.current!.flush(true);
    follow("/")(e);
  };
  useEffect(() => {
    if (!unconfirmed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [unconfirmed]);

  /**
   * After a real answer (not a change), maybe a practice card comes next (Practice Cards section 4, B-kb5yt): drawn at the
   * phase's rate (`draws()`), never two pending, and in the blind test only until ten have come (B-xx49m). It says an agent
   * has stopped when the card just answered did (B-zw55w).
   */
  const drawAfter = (answeredCard: DeskCard) => {
    if (!phase) return;
    sinceLast.current += 1;
    // A practice card's guess is kept before the next card comes (B-9prve), so the test's count is up to date here.
    if (planted) return;
    if (pStatus.kind === "test" && pStatus.practice >= TEST_SIZE) return;
    const pool = sources(state, now, new Set([...practised(practice.entries), ...drawnHere.current]));
    const realLeft = ordered.filter((c) => keyOf(c) !== keyOf(answeredCard)).length;
    if (!draws({ phase, since: sinceLast.current, realLeft, pool: pool.length, roll: Math.random() })) return;
    const from = pool[Math.floor(Math.random() * pool.length)]!;
    drawnHere.current.add(from.meta.id);
    sinceLast.current = 0;
    setPlanted({ card: rebuild(from), stopped: waitState(answeredCard, now) === "waiting" });
  };

  const commit = (answer: Answer) => {
    if (!current) return;
    // The copy this tab kept from before, still refreshing (B-3va5g): someone may have answered the card elsewhere since,
    // and the latest answer is the one that counts, so answers wait until the project is up to date.
    if (refreshing) return say("This project is still refreshing: answer once it's up to date, in a moment.");
    const v = verdictFor(current, answer);
    if ("problem" in v) return setProblem(v.problem);
    // In the blind test, every card you answer gets your guess, on a card of its own after it (B-xx49m, B-9prve), but one
    // you answered in chat, which you'd know was real.
    const test = testing && !isSeen(current);
    const pr = practiceOf(current);
    const words = describeAnswer(current, answer);
    // How long the card was in front of you, for your calibration: first answers only, not changes, and never a card
    // answered in chat, which calibration leaves out (B-hswmx), nor a practice card, which isn't one of your real cards.
    if (!reviewing && !isSeen(current) && !pr) addSpent(project, { rarity: r!.rarity, ms: Math.round(performance.now() - shownAt), at: new Date().toISOString() });
    exitDir.current = answer.kind === "choose" ? sideOf(answer.option) : answer.kind === "write" ? "up" : "down";
    // Your choice flies from the card into the path (round 5's one sequenced movement).
    if (answer.kind === "choose" && !reduced) {
      const h2 = document.querySelector<HTMLElement>(`.stage article.card:not([data-leaving]) .opt[data-kind="${answer.option}"] h2`);
      const rect = h2?.getBoundingClientRect();
      if (rect) setFly({ key, from: { x: rect.left, y: rect.top }, text: current.meta[answer.option] });
    }
    // A practice card's answer goes to the practice answers, never to an agent (B-rehdw); a real card's verdict as any does.
    const item: Outgoing = pr ? { practice: practiceAnswer(pr, answer, test) } : { verdict: v.verdict };
    const stopped = pr ? (stoppedFor(current) ?? false) : false;
    // A changed answer keeps its place on the path (Map.set keeps the order) and replaces what was there.
    setAnswered((m) =>
      new Map(m).set(key, {
        answer,
        phase: "held",
        words,
        agent: agentOf(current),
        sent: sentWords(current, answer, test),
        name: current.meta.title,
        rarity: r!.rarity,
        // A practice card says so on the path at once, or in the blind test once the test ends.
        state: pr && !test ? practicePath(current, answer) : pathState(current, answer),
        ...(endpoints.hosted ? { hard: isHard(current) } : {}),
        ...(test ? { test: true } : {}),
        ...(pr ? { practice: { card: current as DeskCard & { practice: Practice }, stopped, said: practicePath(current, answer) } } : {}),
      }),
    );
    const waiting = outbox.current!.hold(key, item);
    // The arrow that answered it is let go on the next card: it answers nothing there.
    keyHeld.current = undefined;
    // Round 5 took your answer out of this toast: the path shows it. In the blind test every card's is the same; outside
    // it, a practice card says it was practice once you've answered it.
    say(test || isOwnCard(current.meta) ? "Recording it in" : pr ? "That was practice. Recording it in" : `Sending to ${current.meta.source_agent} in`, waiting.until);
    setPick(undefined);
    setReviewing(undefined);
    if (pr) setPlanted(undefined);
    else if (!reviewing) drawAfter(current);
    // In the blind test, your guess about it comes next, before the next card (B-9prve).
    if (test) {
      setToMark({ key, card: current });
      focusCard();
    }
  };

  /** Keep your guess about the card you've just answered (B-9prve), then on to the next card, whose reading time starts now. */
  const giveMark = async (mark: PracticeMark) => {
    if (!toMark || toMark.saving) return;
    setToMark({ ...toMark, saving: true });
    try {
      practice.add(await postPractice(endpoints, markOf(toMark.card, mark)));
      exitDir.current = "fade";
      setToMark(undefined);
      setShownAt(performance.now());
      focusCard();
    } catch (e) {
      setToMark({ ...toMark, saving: false, problem: `Your guess wasn't kept: ${e instanceof Error ? e.message : String(e)}. Try again.` });
    }
  };

  const undo = () => {
    const k = outbox.current!.undo();
    if (!k) return;
    const a = answeredRef.current.get(k);
    // Taken back, a card needs no guess yet: it gets one when you answer it again.
    if (toMark?.key === k) setToMark(undefined);
    setAnswered((m) => {
      const n = new Map(m);
      n.delete(k);
      return n;
    });
    exitDir.current = "fade";
    setReviewing(undefined);
    // A practice card comes back as it was, in front of you; a real one from the queue or its list.
    if (a?.practice) {
      setPick(undefined);
      setPlanted({ card: a.practice.card, stopped: a.practice.stopped });
    } else setPick(k.split("@")[0]);
    say("Undone. The card is back.");
  };

  const reach = (dir: Dir) => {
    if (!current || (mode.kind !== "live" && mode.kind !== "seen")) return;
    setLean(undefined);
    if (dir === "up") return setMode({ kind: "write", text: "" });
    if (dir === "down") return setMode({ kind: "pass", text: "" });
    if (readLeft > 0) return setNudged((n) => n + 1);
    const option = sides[dir];
    // A card answered in chat (B-hswmx): its pick, your answer, is confirmed at once, or on a mythic card held (D67); the
    // other option goes to the reveal, with no blind choice, since you'd seen the pick.
    if (mode.kind === "seen") {
      if (option === "alternative") return setMode({ kind: "reveal", option, side: dir, why: "", ...(mode.rule ? { rule: true } : {}) });
      if (r?.rarity !== "mythic") return confirm();
      setNudged((n) => n + 1);
      return say(touch ? "Press and hold to confirm." : "Hold to confirm, until the bar fills.");
    }
    // The choice made before the agent's pick was ever shown is the one recorded (D88), even after Esc.
    if (!firstChoice.current.has(key)) firstChoice.current.set(key, option);
    setMode({ kind: "reveal", option, side: dir, first: firstChoice.current.get(key)!, why: "" });
  };

  const confirm = () => {
    // A card answered in chat: one tap confirms your answer, the pick (B-hswmx).
    if (mode.kind === "seen") return commit({ kind: "choose", option: "proposal", ...(mode.rule ? { rule: true } : {}) });
    if (mode.kind !== "reveal") return;
    commit({
      kind: "choose",
      option: mode.option,
      ...(mode.first ? { first: mode.first } : {}),
      ...(mode.why.trim() ? { why: mode.why } : {}),
      ...(mode.rule ? { rule: true } : {}),
      ...(mode.retire?.length ? { retire: mode.retire } : {}),
      ...(mode.asked ? { asked: true } : {}),
    });
  };
  // The other option breaks other rules, if any: what you meant to retire goes with the option you left.
  // On a card answered in chat, back to what you said, and its one-tap confirm (B-hswmx).
  const switchToPick = () =>
    mode.kind === "reveal" && (current && isSeen(current) ? setMode({ kind: "seen", ...(mode.rule ? { rule: true } : {}) }) : setMode({ ...mode, option: "proposal", side: sideOf("proposal"), why: "", retire: [] }));
  const send = () => {
    if (mode.kind !== "write" && mode.kind !== "pass") return;
    if (!mode.reason) return setProblem("Choose a reason first.");
    commit(mode.kind === "write" ? { kind: "write", reason: mode.reason, text: mode.text, ...(mode.rule ? { rule: true } : {}) } : { kind: "pass", reason: mode.reason, text: mode.text });
  };
  const back = () => {
    setProblem(undefined);
    if (viewing) {
      exitDir.current = "fade";
      setViewing(undefined);
      return;
    }
    if (reviewing && (mode.kind === "review" || answered.has(reviewing))) {
      exitDir.current = "fade";
      setReviewing(undefined);
      return;
    }
    setMode(startMode(current));
  };

  /** Changing an answer you've already given (D81): the card comes back to the choice, where it was on the path. */
  const change = () => {
    if (!reviewing) return;
    const a = answered.get(reviewing);
    // An answer not yet recorded is taken back: one in its undo window, or one waiting for your passkey, which the relay
    // then drops unconfirmed when it expires (B-a6xpc).
    if (a?.phase === "held" || a?.phase === "waiting") {
      if (a.phase === "held") outbox.current!.undo();
      setAnswered((m) => {
        const n = new Map(m);
        n.delete(reviewing);
        return n;
      });
      // A practice card isn't in the state: taken back, it's in front of you again, as after an undo.
      if (a.practice) {
        setReviewing(undefined);
        setPlanted({ card: a.practice.card, stopped: a.practice.stopped });
      }
    }
    setMode(startMode(current));
    setShownAt(performance.now());
  };

  /** Clicking a decision on the path: a card to answer opens; one you've answered reopens. */
  const goTo = (id: string) => {
    if (mode.kind === "write" || mode.kind === "pass") return say("Send or cancel your written answer first.");
    // Going to a card leaves the setup survey, as "Not now" does.
    if (setup) setupAway();
    if (id === current?.meta.id) return;
    exitDir.current = "fade";
    setViewing(undefined);
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
  // A practice card offers none: merging its topic would merge its original's, a real change.
  const near = current && !isOwnCard(current.meta) && !practiceOf(current) ? nearTopics(current.canonicalTopic, topicCounts.keys()).map((topic) => ({ topic, count: topicCounts.get(topic)! })) : [];
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

  // ---------------------------------------------------------------- the blind test (B-xx49m)
  // You start it yourself, from your calibration, once there are ten past cards to rebuild; when the tenth practice card
  // has been answered, its result opens.
  const [starting, setStarting] = useState(false);
  const startTest = async () => {
    setStarting(true);
    try {
      practice.add(await postPractice(endpoints, { kind: "test-start" }));
      setPanel(undefined);
      say("The blind test is on. Mark each card you answer.");
    } catch (e) {
      say(`The blind test didn't start: ${e instanceof Error ? e.message : String(e)}.`);
    } finally {
      setStarting(false);
    }
  };
  const wasTesting = useRef(false);
  useEffect(() => {
    if (wasTesting.current && (pStatus.kind === "spotted" || pStatus.kind === "on")) setPanel("practice");
    wasTesting.current = pStatus.kind === "test";
  }, [pStatus.kind]);

  const notifications = useNotifications(state, goTo, team);
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
  /**
   * "Open it on the desk", from your decisions, by branch (B-v8jzy): the drawer closes and the card is on the desk. One
   * still to answer (waiting, put aside, held back), or answered this session, opens as from the path; a settled one opens
   * to look at, as it was settled, until you go back.
   */
  const openFromBranches = (id: string) => {
    setPanel(undefined);
    if (id === current?.meta.id) return focusCard();
    const answerable = [...ordered, ...aside, ...held].some((c) => c.meta.id === id) || [...answered.keys()].some((k) => k.startsWith(`${id}@`));
    if (answerable) return goTo(id);
    if (mode.kind === "write" || mode.kind === "pass") return say("Send or cancel your written answer first.");
    if (!state.cards.some((c) => c.meta.id === id)) return;
    if (setup) setupAway();
    exitDir.current = "fade";
    setReviewing(undefined);
    setViewing(id);
    focusCard();
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
    if ((mode.kind !== "reveal" && mode.kind !== "seen") || holdStart.current !== undefined) return;
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
  const pickSide = sideOf("proposal");
  const marking = !!toMark;
  const handlers = useRef({ mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity, pickSide, menuOpen, panel, briefing: !!briefing, dismissBriefing, setup: !!setup, setupKey, setupAway, marking, giveMark });
  handlers.current = { mode, reach, confirm, undo, back, beginHold, endHold, ordered, current, rarity: r?.rarity, pickSide, menuOpen, panel, briefing: !!briefing, dismissBriefing, setup: !!setup, setupKey, setupAway, marking, giveMark };
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
        // The guess in the blind test isn't skipped (B-9prve): Z takes the answer back instead.
        else if (h.marking) return;
        else if (h.briefing) h.dismissBriefing();
        else if (h.mode.kind !== "live" || reviewingRef.current) h.back();
        else if (keyHeld.current) {
          keyHeld.current = undefined;
          setLean(undefined);
        }
        return;
      }
      // B opens your decisions, by branch, and closes them (B-v8jzy), from anywhere but a field you type in or a list.
      if ((e.key === "b" || e.key === "B") && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof Element && e.target.closest('input:not([type="checkbox"]), textarea, select, [contenteditable="true"]'))) {
        e.preventDefault();
        if (!e.repeat) setPanel((p) => (p === "branches" ? undefined : "branches"));
        return;
      }
      // The drawer is modal: the keys are its own, Esc and B aside.
      if (h.panel === "branches") return;
      // Typing goes to the field, and a radio button keeps its arrows; a ticked box (make this a rule) leaves the keys
      // to the card. Inside a panel, the keys are the panel's.
      if (e.target instanceof Element && e.target.closest('input:not([type="checkbox"]), textarea, .panel, .sheet')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "z" || e.key === "Z") return h.undo();
      if (e.key === "?") return setPanel((p) => (p === "keys" ? undefined : "keys"));
      const dir = ARROWS[e.key];
      // In the blind test, the card asking your guess about the card you've just answered has 1, 2 and 3 to itself (no,
      // maybe, sure; B-9prve): nothing reaches the next card until it's given.
      if (h.marking) {
        const m = MARKS.find((x) => x.key === e.key);
        if (m || dir) e.preventDefault();
        if (m && !e.repeat) void h.giveMark(m.mark);
        return;
      }
      // The setup survey has the arrows, and Enter, to itself. A focused button takes its own Enter.
      if (h.setup) {
        const enter = e.key === "Enter" && !(e.target instanceof HTMLButtonElement);
        if (dir || enter) {
          e.preventDefault();
          if (!e.repeat) h.setupKey(dir ?? "enter");
        }
        return;
      }
      if ((e.key === "j" || e.key === "k") && (h.mode.kind === "live" || h.mode.kind === "seen") && h.ordered.length) {
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
      // A card answered in chat (B-hswmx): the arrow on your answer's side confirms it, held on a mythic card (D67).
      if (h.mode.kind === "seen" && dir === h.pickSide) {
        if (h.rarity !== "mythic") return h.confirm();
        keyHeld.current = dir;
        return h.beginHold();
      }
      if (h.mode.kind !== "live" && h.mode.kind !== "seen") return;
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
      if (h.mode.kind === "reveal" || (h.mode.kind === "seen" && dir === h.pickSide)) return h.endHold();
      if (h.mode.kind === "live" || h.mode.kind === "seen") h.reach(dir);
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
  const inPlay = setup || toMark ? undefined : current;
  // Whom the card in play was sent to, when that isn't simply you, and since when (P20, B-tzdjn): "Sent to ana 40 minutes ago."
  const sentTo = current && !pastCard && !reviewCard && !practiceOf(current) ? sentToWords(current, team) : undefined;
  const sentLine = sentTo && current ? `${sentTo[0]!.toUpperCase()}${sentTo.slice(1)}${sentTo.startsWith("sent") ? ` ${ago(Date.parse(current.meta.created), now)}` : ""}.` : undefined;
  // A card that was yours to answer and that another member decided leaves the desk, which says who answered it.
  const toAnswerId = current && !pastCard && !reviewCard && !practiceOf(current) ? current.meta.id : undefined;
  const inFront = useRef<string>(undefined);
  useEffect(() => {
    const was = inFront.current;
    inFront.current = toAnswerId;
    if (!was || was === toAnswerId) return;
    const card = cards.get(was);
    const who = decidedByAnother(card, team);
    if (who && ![...answeredRef.current.keys()].some((k) => k.startsWith(`${was}@`))) say(`${who} answered “${card!.meta.title}”, so it's off your desk.`);
  });
  const relations = inPlay ? relationsOf(inPlay, state) : [];
  const relById = new Map(relations.map((x) => [x.id, x]));
  const trail = [...answered.entries()]
    .filter(([k]) => k !== key)
    .map(([k, a]) => {
      const id = k.split("@")[0]!;
      const link = relById.get(id);
      // A practice card answered in the blind test says so on the path once the test has ended (B-xx49m).
      const says = a.practice && a.test && !testing ? a.practice.said : a.state;
      return { key: k, id, name: a.name, state: says, rarity: a.rarity, ...(a.phase === "waiting" ? { waiting: true } : {}), ...(link ? { link } : {}) };
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
      ...(sentToWords(c, team) ? { sent: sentToWords(c, team)! } : {}),
    };
  });
  const leaning = lean ?? handLean ?? hover;
  const leanKind = mode.kind === "live" ? (leaning ? sides[leaning] : undefined) : mode.kind === "seen" ? (leaning ? sides[leaning] : "proposal") : mode.kind === "reveal" ? mode.option : undefined;

  // On a phone (D130). Each new card, survey step or briefing starts at its top.
  const faceKey = setup ? `setup:${setup.step}:${setup.step === "ask" ? setup.i : ""}` : toMark ? `mark:${toMark.key}` : briefing ? `brief:${briefing.meta.id}` : current ? key : "empty";
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
    current: inPlay && r ? { id: inPlay.meta.id, name: inPlay.meta.title, rarity: r.rarity, stopped: waitOf(inPlay) === "waiting", conflict: (inPlay.meta.conflict_of?.length ?? 0) > 0 } : undefined,
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

  // A practice card waiting to come counts as any card in the queue does (Practice Cards section 3); notifications never count one.
  const toAnswer = ordered.length + (planted ? 1 : 0);
  const summary = toAnswer ? (
    <>
      <b>{toAnswer} to answer.</b>
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
      <header className="bar" inert={drawerOpen}>
        {endpoints.hosted ? (
          // On the website (M9e): the wordmark goes to your projects, and the project's name says where you are (B-zqkwk).
          <>
            {/* To your projects within the site's app, so what this tab kept stays (B-3va5g), with answers in their undo window
                sent first, as leaving the page sends them. With answers unconfirmed, the page is left, which asks first. */}
            <a className="wordmark" href="/" title="Your projects" onClick={toProjects}>
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
          {/* The copy this tab kept, until a fresh read replaces it (B-3va5g). */}
          {refreshing && <span className="refreshing"> Refreshing…</span>}
        </p>
        {/* B-v8jzy: your decisions, by branch, in a drawer; B opens and closes it too. */}
        <button type="button" className="bar-btn branches" aria-haspopup="dialog" aria-expanded={drawerOpen} aria-controls="branches-drawer" onClick={() => showPanel("branches")}>
          {/* On a narrow phone, where the header has the project's name too, the button is its glyph; its name stays. */}
          <svg className="bar-icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="5" cy="3.5" r="2" />
            <circle cx="5" cy="14.5" r="2" />
            <circle cx="13" cy="5" r="2" />
            <path d="M5 5.5v7M13 7c0 3.5-8 2.5-8 5.5" />
          </svg>
          <span className="bar-lbl">Branches</span> <kbd>B</kbd>
        </button>
        <MoreMenu
          open={menuOpen}
          notify={notifications.status}
          held={held.length + heldGone.length}
          touch={touch}
          site={!!endpoints.hosted}
          {...(team?.role === "member" ? { member: true } : {})}
          onOpen={setMenuOpen}
          onPanel={showPanel}
          onNotify={() => void toggleNotify()}
        />
      </header>
      {endpoints.hosted && <ProofPrompt />}
      {panel === "keys" && <KeysPanel touch={touch} phone={phone} onClose={() => setPanel(undefined)} />}
      {panel === "calibration" && (
        <CalibrationPanel
          spent={loadSpent(project)}
          superseded={laterSuperseded(state)}
          routing={state.routing}
          practice={{ status: pStatus, entries: practice.entries, ready: practice.ready, state, now, starting, onStart: () => void startTest(), onResult: () => setPanel("practice") }}
          onClose={() => setPanel(undefined)}
        />
      )}
      {/* The blind test's result (B-xx49m, B-bb7ga): shown when the tenth practice card is answered, and from your calibration. */}
      {panel === "practice" && (pStatus.kind === "spotted" || pStatus.kind === "on") && (
        <PracticeResultPanel status={pStatus} titleOf={(id) => cards.get(id)?.meta.title} onClose={() => setPanel(undefined)} />
      )}
      {/* D181, B-v8jzy: your decisions by branch, in a drawer beside the desk, or filling a phone's screen. */}
      <BranchesDrawer state={state} nowMs={now} open={drawerOpen} phone={phone} touch={touch} onClose={() => setPanel(undefined)} onOpenCard={openFromBranches} />
      {panel === "held" && (
        <HeldPanel
          held={held}
          gone={heldGone}
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
          {...(team?.role === "member" ? { ownersOnly: true } : {})}
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
      <main className="desk" ref={deskRef} inert={sheetOpen || drawerOpen}>
        {/* On a phone, the path is in the sheet, below. */}
        {!phone && <Path {...pathProps} {...(cardMotion ? { card: cardMotion } : {})} {...(fly ? { fly, onFlown: () => setFly(undefined) } : {})} />}
        <section className="stage" aria-label="The card to answer">
          {/* On the website (M9e step 2): a machine whose cards don't notify for now, after a burst. */}
          {notice && (
            <p className="desk-notice" role="status">
              {notice}
            </p>
          )}
          {/* On the website: answers waiting for your passkey, confirmed together (B-a6xpc); and any that waited too long. */}
          {/* B-kb5yt: a practice card says it was practice once you've answered it, where a real card would say it was sent. */}
          {practiceNote && (
            <div className="passkey-wait practice-note" role="status">
              <p>{practiceNote}</p>
              <button type="button" className="cancel" onClick={() => setPracticeNote(undefined)}>
                Got it
              </button>
            </div>
          )}
          {expired.length > 0 && (
            <div className="passkey-wait lapsed" role="alert">
              <p>{expiredLine(expired)}</p>
              <button type="button" className="cancel" onClick={() => setExpired([])}>
                Got it
              </button>
            </div>
          )}
          {waits.length > 0 && (
            <div className="passkey-wait" role="status">
              <p>
                <span className="key-dot" aria-hidden="true" />
                {waitingLine(waits.length)}
              </p>
              <button type="button" className="confirm" disabled={asking} onClick={() => void confirmWaiting()}>
                {waits.length === 1 ? "Confirm it" : "Confirm them"}
              </button>
            </div>
          )}
          <p className="crumbs">
            {setup ? (
              <>
                setting up › <b>Your preferences</b>
              </>
            ) : toMark ? (
              <>
                blind test › <b>Your guess</b>
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
                  touch={touch}
                  {...(setup.step === "ask" && survey
                    ? {
                        onSwipe: (dir: Side | "down") => setupAnswer(dir),
                        labels: { left: choiceLabel(survey.see, "left"), right: choiceLabel(survey.fine, "right"), down: answerLabel("Not sure") },
                      }
                    : {})}
                >
                  {(armed) =>
                    setup.step === "offer" ? (
                      <OfferFace count={survey?.items.length} onStart={setupStart} onAway={setupAway} />
                    ) : setup.step === "ask" && survey ? (
                      <AskFace survey={survey} i={setup.i} armed={armed} touch={touch} onAnswer={setupAnswer} onSkip={() => setupAnswer("down")} onBack={setupBack} onAway={setupAway} />
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
              ) : toMark ? (
                // In the blind test: your guess about the card you've just answered, on a card of its own (B-9prve).
                <MarkCard key={`mark:${toMark.key}`} name={toMark.card.meta.title} touch={touch} saving={!!toMark.saving} problem={toMark.problem} onMark={(m) => void giveMark(m)} />
              ) : briefing ? (
                <BriefingCard
                  key={`brief:${briefing.meta.id}`}
                  deck={briefing}
                  waiting={ordered.filter((c) => c.meta.deck === briefing.meta.id).length}
                  touch={touch}
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
                  touch={touch}
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
                    wait: waitOf(current),
                    ...(sentLine ? { sent: sentLine } : {}),
                    ...((team?.handles.size ?? 0) > 1 ? { others: true } : {}),
                    sides,
                    mode,
                    rules: state.rules,
                    readLeftMs: readLeft,
                    readFraction: dwell ? 1 - readLeft / dwell : 1,
                    ...(hold !== undefined ? { hold } : {}),
                    ...(problem ? { problem } : {}),
                    ...(reviewing && answered.get(reviewing) ? { review: reviewOf(answered.get(reviewing)!, testing) } : {}),
                    ...(pastCard ? { past: { words: saidOf(pastCard, now).words, chosen: chosenOf(pastCard), onBranches: () => setPanel("branches") } } : {}),
                    ...(near.length && !pastCard ? { near, onMerge: (into: string) => void merge(into) } : {}),
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
                    recap={recap([...answered.values()].filter((a) => !a.practice).map((a) => a.answer))}
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
        <PathSheet open={sheetOpen} answered={trail.length} connected={relations} next={ahead.length} lean={leanKind} onOpen={openSheet} inert={drawerOpen}>
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

/**
 * How strongly each option is picked out as the card moves: fully once it has moved as far as a drag's threshold takes
 * it. A lifted card dragged up or down picks out neither (B-yfehp).
 */
function useSideLight(x: MotionValue<number>, y: MotionValue<number>, lifted: MotionValue<number>) {
  const light = (sign: number) => ([vx = 0, vy = 0, l = 0]: number[]) => (l && Math.abs(vy) > Math.abs(vx) ? 0 : Math.max(0, Math.min(1, (sign * vx) / LEAN_X)));
  return { pl: useTransform([x, y, lifted], light(-1)), pr: useTransform([x, y, lifted], light(1)) };
}

/**
 * One card on the desk, with its own motion: the lean, the drag, the swipe, and leaving toward the side you chose. On a
 * touch screen, held until it lifts, then dragged (B-yfehp, Lift.tsx).
 */
function LiveCard(p: {
  card: CardProps;
  lean: Side | undefined;
  onMotion: (m: CardMotion | undefined, from?: CardMotion) => void;
  onHandLean: (side: Side | undefined) => void;
  nudged: number;
  locked: boolean;
  exit: Leave;
  touch: boolean;
  rarity: string;
  arriveAfter: number;
}) {
  const reduced = useReducedMotion();
  // A card that's leaving keeps its last props for its exit. It must not answer again: no clicks, no drag.
  const present = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  // A card answered in chat is answered by the same gestures: toward your answer confirms it (B-hswmx).
  const live = (p.card.mode.kind === "live" || p.card.mode.kind === "seen") && present;
  const el = useRef<HTMLElement>(null);
  // On a touch screen, a finger holds the card until it lifts; a mouse there drags it as on a desktop.
  const controls = useDragControls();
  const lift = useLift({ el, x, y, scale, touch: p.touch, dirs: live ? ALL_WAYS : NO_WAYS, onReach: p.card.onReach, reduced: !!reduced, onMouse: (e) => live && controls.start(e) });
  const { pl, pr } = useSideLight(x, y, lift.lifted);
  // The card tilts as it moves (round 5): about a degree at a full lean, and more as it leaves; lifted, less.
  const rotate = useTransform([x, lift.lifted], ([v = 0, l = 0]: number[]) => v * (l ? LIFT_TILT : 0.06));
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
  // A drag or a swipe that leans the card lights the path as a held arrow does, from the card's own motion. A lifted
  // card lights it by the answer it's dragged toward, so a drag up or down lights neither side.
  const presentNow = useRef(present);
  presentNow.current = present;
  const liftedNow = useRef(false);
  liftedNow.current = !!lift.lift;
  const leanSent = useRef<Side>(undefined);
  const report = useCallback(
    (next: Side | undefined) => {
      if (leanSent.current === next) return;
      leanSent.current = next;
      onHandLean(next);
    },
    [onHandLean],
  );
  useEffect(() => {
    const off = x.on("change", (v) => {
      if (!liftedNow.current) report(!presentNow.current ? undefined : v <= -LEAN_LIGHT ? "left" : v >= LEAN_LIGHT ? "right" : undefined);
    });
    return () => {
      off();
      report(undefined);
    };
  }, [x, report]);
  const isLifted = !!lift.lift;
  const liftedDir = lift.lift?.dir;
  useEffect(() => {
    if (isLifted) report(liftedDir === "left" || liftedDir === "right" ? liftedDir : undefined);
  }, [isLifted, liftedDir, report]);

  useEffect(() => {
    // While you still have to read (D91), the card resists: it leans a third as far, as round 5's did.
    const to = live && p.lean ? (p.lean === "left" ? -1 : 1) * (p.locked ? 0.25 : 0.7) * LEAN_X : 0;
    const a = animate(x, to, reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 });
    return () => a.stop();
  }, [p.lean, p.locked, live, reduced, x]);

  // A two-finger swipe moves the card as a drag would, and chooses when it stops (round 5). Not React's onWheel,
  // which can't prevent scrolling. A vertical swipe scrolls the desk instead, if the desk has somewhere to scroll.
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

  // Lifted, the answer the card has reached is filled in on it too, as a drag's is.
  const filled = lift.lift ? (lift.lift.armed ? lift.lift.dir : undefined) : armed;
  const m = p.card.card.meta;
  // While you still have to read (D91), letting go on an option only shakes the card, as a swipe did: its label says why.
  const side = (s: Side): LiftLabel => (p.locked ? { ...choiceLabel(m[p.card.sides[s]], s), hint: "Read it first", letGo: "Read it first" } : choiceLabel(m[p.card.sides[s]], s));
  const labels: LiftLabels = { left: side("left"), right: side("right"), up: answerLabel("Other answer"), down: answerLabel("Can't judge") };

  return (
    <motion.article
      ref={el}
      tabIndex={-1}
      className={`card rarity-${p.rarity}`}
      data-mode={p.card.mode.kind}
      data-locked={p.locked || undefined}
      data-leaving={present ? undefined : true}
      data-lift={lift.attr}
      inert={!present}
      aria-label={p.card.card.meta.question}
      style={{ x, y, scale, rotate, "--pl": pl, "--pr": pr, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24, delay: reduced ? 0 : arriveAfter / 1000 } }}
      exit={out(p.exit)}
      drag={live}
      // On a touch screen, the drag starts only from a mouse (useLift's onMouse): a finger scrolls, or holds.
      dragListener={!p.touch}
      dragControls={controls}
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
      {...lift.handlers}
    >
      <div className="frame" aria-hidden="true" />
      <Card {...p.card} {...(filled && live ? { armed: filled } : {})} />
      {lift.lift && <LiftSignals labels={labels} lift={lift.lift} progress={lift.progress} />}
    </motion.article>
  );
}

/** The briefing card's way on, named at both sides of the screen while it's lifted (B-yfehp). */
const ON_TO_CARDS = { name: "Go to its cards", tone: "ink", hint: "Go on", letGo: "Let go to go on" } as const;
const BRIEFING_LABELS: LiftLabels = { left: ON_TO_CARDS, right: ON_TO_CARDS };

/**
 * A deck's briefing, before the first of its cards you reach (B-j6b75): its briefing and context notes, then on to
 * the card with any arrow, Enter, a drag sideways or a two-finger swipe. A vertical swipe scrolls a long briefing. On a
 * touch screen, a drag scrolls it, and holding it until it lifts, then dragging it sideways, goes on (B-yfehp).
 */
function BriefingCard(p: { deck: ApiState["decks"][number]; waiting: number; touch: boolean; titleOf: (id: string) => string | undefined; onOpen: (id: string) => void; onDone: () => void }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const el = useRef<HTMLElement>(null);
  const controls = useDragControls();
  const lift = useLift({ el, x, y, scale, touch: p.touch, dirs: present ? SIDEWAYS : NO_WAYS, onReach: () => p.onDone(), reduced: !!reduced, onMouse: (e) => present && controls.start(e) });
  const rotate = useTransform([x, lift.lifted], ([v = 0, l = 0]: number[]) => v * (l ? LIFT_TILT : 0.06));
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
      data-lift={lift.attr}
      inert={!present}
      aria-label={`The briefing for ${p.deck.meta.title}`}
      style={{ x, y, scale, rotate, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24 } }}
      exit={{ opacity: 0, y: -16, transition: { duration: reduced ? 0 : 0.2, ease: "easeIn" } }}
      drag={present ? "x" : false}
      dragListener={!p.touch}
      dragControls={controls}
      dragSnapToOrigin
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_e, info) => {
        const far = Math.abs(info.offset.x) >= THRESH_X;
        if (far || (Math.abs(info.velocity.x) > 900 && Math.abs(info.offset.x) > THRESH_X * 0.3)) p.onDone();
      }}
      {...lift.handlers}
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
      {lift.lift && <LiftSignals labels={BRIEFING_LABELS} lift={lift.lift} progress={lift.progress} />}
    </motion.article>
  );
}

/**
 * In the blind test (B-xx49m, B-9prve): once you've answered a card, a card of its own asks your guess about it, whether it
 * was rebuilt from a past one, before the next card comes. No, Maybe or Sure, by a click, a tap or keys 1 to 3; it can't be
 * skipped, but Z takes the answer back. The answer is already on its way; the guess is kept as you give it.
 */
function MarkCard(p: { name: string; touch: boolean; saving: boolean; problem: string | undefined; onMark: (mark: PracticeMark) => void }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.article
      tabIndex={-1}
      className="card mark-card"
      data-leaving={present ? undefined : true}
      inert={!present}
      aria-label="Blind test: was that card rebuilt from a past one?"
      style={{ pointerEvents: present ? undefined : "none" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24 } }}
      exit={{ opacity: 0, y: -16, transition: { duration: reduced ? 0 : 0.2, ease: "easeIn" } }}
    >
      <div className="frame" aria-hidden="true" />
      <div className="face">
        <p className="doing">
          <b>Blind test</b>: your answer is on its way.
        </p>
        <h1>Was that card rebuilt from a past one?</h1>
        <p className="mark-which">“{p.name}”, the card you just answered.</p>
        <div className="mark-ways" role="group" aria-label="Your guess">
          {MARKS.map((m) => (
            <button type="button" key={m.mark} className="mark-way" disabled={p.saving} onClick={() => p.onMark(m.mark)}>
              {m.label}
              {!p.touch && <kbd>{m.key}</kbd>}
            </button>
          ))}
        </div>
        {p.problem && (
          <p className="problem" role="alert">
            {p.problem}
          </p>
        )}
        <p className="small">A rebuilt card shows the option its agent didn't pick as the pick. You'll see which were when the test ends, once ten rebuilt cards have come.</p>
      </div>
    </motion.article>
  );
}

/**
 * A card of the setup survey (B-5na1k), with the card's own gestures: an example decision is answered by dragging or a
 * two-finger swipe, sideways for its two answers or down for "not sure", as well as by the arrows and by clicking; on a
 * touch screen, by holding it until it lifts, then dragging it (B-yfehp). The offer and the suggestion are read and
 * clicked.
 */
function SetupCard(p: { label: string; exit: Leave; touch: boolean; labels?: LiftLabels; onSwipe?: (dir: Side | "down") => void; children: (armed: Dir | undefined) => ReactNode }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const [armed, setArmed] = useState<Dir>();
  const el = useRef<HTMLElement>(null);
  const swipe = useRef(p.onSwipe);
  swipe.current = present ? p.onSwipe : undefined;
  const answer = (dir: Dir) => dir !== "up" && swipe.current?.(dir);
  const draggable = present && !!p.onSwipe;
  const controls = useDragControls();
  const lift = useLift({ el, x, y, scale, touch: p.touch, dirs: draggable ? SURVEY_WAYS : NO_WAYS, onReach: answer, reduced: !!reduced, onMouse: (e) => draggable && controls.start(e) });
  const { pl, pr } = useSideLight(x, y, lift.lifted);
  const rotate = useTransform([x, lift.lifted], ([v = 0, l = 0]: number[]) => v * (l ? LIFT_TILT : 0.06));
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
  const filled = lift.lift ? (lift.lift.armed ? lift.lift.dir : undefined) : armed;
  return (
    <motion.article
      ref={el}
      tabIndex={-1}
      className="card setup-card"
      data-leaving={present ? undefined : true}
      data-lift={lift.attr}
      inert={!present}
      aria-label={p.label}
      style={{ x, y, scale, rotate, "--pl": pl, "--pr": pr, pointerEvents: present ? undefined : "none" } as MotionStyle}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.24 } }}
      exit={out(p.exit)}
      drag={draggable}
      dragListener={!p.touch}
      dragControls={controls}
      dragSnapToOrigin
      dragElastic={DRAG_ELASTIC}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDrag={(_e, info) => {
        const g = gesture(info.offset.x, info.offset.y);
        setArmed(g.progress >= 1 && g.dir !== "up" ? g.dir : undefined);
      }}
      onDragEnd={(_e, info) => {
        setArmed(undefined);
        const { dir, progress } = gesture(info.offset.x, info.offset.y);
        const speed = dir === "left" || dir === "right" ? Math.abs(info.velocity.x) : Math.abs(info.velocity.y);
        if (progress >= 1 || (speed > 900 && progress > 0.3)) answer(dir);
      }}
      {...lift.handlers}
    >
      <div className="frame" aria-hidden="true" />
      {p.children(filled)}
      {lift.lift && p.labels && <LiftSignals labels={p.labels} lift={lift.lift} progress={lift.progress} />}
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
