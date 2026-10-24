// Round 4: the card in the middle, what it builds on to its left, what your answer changes to its right,
// the rest of its area as a pile underneath, the queue below grouped by area, and the project map on M or
// Space. Rebuilt from three independent reviews (reviews/) and the owner's idea of a pile you move through.

import { animate } from "https://cdn.jsdelivr.net/npm/motion@14.6.0/+esm";
import * as map from "./map.js";
import { mark } from "./marks.js";
import { AREAS, CALIBRATION_BASELINE, CARDS, DECISIONS, RARITY, STATE_WORDS, WORKS, areaOf, byDecision, dependentsOf, rarityOf, workOf } from "./data.js";

// The self-test drives the page with synthetic events; it runs without animation.
const SELFTEST = location.hash === "#selftest";
const reduced = SELFTEST || matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const RAR = new Map(CARDS.map((c) => [c.decision, rarityOf(c)]));
const RANK = { mythic: 4, rare: 3, uncommon: 2, common: 1 };
const DWELL = { common: 0, uncommon: 2000, rare: 3000, mythic: 3000 };
const UNDO_MS = 5000, HOLD_MS = 900, THRESH_X = 150, THRESH_Y = 110;
const ARROW = { left: "←", right: "→", up: "↑", down: "↓" };
const NUMBER = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
const OTHER = { proposal: "alternative", alternative: "proposal" };

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const listJoin = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------ state
const answered = new Map(); // decision id -> { verdict, side, rarity, dwell, practice, caught, text, reason, sent }
let practiceOn = false, practiceArrived = false;
const arrived = new Set(); // late cards that have arrived
let current = null; // the card on screen
let mode = "live"; // live | reveal | write | pass | review | practice
let shownAt = 0;
let sides = { left: "alternative", right: "proposal" };
let reveal = null; // { d, kind } while the reveal is showing

const cardFor = (id) => CARDS.find((c) => c.decision === id);
const rarityName = (c) => RAR.get(c.decision).rarity;
const humanFirst = (c) => RAR.get(c.decision).tier === "high"; // rare and mythic
const needsHold = (c) => rarityName(c) === "mythic"; // hard cards are held to confirm (D67)
const areaIdOf = (id) => areaOf(byDecision(id)).id;

/** The queue: grouped by area, so you finish one part of the project before moving on; blocking and rarer first. */
function queue() {
  const cards = CARDS.filter(onTable);
  const prio = (c) => (c.blocking ? 10 : 0) + RANK[rarityName(c)];
  const best = new Map();
  for (const c of cards) best.set(areaIdOf(c.decision), Math.max(best.get(areaIdOf(c.decision)) ?? 0, prio(c)));
  const areaIndex = (a) => AREAS.findIndex((x) => x.id === a);
  return cards.sort((x, y) => {
    const ax = areaIdOf(x.decision), ay = areaIdOf(y.decision);
    if (ax !== ay) return best.get(ay) - best.get(ax) || areaIndex(ax) - areaIndex(ay);
    return prio(y) - prio(x);
  }).map((c) => c.decision);
}
/** What's left, in the order you'll meet it: cards with an agent stopped first, then the rest by area. */
const pending = () => {
  const q = queue().filter((id) => !answered.has(id));
  return [...q.filter((id) => cardFor(id).blocking), ...q.filter((id) => !cardFor(id).blocking)];
};
/** Whether a card has reached you yet: practice cards and late cards arrive while you're answering. */
function onTable(c) {
  if (c.practice) return practiceOn && practiceArrived;
  return c.arrives == null || arrived.has(c.decision);
}
const realAnswers = () => [...answered.values()].filter((a) => !a.practice).length;
/** After each answer: the cards whose time has come arrive, and a practice card arrives among them. */
function arrivals() {
  const fresh = CARDS.filter((c) => c.arrives != null && !arrived.has(c.decision) && realAnswers() >= c.arrives);
  fresh.forEach((c) => arrived.add(c.decision));
  const moreToCome = CARDS.some((c) => c.arrives != null && !arrived.has(c.decision));
  if (practiceOn && !practiceArrived && (fresh.length || !moreToCome)) { practiceArrived = true; fresh.push(CARDS.find((c) => c.practice)); }
  if (!fresh.length) return "";
  const areas = [...new Set(fresh.map((c) => areaOf(byDecision(c.decision)).name))];
  return ` ${fresh.length === 1 ? "A new card" : `${NUMBER[fresh.length] ?? fresh.length} new cards`} arrived in ${listJoin(areas)}.`;
}

function hash(t) { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

/** Human-first cards put the options on sides that vary from card to card, so position can't hint at the agent's pick. */
const HF = CARDS.filter(humanFirst).map((c) => c.decision);
function sidesFor(c) {
  if (!humanFirst(c)) return { left: "alternative", right: "proposal" };
  return HF.indexOf(c.decision) % 2 === 0 ? { left: "proposal", right: "alternative" } : { left: "alternative", right: "proposal" };
}

// ------------------------------------------------------------------ the card
const crumbs = (c) => {
  const d = byDecision(c.decision);
  return `<span class="lvl">project</span>baesian<span class="sep">›</span><span class="lvl">area</span>${areaOf(d).name}<span class="sep">›</span><span class="lvl">work</span><b>${workOf(d).title}</b>`;
};

function optionHtml(c, kind, side) {
  const o = c[kind];
  const showTags = !humanFirst(c) || mode === "reveal" || mode === "review" || mode === "practice";
  const tag = !showTags ? "" : kind === "proposal"
    ? `<p class="tag proposed">${c.kind === "audit" ? `What ${c.agent} did` : `Proposed by ${c.agent}`}</p>`
    : `<p class="tag">The alternative</p>`;
  const a = answered.get(c.decision);
  const picked = mode === "reveal" ? reveal.kind : (mode === "review" || mode === "practice") ? a?.verdict : null;
  const cls = picked ? (picked === kind ? " chosen" : " unchosen") : "";
  const pick = side === "left" ? `<kbd>←</kbd> Choose this` : `Choose this <kbd>→</kbd>`;
  return `<section class="opt${cls}" data-side="${side}" data-kind="${kind}">
      ${tag}
      <h2>${o.name}</h2>
      <p class="if"><span class="lbl">Better if</span> ${o.betterIf}.</p>
      <p class="then"><span class="lbl">Then</span> ${o.then}.</p>
      <button class="pick" data-dir="${side}" ${mode === "live" ? "" : "hidden"}>${pick}</button>
    </section>`;
}

const caseHtml = (c) =>
  `<p class="case"><span class="lbl">${c.agent}'s case</span> <q>${c.case.rationale}</q> It's wrong if ${c.case.wrongIf} <span class="soft">(check: ${c.case.check})</span>.</p>`;

const cueHtml = (c) =>
  `<div class="cue"><p class="lbl">The one thing most likely to change your answer</p>
     <p class="txt">${c.cue.text}${c.cue.ask ? ` <b>${c.cue.ask}</b>` : ""}</p>
     <p class="why">Why this one: ${c.cue.why}.</p></div>`;

const answerHtml = () => `<div class="answer${realAnswers() >= 2 ? " seasoned" : ""}">
    <div class="rule" id="rule"></div>
    <div class="row">
      <button class="alt-btn" data-dir="up"><kbd>↑</kbd> Write an answer</button>
      <button class="alt-btn" data-dir="down"><kbd>↓</kbd> I can't judge this</button>
      <span class="how">You can also drag the card, or swipe with two fingers.</span>
    </div>
  </div>`;

function revealHtml(c) {
  const { d, kind } = reveal, same = kind === "proposal";
  const confirm = needsHold(c)
    ? `<button class="hold" id="hold"><span class="fill" id="hold-fill"></span><span>Hold <kbd>${ARROW[d]}</kbd>, or press and hold here, to confirm</span></button>`
    : `<button class="confirm" id="confirm">Confirm “${c[kind].name}” <kbd>${ARROW[d]}</kbd></button>`;
  return `<div class="reveal" style="--c: var(--${d})">
      <p class="verdict">You chose <b>“${c[kind].name}”</b>. ${c.agent} proposed ${same ? "the same, so you agree." : `<b>“${c.proposal.name}”</b>, so your answer overrides it.`}</p>
      ${caseHtml(c)}
      ${confirm}
      <p class="soft" style="font: 500 12.5px/1.3 var(--ui)">${needsHold(c) ? "" : `Press ${ARROW[d]} again to confirm. `}Esc goes back to the choice.</p>
    </div>`;
}

const REASONS = { write: ["Ask a question", "Suggest a correction", "Reject, with a reason"], pass: ["I need more context", "It's outside my expertise", "I need to see it run"] };
function writeHtml(c) {
  const up = mode === "write";
  return `<div class="write" style="--c: ${up ? "var(--ink)" : "var(--pass)"}">
      <h3>${up ? `Write an answer to ${c.agent}` : "Why can't you judge it?"}</h3>
      <div class="opts" id="opts">${REASONS[mode].map((t) => `<button aria-pressed="false">${t}</button>`).join("")}</div>
      <textarea id="txt" aria-label="${up ? "Your answer" : "What would help"}" placeholder="${up ? `Goes back to ${c.agent} with this card.` : "Optional: what would help you judge it?"}"></textarea>
      <div class="row"><button class="send" id="send">Send to ${c.agent}</button><span class="soft keyhint"><kbd>⌘</kbd> <kbd>Enter</kbd> sends</span><button class="cancel" id="cancel">Cancel <kbd>Esc</kbd></button></div>
    </div>`;
}

function describe(c, a) {
  if (a.verdict === "proposal" || a.verdict === "alternative") return `You chose “${c[a.verdict].name}”.`;
  if (a.verdict === "answer") return `You wrote${a.reason ? ` (${a.reason.toLowerCase()})` : ""}: “${a.text || "no text"}”.`;
  return `You said you can't judge it${a.reason ? `: ${a.reason.toLowerCase()}` : ""}.`;
}

function reviewHtml(c) {
  const a = answered.get(c.decision);
  return `<div class="result" style="--c: var(--${a.side ?? "ink"})">
      <h3>${a.sent ? `You answered this, and it was sent to ${c.agent}.` : `You answered this. It goes to ${c.agent} in a few seconds.`}</h3>
      <p>${describe(c, a)}</p>
      <div class="row"><button class="send" id="change">Change your answer</button><button class="cancel" id="back">Back to the next card <kbd>Esc</kbd></button></div>
    </div>`;
}

function practiceHtml(c) {
  const a = answered.get(c.decision);
  const result = a.caught === true ? "You caught it."
    : a.caught === false ? "You accepted it. That's exactly what these cards look for: a fluent proposal for an option you'd already rejected."
    : "You didn't choose either option, which counts as neither a catch nor a miss.";
  return `<div class="result practice"><h3>That was a practice card</h3><p>${c.reveal}</p><p><b>${result}</b></p>
      <div class="row"><button class="send" id="practice-ok">Continue</button></div></div>`;
}

function renderCard() {
  const c = current, card = $("card");
  const R = RAR.get(c.decision), r = RARITY[R.rarity];
  if (mode === "live") sides = sidesFor(c);
  const compact = mode === "write" || mode === "pass";
  card.className = `card rarity-${R.rarity}${compact ? " compact" : ""}`;
  card.style.transform = "";
  card.style.setProperty("--pl", 0);
  card.style.setProperty("--pr", 0);
  card.setAttribute("aria-label", c.question);
  const footer = { live: answerHtml, reveal: revealHtml, write: writeHtml, pass: writeHtml, review: reviewHtml, practice: practiceHtml }[mode](c);
  const trigger = c.voice === "baesian"
    ? `<p class="trigger system">${c.trigger}</p>`
    : `<p class="trigger"><span class="who">${c.agent}</span>“${c.trigger}”</p>`;
  const hfDone = [...answered.keys()].filter((id) => humanFirst(cardFor(id))).length;
  const note = humanFirst(c) && mode === "live"
    ? `<p class="hidden-note">${hfDone ? `${c.agent}'s pick stays hidden until you choose.` : `On rare and mythic cards you choose first. Which option ${c.agent} proposed, and why, stays hidden until you do, so it can't anchor your answer.`}</p>` : "";
  card.innerHTML = `
    <div class="frame" aria-hidden="true"></div>
    <div class="face">
      <header class="rhead rarity-${R.rarity}"><span class="rmark" aria-hidden="true">${r.mark}</span><p><b>${r.name}</b>, ${r.rank}, because ${listJoin(R.why)}.</p>${c.blocking && mode !== "review" ? `<span class="waiting">Waiting for you</span>` : ""}</header>
      ${trigger}
      <h1>${c.question}</h1>
      <div class="options">${optionHtml(c, sides.left, "left")}${optionHtml(c, sides.right, "right")}</div>
      ${!humanFirst(c) && mode !== "reveal" ? caseHtml(c) : note}
      ${mode === "reveal" || compact ? "" : cueHtml(c)}
      ${footer}
    </div>`;
  ruleKey = "";
  $("crumbs").innerHTML = crumbs(c);
  wireCard();
}

// ------------------------------------------------------------------ the two context panels
function markOf(d) {
  const c = cardFor(d.id);
  return mark(c ? rarityName(c) : d.state === "practice" ? "uncommon" : d.state);
}
const where = (d) => `in the work “${workOf(d).title}”`;

function renderUp(c) {
  const d = byDecision(c.decision), seen = new Set(), items = [];
  const item = (x, kind, cls = "") => {
    seen.add(x.id);
    const note = c.precedent?.ref === x.id ? ` ${c.precedent.text}` : "";
    return `<li>${markOf(x)}<div><p class="name">${x.short}</p><p class="meta"><span class="kind ${cls}">${kind}</span>${cap(STATE_WORDS[x.state])}, from “${workOf(x).title}”.${note}</p></div></li>`;
  };
  for (const id of d.conflicts ?? []) items.push(item(byDecision(id), c.kind === "conflict" ? "disagrees" : "may conflict", "conflicts"));
  for (const id of d.needs ?? []) items.push(item(byDecision(id), "builds on"));
  if (c.precedent?.ref && !seen.has(c.precedent.ref)) items.push(item(byDecision(c.precedent.ref), "your precedent"));
  const past = c.precedent && !c.precedent.ref ? `<div><h3>Your past verdicts</h3><p class="none">${c.precedent.text}</p></div>` : "";
  $("up").innerHTML = `<div><h3>What this builds on</h3><p class="sub">Earlier decisions it depends on or runs into</p>
      ${items.length ? `<ul>${items.join("")}</ul>` : `<p class="none">Nothing earlier. It's the first decision in its work.</p>`}</div>${past}`;
}

/**
 * What each answer does downstream, limited to what Baesian can stand behind (Client Data Contract, D71): the
 * agent's declared state, what the store does to conflicting decisions, and what the agent says happens outside
 * the repo. Commits are left out, because the ledger only knows commits that cite the card. Dependents are listed
 * without a fate, because choosing the alternative doesn't change them yet.
 */
function downItems(c) {
  const d = byDecision(c.decision), items = [], a = answered.get(c.decision);
  const f = (text, cost = false) => ({ text, cost });
  const meta = mode === "review" ? (a?.sent ? "has your answer" : "gets your answer in a few seconds")
    : c.blocking ? "stopped until you answer" : "carrying on with the proposal meanwhile";
  items.push({ g: mark("actor"), name: c.agent, meta, fate: c.blocking ? { proposal: f("resumes"), alternative: f("resumes") } : { proposal: f("carries on"), alternative: f("switches to it", true) } });
  if (c.kind === "conflict") {
    for (const kind of ["proposal", "alternative"]) {
      const x = byDecision(c[kind].keeps);
      items.push({ g: markOf(x), name: x.short, meta: `settled, in “${workOf(x).title}”`, fate: { [kind]: f("stays settled"), [OTHER[kind]]: f("superseded", true) } });
    }
  }
  for (const x of dependentsOf(d.id)) items.push({ g: markOf(x), name: x.short, meta: `${cap(STATE_WORDS[x.state])}, and built on this decision` });
  for (const o of c.outside ?? []) items.push({ g: mark("outside"), name: o.name, meta: `outside the repo, according to ${c.agent}`, fate: o.fate });
  return items;
}

const DOWN_SUB = "Each item shows what ← and → would do to it.";
function renderDown(c) {
  const items = downItems(c);
  const fates = (it) => !it.fate ? "" : it.fate.proposal.text === it.fate.alternative.text
    ? `<span class="fate">${it.fate.proposal.text} either way</span>`
    : ["left", "right"].map((side) => { const x = it.fate[sides[side]]; return `<span class="fate${x.cost ? " cost" : ""}" data-side="${side}">${ARROW[side]} ${x.text}</span>`; }).join("");
  $("down").innerHTML = `<div><h3 id="down-h">What your answer changes</h3><p class="sub" id="down-sub">${DOWN_SUB}</p>
      <ul>${items.map((it) => `<li>${it.g}<div><p class="name">${it.name}</p><p class="meta">${it.meta}</p>${it.fate ? `<p class="fates">${fates(it)}</p>` : ""}</div></li>`).join("")}</ul>
      ${items.length > 1 ? "" : `<p class="none" style="margin-top:10px">No other decision depends on it yet.</p>`}</div>`;
}

/**
 * The consequence preview: leaning toward a side picks out its fates on the right. `how` says what you're
 * doing, so the hint underneath can say what happens next.
 */
function preview(side, p = 0, how = "drag") {
  const down = $("down"), h = $("down-h"), sub = $("down-sub");
  if (!h) return;
  if (!side || p < 0.12 || !current) {
    delete down.dataset.lean;
    h.textContent = "What your answer changes"; sub.textContent = DOWN_SUB;
    return;
  }
  down.dataset.lean = side;
  const kind = sides[side];
  h.textContent = how === "chosen" ? `You chose “${current[kind].name}”` : `If you choose “${current[kind].name}”`;
  sub.textContent = {
    drag: p >= 1 ? "Let go to choose it." : "Lean further to choose it, or let go to go back.",
    key: "Let go of the key to choose it, or press Esc.",
    hover: "Click “Choose this” to choose it.",
    chosen: "This is what your answer changes.",
  }[how];
}

// ------------------------------------------------------------------ the answer bar's rule, by rarity
let ruleKey = "";
const waitLeft = () => (current ? Math.max(0, DWELL[rarityName(current)] - (performance.now() - shownAt)) : 0);
const unlocked = () => Boolean(current) && waitLeft() === 0;
function tick() {
  const el = $("rule");
  if (current && mode === "live" && el) {
    const r = rarityName(current), name = RARITY[r].name, left = waitLeft();
    let key, html;
    if (r === "common") {
      key = "c"; html = `<span><b>${name}:</b> answer straight away. You can undo for 5 seconds.</span>`;
    } else if (r === "uncommon") {
      key = left > 0 ? "u-wait" : "u-ok";
      html = left > 0 ? `<span><b>${name}:</b> read it for 2 seconds, then answer.</span><span class="meter"><i id="meter"></i></span>` : `<span><b>${name}:</b> ready. You can undo for 5 seconds.</span>`;
    } else {
      const last = needsHold(current) ? "Hold to confirm" : "Confirm";
      key = left > 0 ? "h-wait" : "h-ok";
      html = `<span><b>${name}:</b></span><ol class="steps"><li class="${left > 0 ? "now" : "done"}">Read it${left > 0 ? ` <span class="t" id="secs"></span>` : ""}</li><li class="${left > 0 ? "" : "now"}">Choose</li><li>${last}</li></ol>`;
    }
    if (key !== ruleKey) { el.innerHTML = html; ruleKey = key; }
    const m = $("meter"); if (m) m.style.width = `${(1 - left / DWELL[r]) * 100}%`;
    const secs = $("secs"); if (secs) secs.textContent = `${(left / 1000).toFixed(1)} s`;
    $("card").toggleAttribute("data-locked", left > 0);
  }
  requestAnimationFrame(tick);
}
function refuse() {
  const el = $("rule");
  if (el) { el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge"); }
  $("card").querySelector(".steps li.now, .rule .meter")?.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 360 });
}

// ------------------------------------------------------------------ gestures: drag, two-finger swipe, keys
const s = { x: 0, y: 0, dragging: false, samples: [], anims: [], locked: false, wheelIdle: 0, wheelCooldown: 0, how: "drag" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const band = (v, max) => Math.sign(v) * max * (1 - Math.exp(-Math.abs(v) / max)); // the card resists, and stays in its column
const dirOf = (x, y) => (Math.abs(x) < 8 && Math.abs(y) < 8 ? null : Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : y < 0 ? "up" : "down");
const progressOf = (x, y) => Math.min(1.25, Math.max(Math.abs(x) / THRESH_X, Math.abs(y) / THRESH_Y));

let hoverSide = null;
function render() {
  const card = $("card");
  if (!current) return;
  if (mode !== "live") { card.style.transform = ""; return; }
  const open = unlocked(), dx = band(s.x, open ? 18 : 6), dy = band(s.y, open ? 14 : 5);
  card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
  card.style.setProperty("--px", String(0.5 + clamp(s.x / 300, -0.5, 0.5)));
  const d = dirOf(s.x, s.y), p = progressOf(s.x, s.y);
  card.style.setProperty("--pl", String(d === "left" ? Math.min(1, p) : hoverSide === "left" ? 0.6 : 0));
  card.style.setProperty("--pr", String(d === "right" ? Math.min(1, p) : hoverSide === "right" ? 0.6 : 0));
  card.querySelectorAll(".opt").forEach((o) => o.classList.toggle("armed", o.dataset.side === d && p >= 1));
  card.querySelectorAll(".alt-btn").forEach((b) => b.classList.toggle("armed", b.dataset.dir === d && p >= 1));
  if (d === "left" || d === "right") preview(d, p, s.how);
  else if (hoverSide) preview(hoverSide, 0.7, "hover");
  else preview(null);
  if (!open && (d === "left" || d === "right" || hoverSide)) $("down-sub").textContent = `Answers open in ${(waitLeft() / 1000).toFixed(1)} s.`;
}

function stopAnims() { s.anims.forEach((a) => a.stop()); s.anims = []; }
function springTo(x, y, vx = 0, vy = 0) {
  stopAnims();
  if (reduced) { s.x = x; s.y = y; render(); return Promise.resolve(); }
  const ax = animate(s.x, x, { type: "spring", stiffness: 520, damping: 34, velocity: vx, onUpdate: (v) => { s.x = v; render(); } });
  const ay = animate(s.y, y, { type: "spring", stiffness: 520, damping: 34, velocity: vy, onUpdate: (v) => { s.y = v; render(); } });
  s.anims = [ax, ay];
  return Promise.all([ax.finished, ay.finished]);
}
const settle = (vx, vy) => springTo(0, 0, vx, vy);
function sample() { s.samples.push({ x: s.x, y: s.y, t: performance.now() }); if (s.samples.length > 12) s.samples.shift(); }
function velocity() {
  const now = performance.now(), r = s.samples.filter((q) => now - q.t < 90);
  if (r.length < 2) return { vx: 0, vy: 0 };
  const a = r[0], b = r.at(-1), dt = Math.max(1, b.t - a.t);
  return { vx: ((b.x - a.x) / dt) * 1000, vy: ((b.y - a.y) / dt) * 1000 };
}
function release() {
  const { vx, vy } = velocity();
  const d = dirOf(s.x, s.y), p = progressOf(s.x, s.y);
  const flick = d && Math.abs(d === "left" || d === "right" ? vx : vy) > 900 && p > 0.3;
  s.dragging = false;
  if (d && (p >= 1 || flick)) return reach(d, vx, vy);
  settle(vx, vy);
}

function reach(d, vx = 0, vy = 0) {
  if (!current || s.locked || mode !== "live") return;
  if (d === "up" || d === "down") { settle(); return openWrite(d); }
  if (!unlocked()) { refuse(); return settle(vx, vy); }
  const kind = sides[d];
  if (humanFirst(current)) { settle(); return openReveal(d, kind); }
  return commit(kind, d);
}

function wireCard() {
  const card = $("card");
  card.onpointermove = (e) => {
    if (s.dragging || reduced) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--px", String((e.clientX - r.left) / r.width));
    card.style.setProperty("--py", String((e.clientY - r.top) / r.height));
  };
  card.onpointerdown = (e) => {
    if (mode !== "live" || s.locked || e.button !== 0 || e.target.closest("button, textarea")) return;
    stopAnims();
    card.setPointerCapture(e.pointerId);
    s.dragging = true; s.samples = []; s.how = "drag";
    const ox = e.clientX - s.x, oy = e.clientY - s.y;
    const move = (ev) => { s.x = ev.clientX - ox; s.y = ev.clientY - oy; sample(); render(); };
    const up = () => { card.removeEventListener("pointermove", move); card.removeEventListener("pointerup", up); card.removeEventListener("pointercancel", up); release(); };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
    card.addEventListener("pointercancel", up);
  };
  // Pointing at "Choose this" previews that answer, as leaning does.
  card.querySelectorAll(".pick").forEach((b) => {
    b.addEventListener("pointerenter", () => { hoverSide = b.dataset.dir; render(); });
    b.addEventListener("pointerleave", () => { hoverSide = null; render(); });
    b.addEventListener("click", () => { hoverSide = null; reach(b.dataset.dir); });
  });
  card.querySelectorAll(".alt-btn").forEach((b) => b.addEventListener("click", () => reach(b.dataset.dir)));
  if (mode === "reveal") {
    const hold = $("hold");
    if (hold) {
      hold.addEventListener("pointerdown", (e) => { e.preventDefault(); beginHold(); });
      hold.addEventListener("pointerup", stopHold);
      hold.addEventListener("pointerleave", stopHold);
    }
    $("confirm")?.addEventListener("click", () => commit(reveal.kind, reveal.d));
  }
  if (mode === "write" || mode === "pass") {
    let reason = "";
    card.querySelectorAll("#opts button").forEach((b) => b.addEventListener("click", () => {
      card.querySelectorAll("#opts button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); reason = b.textContent; $("txt").focus();
      // "Outside my expertise" goes back to the agent, which asks someone else to review it.
      $("send").textContent = reason === "It's outside my expertise" ? `Ask ${current.agent} to find another reviewer` : `Send to ${current.agent}`;
    }));
    $("send").addEventListener("click", () => commit(mode === "write" ? "answer" : "pass", mode === "write" ? "up" : "down", { text: $("txt").value.trim(), reason }));
    $("cancel").addEventListener("click", () => backToLive());
    $("txt").focus();
  }
  if (mode === "review") {
    $("change").addEventListener("click", () => { const id = current.decision; answered.delete(id); next(id); });
    $("back").addEventListener("click", () => next());
  }
  if (mode === "practice") $("practice-ok").addEventListener("click", () => next());
}

$("stage").addEventListener("wheel", (e) => {
  if (e.ctrlKey) return;
  e.preventDefault();
  if (mode !== "live" || s.locked || performance.now() < s.wheelCooldown || !current) return;
  if (!s.dragging) { stopAnims(); s.dragging = true; s.samples = []; s.how = "drag"; }
  s.x -= e.deltaX; s.y -= e.deltaY;
  sample(); render();
  clearTimeout(s.wheelIdle);
  s.wheelIdle = setTimeout(() => { s.wheelCooldown = performance.now() + 650; release(); }, 110);
}, { passive: false });

// ------------------------------------------------------------------ reveal, then confirm (human-first); mythic is held (D67)
let holdStart = 0, holdRaf = 0, keyHeld = null;
function openReveal(d, kind) { reveal = { d, kind }; mode = "reveal"; renderCard(); preview(d, 1, "chosen"); }
function beginHold() {
  if (mode !== "reveal" || holdStart || !$("hold")) return;
  holdStart = performance.now();
  const step = () => {
    if (!holdStart) return;
    const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
    $("hold-fill").style.width = `${p * 100}%`;
    if (p >= 1) { holdStart = 0; keyHeld = null; commit(reveal.kind, reveal.d); return; }
    holdRaf = requestAnimationFrame(step);
  };
  holdRaf = requestAnimationFrame(step);
}
function stopHold() {
  if (!holdStart) return;
  cancelAnimationFrame(holdRaf); holdStart = 0;
  const fill = $("hold-fill"); if (fill) fill.style.width = "0";
  toast("Keep holding until the bar fills.", { ms: 1800 });
}
function backToLive() { reveal = null; mode = "live"; renderCard(); preview(null); render(); }

// ------------------------------------------------------------------ writing an answer, or "I can't judge this"
function openWrite(d) { mode = d === "up" ? "write" : "pass"; renderCard(); preview(null); }

// ------------------------------------------------------------------ committing an answer, with undo
let sendTimer = 0, lastSent = null;
function finalizeSend() {
  if (!lastSent) return;
  clearTimeout(sendTimer);
  const a = answered.get(lastSent.id); if (a) a.sent = true;
  lastSent = null;
}
function scheduleSend(c, news = "") {
  lastSent = { id: c.decision };
  const a = answered.get(c.decision);
  const what = a.verdict === "proposal" || a.verdict === "alternative" ? `You chose “${c[a.verdict].name}”.` : a.verdict === "answer" ? "You wrote an answer." : "You said you can't judge it.";
  toast(`${what} It goes to ${c.agent} in <span id="toast-secs">5</span> s.${news}`, { undo: true, ms: UNDO_MS });
  const until = performance.now() + UNDO_MS;
  toastTick = setInterval(() => { const el = $("toast-secs"); if (el) el.textContent = String(Math.max(1, Math.ceil((until - performance.now()) / 1000))); }, 250);
  sendTimer = setTimeout(() => { finalizeSend(); toast(`Sent to ${c.agent}.`, { ms: 1600 }); }, UNDO_MS);
}
function undo() {
  if (!lastSent) return;
  const id = lastSent.id;
  clearTimeout(sendTimer); lastSent = null;
  answered.delete(id);
  toast("Undone. The card is back.", { ms: 1600 });
  next(id);
}

async function commit(kind, d, extra = {}) {
  const c = current;
  if (!c || s.locked) return;
  s.locked = true;
  stopAnims(); keyHeld = null;
  finalizeSend();
  const side = d === "left" || d === "right" ? d : null;
  const caught = c.practice ? (kind === "alternative" ? true : kind === "proposal" ? false : null) : undefined;
  answered.set(c.decision, { verdict: kind, side, rarity: rarityName(c), dwell: performance.now() - shownAt, practice: Boolean(c.practice), caught, text: extra.text, reason: extra.reason, sent: false });
  const card = $("card");
  if (!reduced) {
    // The top card leaves the pile toward the side you chose.
    const dx = { left: -130, right: 130 }[d] ?? 0, dy = { up: -40, down: 40 }[d] ?? 0;
    // The card's own transform belongs to the drag, so its exits and entrances use plain Web Animations that
    // leave no style behind when they end.
    const out = card.animate([{ transform: card.style.transform || "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) rotate(${dx * 0.045}deg)`, opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" });
    await out.finished;
    card.style.opacity = 0; card.style.transform = "";
    out.cancel();
  }
  s.x = 0; s.y = 0; s.samples = []; s.locked = false; reveal = null;
  const news = c.practice ? "" : arrivals();
  if (c.practice) {
    mode = "practice"; renderCard(); renderAll(); preview(null);
    fadeIn(card);
    return;
  }
  scheduleSend(c, news);
  await next();
}

// ------------------------------------------------------------------ moving between cards
// ------------------------------------------------------------------ the pile: the rest of this area, slightly messy
const pileIds = () => (current ? pending().filter((id) => id !== current.decision && areaIdOf(id) === areaIdOf(current.decision)) : []);
/** Fixed per card, so the pile looks tossed together but doesn't jitter between answers. */
function messy(id, depth) {
  const h = hash(id);
  return { r: (((h % 9) - 4) * 0.55 + (depth % 2 ? 0.9 : -0.9)).toFixed(2), dx: ((h >> 4) % 9) - 4, dy: 3 + depth * 3 + ((h >> 8) % 3) };
}
function renderPile() {
  const ids = pileIds(), area = current ? areaOf(byDecision(current.decision)).name : "";
  $("pile").innerHTML = ids.slice(0, 4).map((id, i) => {
    const m = messy(id, i + 1);
    return `<div class="under" style="--r: ${m.r}deg; --dx: ${m.dx}px; --dy: ${m.dy}px; z-index: ${10 - i}"></div>`;
  }).join("");
  const later = pending().filter((id) => areaIdOf(id) !== areaIdOf(current?.decision ?? ""));
  $("pile-count").innerHTML = !current || mode === "review" ? ""
    : ids.length ? `<b>${ids.length} more</b> in ${area} under this one`
    : later.length ? `Last card in ${area}. Next: ${areaOf(byDecision(later[0])).name}.` : "The last card.";
}
let lastArea = null;
function arrive(card, from) {
  const area = areaIdOf(current.decision), changed = lastArea !== null && lastArea !== area;
  lastArea = area;
  card.style.opacity = 1;
  if (reduced) return;
  if (changed) {
    // A new area: its pile slides in, and the breadcrumb says where you are now.
    s.anims.push(animate($("deck"), { transform: ["translateX(60px)", "translateX(0px)"], opacity: [0, 1] }, { duration: 0.34, ease: [0.2, 0.9, 0.25, 1] }));
    animate($("crumbs"), { backgroundColor: ["#fffbeaee", "#fffbea00"] }, { duration: 1.4 });
  } else if (from) {
    // The next card lifts off the pile and straightens.
    const lift = card.animate([{ transform: `translate(${from.dx}px, ${from.dy}px) rotate(${from.r}deg)` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2, 1.25, .4, 1)" });
    s.anims.push({ stop: () => lift.cancel() });
  } else {
    fadeIn(card);
  }
}

function fadeIn(card) {
  card.style.opacity = 1;
  if (!reduced) card.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" });
}
async function next(id) {
  const ids = pending();
  mode = "live"; reveal = null; s.x = 0; s.y = 0; hoverSide = null;
  if (!ids.length) {
    current = null;
    $("card").style.display = "none"; $("crumbs").style.visibility = "hidden"; $("pile").innerHTML = ""; $("pile-count").innerHTML = "";
    $("empty-recap").textContent = recap();
    $("empty").classList.add("on");
    $("up").innerHTML = ""; $("down").innerHTML = "";
    renderAll();
    return;
  }
  const target = id && ids.includes(id) ? id : ids[0];
  const under = pileIds().indexOf(target);
  current = cardFor(target);
  showCard(under >= 0 ? messy(target, under + 1) : null);
}
function showCard(from = null) {
  const card = $("card");
  stopAnims(); s.x = 0; s.y = 0; s.dragging = false; s.how = "drag"; keyHeld = null; hoverSide = null;
  card.style.display = ""; $("crumbs").style.visibility = "";
  $("empty").classList.remove("on");
  shownAt = performance.now();
  renderCard(); renderPile(); renderUp(current); renderDown(current); renderAll(); preview(null); render();
  arrive(card, from);
  if (!reduced) animate([$("up"), $("down")], { opacity: [0.2, 1] }, { duration: 0.3 });
}
/** The decisions related to a card: what it builds on, what it conflicts with, what depends on it, its precedent. */
function relatedIds(c) {
  if (!c) return [];
  const d = byDecision(c.decision);
  return [...new Set([...(d.needs ?? []), ...(d.conflicts ?? []), ...dependentsOf(d.id).map((x) => x.id), c.precedent?.ref].filter(Boolean))];
}
function openReview(id) {
  if (mode === "write" || mode === "pass") return toast("Send or cancel your written answer first.", { ms: 2000 });
  current = cardFor(id); mode = "review"; reveal = null;
  const a = answered.get(id);
  sides = a.side ? { [a.side]: a.verdict, [a.side === "left" ? "right" : "left"]: OTHER[a.verdict] } : sidesFor(current);
  renderCard(); renderPile(); renderUp(current); renderDown(current); renderAll();
  if (a.side) preview(a.side, 1, "chosen"); else preview(null);
  $("card").style.display = ""; $("card").style.opacity = 1; $("empty").classList.remove("on"); $("crumbs").style.visibility = "";
}
function recap() {
  const rows = [...answered.values()].filter((a) => !a.practice);
  const n = (v) => rows.filter((a) => a.verdict === v).length;
  const parts = [[n("proposal"), "took the agent's proposal"], [n("alternative"), "chose the alternative"], [n("answer"), "wrote an answer"], [n("pass"), "couldn't judge"]].filter(([k]) => k).map(([k, t]) => `${k} ${t}`);
  if (!rows.length) return "";
  if (parts.length === 1) return `You answered ${plural(rows.length, "card")}, and ${parts[0].replace(/^\d+ /, "")} each time.`;
  return `You answered ${plural(rows.length, "card")}: ${listJoin(parts)}.`;
}

// ------------------------------------------------------------------ keys
let mapPeek = false;
addEventListener("keydown", (e) => {
  if (e.key === "Escape") return escape();
  if (mode === "write" || mode === "pass") { // typing goes to the answer; only Esc leaves it, and ⌘ Enter sends it
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("send")?.click(); }
    return;
  }
  if (e.target instanceof Element && e.target.closest("textarea, input")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === " ") {
    e.preventDefault();
    if (e.repeat) return;
    if (!mapOpen()) { mapPeek = true; openMap(); }
    return;
  }
  if (e.key === "Enter" && mode === "practice") { next(); return; }
  if (e.key === "m" || e.key === "M") { mapOpen() ? closeMap() : openMap(); return; }
  if (mapOpen()) return;
  if ((e.key === "z" || e.key === "Z") && lastSent) { undo(); return; }
  if ((e.key === "j" || e.key === "k") && !s.locked) {
    const ids = pending(); if (!ids.length) return;
    const i = current ? ids.indexOf(current.decision) : -1;
    next(ids[(i + (e.key === "j" ? 1 : ids.length - 1) + ids.length) % ids.length]);
    return;
  }
  const d = { ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" }[e.key];
  if (!d || !current || s.locked) return;
  e.preventDefault();
  if (e.repeat) return;
  keyHeld = d;
  if (mode === "reveal") {
    if (reveal.d !== d) return;
    if (needsHold(current)) beginHold(); else { keyHeld = null; commit(reveal.kind, reveal.d); }
    return;
  }
  if (mode !== "live") return;
  // Holding an arrow leans the card that way and previews the answer; letting go chooses it.
  s.how = "key";
  const lean = { right: [THRESH_X * 0.7, 0], left: [-THRESH_X * 0.7, 0], up: [0, -THRESH_Y * 0.5], down: [0, THRESH_Y * 0.5] }[d];
  springTo(lean[0], lean[1]);
});
addEventListener("keyup", (e) => {
  if (e.key === " ") e.preventDefault();
  if (e.key === " " && mapPeek) { mapPeek = false; closeMap(); return; }
  const d = { ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" }[e.key];
  if (!d || keyHeld !== d) return;
  keyHeld = null;
  if (mode === "reveal") { stopHold(); return; }
  if (mode !== "live" || !current || s.locked) return;
  reach(d);
});
addEventListener("click", (e) => { const b = e.target instanceof Element && e.target.closest("button"); if (b && e.detail > 0) b.blur(); });
function escape() {
  if (document.activeElement instanceof HTMLButtonElement && !mapOpen()) document.activeElement.blur();
  if (mapOpen()) return map.inspecting() ? map.backToCard() : closeMap(); // one level back at a time
  if ($("mirror").classList.contains("open")) { $("mirror").classList.remove("open"); $("calib").setAttribute("aria-expanded", "false"); return; }
  if (keyHeld && mode === "live") { keyHeld = null; settle(); return; }
  if (mode === "write" || mode === "pass" || mode === "reveal") return backToLive();
  if (mode === "review" || mode === "practice") return next();
}

// ------------------------------------------------------------------ the queue and the summary
function renderAll() { renderSummary(); renderQueue(); }
function countsByArea() {
  const out = {};
  for (const id of pending()) out[areaIdOf(id)] = (out[areaIdOf(id)] ?? 0) + 1;
  return out;
}
function renderSummary() {
  const ids = pending(), waiting = ids.filter((id) => cardFor(id).blocking).length;
  $("summary").innerHTML = !ids.length ? "<b>Nothing needs you.</b>"
    : `<b>${ids.length} card${ids.length === 1 ? " needs" : "s need"} your answer.</b> ${waiting ? `${NUMBER[waiting] ?? waiting} agent${waiting === 1 ? " is" : "s are"} waiting on you.` : "No agent is waiting on them."}`;
}
function renderQueue() {
  const groups = new Map();
  for (const id of queue()) { const a = areaIdOf(id); if (!groups.has(a)) groups.set(a, []); groups.get(a).push(id); }
  const q = $("queue");
  q.innerHTML = "";
  for (const [a, ids] of groups) {
    const g = document.createElement("span");
    g.className = "qg";
    g.innerHTML = `<span class="qg-name">${AREAS.find((x) => x.id === a).name}</span>`;
    const done = ids.filter((id) => answered.has(id));
    if (done.length) {
      // Answered cards collapse to a count; it reopens the latest one, and the map lists them all.
      const b = document.createElement("button");
      b.className = "chip done";
      b.title = `Answered: ${done.map((id) => byDecision(id).short).join("; ")}. Click to see the latest one or change it.`;
      b.innerHTML = `<span class="ok">✓ ${done.length}</span>`;
      b.addEventListener("click", () => { if (!s.locked) openReview(done.at(-1)); });
      g.appendChild(b);
    }
    for (const id of ids.filter((x) => !answered.has(x))) {
      const c = cardFor(id), r = rarityName(c);
      const b = document.createElement("button");
      b.className = `chip${current?.decision === id ? " current" : ""}`;
      b.title = `${RARITY[r].name}${c.blocking ? ", and an agent is stopped until you answer" : ""}: ${byDecision(id).short}`;
      b.innerHTML = `${mark(r, 14)}<span class="t">${byDecision(id).short}</span>${c.blocking ? `<span class="stopped" aria-label="an agent is stopped"></span>` : ""}`;
      b.addEventListener("click", () => {
        if (s.locked) return;
        if (mode === "write" || mode === "pass") return toast("Send or cancel your written answer first.", { ms: 2000 });
        next(id);
      });
      g.appendChild(b);
    }
    q.appendChild(g);
  }
  document.querySelector(".nav-keys").hidden = !pending().length;
}

// ------------------------------------------------------------------ the project map (map.js)
const mapOpen = () => !$("map").hidden;
/** What the map needs to know about a decision, in its own terms. */
function mapState(id) {
  const c = cardFor(id), d = byDecision(id);
  if (c) {
    if (!onTable(c)) return { kind: "hidden" };
    const a = answered.get(id);
    if (a) return { kind: "answered", rarity: rarityName(c), chose: a.verdict === "proposal" || a.verdict === "alternative" ? c[a.verdict].name : null };
    return { kind: "waiting", rarity: rarityName(c), stopped: c.blocking, order: pending().indexOf(id) + 1 };
  }
  if (d.state === "practice") return { kind: "hidden" };
  if (d.state === "open") return { kind: "waiting", rarity: "common", order: 0 };
  return { kind: d.state };
}
function openMap() {
  const wasOpen = mapOpen();
  $("map").hidden = false;
  document.querySelector(".desk").inert = true;
  document.querySelector(".dock").inert = true;
  map.show(); // first: it clears any decision you were looking at last time
  mapCaption();
  mapCloseLabel();
  $("map").focus({ preventScroll: true });
  if (!wasOpen && !reduced) $("map").animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
}
function closeMap() {
  if (!mapOpen()) return;
  const done = () => {
    $("map").hidden = true; mapPeek = false; $("map-tip").classList.remove("on");
    document.querySelector(".desk").inert = false;
    document.querySelector(".dock").inert = false;
  };
  if (reduced) return done();
  $("map").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in" }).finished.then(done);
}
/** The close button always closes. While you're looking at another decision, Esc steps back instead, so its key is
 * hidden; its slot is kept, so the bar never changes height. */
function mapCloseLabel() {
  $("map-close").innerHTML = `Close the map <kbd${map.inspecting() ? ' style="visibility:hidden"' : ""}>Esc</kbd>`;
}
/** The map's caption says what it's showing: your card, or a decision you clicked to look at. */
function mapCaption() {
  const looking = map.inspecting();
  $("map-caption").textContent = looking
    ? `You're looking at “${byDecision(looking).short}”, outlined. What it's connected to is lettered. Esc: back to ${current ? "your card's connections" : "the whole map"}.`
    : current ? "Your card is outlined. What it's connected to is lettered, and listed on the right. Each piece of work runs left to right, oldest first."
    : "Everything is answered. Click any decision to see what it's connected to.";
}
$("map-close").addEventListener("click", closeMap);
$("open-map").addEventListener("click", () => (mapOpen() ? closeMap() : openMap()));
$("legend").innerHTML = [
  [["common", "uncommon", "rare", "mythic"].map((r) => mark(r, 16)).join(""), "to answer, stakes low to high"],
  [`<i class="ord">1</i>`, "the next five to answer, in order"],
  [mark("common", 16, { stopped: true }), "agent stopped"],
  [mark("common", 16, { answered: true }), "answered"],
  [mark("settled"), "settled"], [mark("rule"), "rule"], [mark("agent"), "agent's own call"], [mark("deferred"), "deferred"],
  [`<i class="letter" style="position:static">A</i>`, "connected, listed right"],
  [`<svg width="30" height="12"><path d="M2 6 H20" stroke="#2E2343" stroke-width="1.8"/><path d="M19 1.5 L28 6 L19 10.5 Z" fill="#2E2343"/></svg>`, "builds on"],
  [`<svg width="26" height="12"><path d="M2 6 H24" stroke="#8E3A5F" stroke-width="1.8" stroke-dasharray="6 5"/></svg>`, "conflicts, may conflict, disagrees"],
  [`<span class="keys"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> <kbd>j</kbd><kbd>k</kbd> <kbd>Enter</kbd></span>`, "move, next card, open"],
].map(([g, t]) => `<span class="li">${g}<span>${t}</span></span>`).join("");

// ------------------------------------------------------------------ toast
let toastTimer = 0, toastTick = 0;
function toast(text, { undo: withUndo = false, ms = 3000 } = {}) {
  const t = $("toast"), col = $("up").getBoundingClientRect();
  clearInterval(toastTick);
  t.style.left = `${col.left}px`;
  t.style.maxWidth = `${Math.max(220, col.width)}px`;
  t.innerHTML = `<span>${text}</span>${withUndo ? `<button class="undo" id="undo">Undo <kbd>Z</kbd></button><i class="timer" id="timer"></i>` : ""}`;
  t.classList.add("on");
  if (withUndo) {
    $("undo").addEventListener("click", undo);
    if (!reduced) animate($("timer"), { transform: ["scaleX(1)", "scaleX(0)"] }, { duration: ms / 1000, ease: "linear" });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), ms);
}

// ------------------------------------------------------------------ practice cards (opt-in canaries)
$("practice").addEventListener("click", () => {
  practiceOn = !practiceOn;
  $("practice").setAttribute("aria-pressed", String(practiceOn));
  $("practice").textContent = `Practice cards: ${practiceOn ? "on" : "off"}`;
  if (practiceOn) toast("Practice cards are on. Now and then one arrives among your real cards, and looks just like them.", { ms: 3600 });
  if (current?.practice && !practiceOn && mode === "live") next(); else renderAll();
});

// ------------------------------------------------------------------ calibration (outcome-based)
const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((p, q) => p - q); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
function renderMirror() {
  const rows = [...answered.values()];
  const byTier = (names) => median(rows.filter((r) => names.includes(r.rarity)).map((r) => r.dwell));
  const fmt = (ms) => (ms == null ? "none yet" : `${(ms / 1000).toFixed(1)} s`);
  const practice = rows.filter((r) => r.practice && r.caught !== null);
  const caught = CALIBRATION_BASELINE.canaries.caught + practice.filter((r) => r.caught).length;
  const of = CALIBRATION_BASELINE.canaries.of + practice.length;
  const alternatives = rows.filter((r) => r.verdict === "alternative").length;
  $("mirror").innerHTML = `<h4>Your calibration</h4>
    <p class="sub">Judged by what happened afterwards, not by how often you agreed with the agents.</p>
    <dl>
      <dt>Time spent</dt><dd>${plural(rows.filter((r) => !r.practice).length, "answer")} this session${rows.some((r) => r.practice) ? `, plus ${plural(rows.filter((r) => r.practice).length, "practice card")}` : ""}. Median time on mythic and rare cards: ${fmt(byTier(["mythic", "rare"]))}; uncommon: ${fmt(byTier(["uncommon"]))}; common: ${fmt(byTier(["common"]))}.</dd>
      <dt>Practice cards</dt><dd>You've caught ${caught} of ${of}, counting earlier sessions.</dd>
      <dt>Later reversed</dt><dd>${CALIBRATION_BASELINE.reverted.map((r) => `“${r.text}”: ${r.note}`).join("; ")}.</dd>
      <dt>Alternatives</dt><dd>You chose the alternative ${plural(alternatives, "time")} today.</dd>
    </dl>
    <p class="both">Both directions count. One accept was later reversed, which is over-reliance. You also overturned ${CALIBRATION_BASELINE.heldUp} decisions that held up when they were re-decided, which is under-reliance.</p>`;
}
$("calib").addEventListener("click", () => {
  const open = !$("mirror").classList.contains("open");
  if (open) renderMirror();
  $("mirror").classList.toggle("open", open);
  $("calib").setAttribute("aria-expanded", String(open));
});

$("again").addEventListener("click", () => { answered.clear(); next(); });

// ------------------------------------------------------------------ start
const crumbsEl = document.createElement("p");
crumbsEl.className = "crumbs"; crumbsEl.id = "crumbs";
$("stage").prepend(crumbsEl);
map.mountMap({ body: $("map-body"), foot: $("map-foot"), tip: $("map-tip"), more: $("map-more"), less: $("map-less") }, {
  stateOf: mapState,
  precedentOf: (id) => cardFor(id)?.precedent?.ref ?? null,
  kindOf: (id) => cardFor(id)?.kind ?? null,
  queue: () => pending(),
  currentId: () => current?.decision ?? null,
  reviewing: () => mode === "review",
  onGo: (id) => { if (mode === "write" || mode === "pass") return toast("Send or cancel your written answer first.", { ms: 2000 }); closeMap(); next(id); },
  onReview: (id) => { closeMap(); openReview(id); },
  onChange: () => { mapCaption(); mapCloseLabel(); },
});
current = cardFor(pending()[0]);
showCard();
requestAnimationFrame(tick);

// ------------------------------------------------------------------ self-test (#selftest)
if (SELFTEST) {
  const out = [];
  const log = (m) => { out.push(m); console.log(`SELFTEST ${m}`); };
  const key = (k, type, target = document.body) => target.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tap = async (k, ms = 90) => { key(k, "keydown"); await wait(ms); key(k, "keyup"); await wait(250); };
  const text = () => $("card").textContent;
  const ARROWKEY = { left: "ArrowLeft", right: "ArrowRight" };
  /** Answer the current card toward a side, through whatever its rarity asks: the wait, the reveal, the hold. */
  async function answer(side = "right") {
    const id = current.decision, k = ARROWKEY[side];
    await wait(waitLeft() + 150);
    await tap(k, 120);
    if (mode === "reveal") {
      if ($("hold")) { key(k, "keydown"); await wait(HOLD_MS + 200); key(k, "keyup"); await wait(300); } else await tap(k);
    }
    return id;
  }
  window.onerror = (m) => console.log(`SELFTEST error ${m}`);
  (async () => {
    const first = current.decision;
    log(`1 first card: ${byDecision(first).short} (${rarityName(current)}); human-first: ${humanFirst(current)}`);
    log(`2 agent's pick hidden: ${!text().includes("Proposed by")} (expected true); chips name it neutrally: ${!$("queue").textContent.includes("fragment")} (expected true)`);
    log(`3 the pile holds the rest of the area, as plain backs: ${$("pile").children.length === pileIds().length && pileIds().length === 2 && !$("pile").querySelector("[class*=rarity]")} (expected true)`);
    await tap("ArrowRight");
    log(`4 answered before reading: ${answered.has(first)} (expected false)`);
    await wait(waitLeft() + 100);
    log(`5 buttons full strength after the wait: ${!$("card").hasAttribute("data-locked")} (expected true)`);
    key("ArrowRight", "keydown"); await wait(120);
    log(`6 holding → previews it: ${$("down").dataset.lean === "right"} (expected true)`);
    key("ArrowRight", "keyup"); await wait(250);
    log(`7 reveal in the card, with a hold (mythic): ${mode === "reveal" && Boolean($("hold"))} (expected true)`);
    key(" ", "keydown"); await wait(150);
    log(`8 Space opens the map, and never confirms: ${mapOpen() && !answered.has(first)} (expected true)`);
    key(" ", "keyup"); await wait(150);
    key("ArrowRight", "keydown"); await wait(HOLD_MS + 200); key("ArrowRight", "keyup"); await wait(300);
    log(`9 held to confirm: ${answered.has(first)} (expected true); undo offered: ${Boolean($("undo"))} (expected true)`);
    key("z", "keydown"); await wait(200);
    log(`10 undo brings it back: ${!answered.has(first) && current.decision === first} (expected true)`);
    await answer("left");
    log(`11 answered again: ${answered.has(first)} (expected true)`);
    const second = current.decision;
    log(`12 a card with a stopped agent comes next: ${byDecision(second).short} (${rarityName(current)}), blocking: ${current.blocking} (expected true)`);
    await wait(waitLeft() + 100);
    await tap("ArrowDown");
    log(`13 "can't judge" keeps the agent's pick hidden: ${mode === "pass" && !text().includes("Proposed by")} (expected true)`);
    key("Escape", "keydown"); await wait(150);
    await answer("left");
    log(`14 rare confirmed by pressing ← again: ${answered.has(second)} (expected true)`);
    log(`15 a late card arrived after two answers: ${queue().includes("B-t3rel") && $("toast").textContent.includes("new card")} (expected true)`);
    log(`16 the next card didn't arrive leaning: ${!$("down").dataset.lean && s.x === 0} (expected true)`);
    const third = current.decision;
    log(`17 third card: ${byDecision(third).short} (${rarityName(current)})`);
    await tap("ArrowUp");
    log(`18 write opens in the card, focused: ${mode === "write" && document.activeElement === $("txt")} (expected true)`);
    key("k", "keydown", $("txt")); await wait(150);
    log(`19 typing k doesn't switch cards: ${current.decision === third} (expected true)`);
    key("Escape", "keydown"); await wait(150);
    log(`20 Esc returns to the choice: ${mode === "live"} (expected true)`);
    await answer("right");
    log(`21 third answered: ${answered.get(third)?.verdict} (expected proposal)`);
    const fourth = await answer("right");
    log(`22 fourth answered: ${byDecision(fourth).short} (${rarityName(cardFor(fourth))})`);
    $("practice").click(); await wait(100);
    const pid = CARDS.find((c) => c.practice).decision;
    log(`23 practice card waits to arrive: ${!queue().includes(pid)} (expected true)`);
    await answer("right"); await wait(100);
    log(`24 then arrives in the queue: ${queue().includes(pid)} (expected true)`);
    await next(pid);
    await answer("right");
    log(`25 practice result shown in the card: ${mode === "practice" && answered.get(pid)?.caught === false} (expected true)`);
    key("Enter", "keydown"); await wait(150);
    log(`26 Enter continues: ${mode === "live" || !current} (expected true); practice still on: ${practiceOn} (expected true)`);
    $("calib").click(); await wait(50);
    log(`27 calibration: ${$("mirror").textContent.includes("caught 3 of 5")} (expected true)`);
    $("calib").click();
    openReview(first); await wait(100);
    log(`28 a reopened card: ${mode === "review" && Boolean($("change")) && !$("down").textContent.includes("stopped until")} (expected true)`);
    key("m", "keydown"); await wait(200);
    await wait(100);
    log(`29 the map letters the related rule in another area, with a line: ${mapOpen() && document.querySelector('.gx[data-id="B-g4mn8"] .letter')?.textContent === "A" && document.querySelectorAll(".rels .rel.main").length >= 1} (expected true)`);
    key("Escape", "keydown"); await wait(100);
    log(`30 Esc closes the map: ${!mapOpen()} (expected true)`);
    const pre = document.createElement("pre"); pre.id = "selftest"; pre.textContent = out.join("\n"); pre.hidden = true; document.body.appendChild(pre);
  })();
}
