// Round 5: glance first. A subtractive pass over round 4 (design/explorations/round4/): the card says what's
// being decided, how much it matters and what each answer does, and keeps the rest a deliberate step away;
// the project map gives way to the decision's neighbourhood, beside the card.

import { animate } from "https://cdn.jsdelivr.net/npm/motion@14.6.0/+esm";
import { mark } from "./marks.js";
import { AREAS, CALIBRATION_BASELINE, CARDS, DECISIONS, RARITY, STATE_WORDS, areaOf, byDecision, dependentsOf, filingProblems, rarityOf, workOf } from "./data.js";

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
const freshIds = new Set(); // arrived, and not yet seen
let current = null; // the card on screen
let mode = "live"; // live | reveal | write | pass | review | practice
let shownAt = 0;
let sides = { left: "alternative", right: "proposal" };
let reveal = null; // { d, kind } while the reveal is showing
let showWhy = false; // the agent's reasoning, opened on request

const cardFor = (id) => CARDS.find((c) => c.decision === id);
const rarityName = (c) => RAR.get(c.decision).rarity;
const humanFirst = (c) => RAR.get(c.decision).tier === "high"; // rare and mythic
const needsHold = (c) => rarityName(c) === "mythic"; // hard cards are held to confirm (D67)
const areaIdOf = (id) => areaOf(byDecision(id)).id;

/** The queue: grouped by area, blocking and rarer first; cards with a stopped agent come first of all. */
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
function arrivals() {
  const fresh = CARDS.filter((c) => c.arrives != null && !arrived.has(c.decision) && realAnswers() >= c.arrives);
  fresh.forEach((c) => { arrived.add(c.decision); freshIds.add(c.decision); });
  const moreToCome = CARDS.some((c) => c.arrives != null && !arrived.has(c.decision));
  if (practiceOn && !practiceArrived && (fresh.length || !moreToCome)) { practiceArrived = true; fresh.push(CARDS.find((c) => c.practice)); }
  if (!fresh.length) return "";
  const areas = [...new Set(fresh.map((c) => areaOf(byDecision(c.decision)).name))];
  return ` ${fresh.length === 1 ? "A new card" : `${NUMBER[fresh.length] ?? fresh.length} new cards`} arrived.`;
}

function hash(t) { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
/** Human-first cards put the options on sides that vary from card to card, so position can't hint at the agent's pick. */
const HF = CARDS.filter(humanFirst).map((c) => c.decision);
function sidesFor(c) {
  if (!humanFirst(c)) return { left: "alternative", right: "proposal" };
  return HF.indexOf(c.decision) % 2 === 0 ? { left: "proposal", right: "alternative" } : { left: "alternative", right: "proposal" };
}

// ------------------------------------------------------------------ the card
/** The stakes in a few words: how hard it is to undo, then what it touches or what rests on it. Never the tier name. */
function stakesLine(c) {
  const undo = { "one-way": "Hard to undo", moderate: "Costly to undo", cheap: "Easy to undo" }[c.reverse] ?? "Easy to undo";
  const parts = [];
  const hard = c.touches.filter((f) => ["security", "money", "data-loss", "publishes"].includes(f));
  if (hard.length) parts.push(`touches ${listJoin(hard.map((f) => f.replace("-", " ")))}`);
  if (c.kind === "conflict") parts.push("two settled decisions disagree");
  const deps = dependentsOf(c.decision).filter((x) => onTableId(x.id)).length;
  if (deps) parts.push(`${plural(deps, "decision")} ${deps === 1 ? "rests" : "rest"} on it`);
  return [undo, ...parts].join(", ");
}

const pickLabel = (c) => (c.kind === "audit" ? `what ${c.agent} did` : `${c.agent}'s pick`);

function optionHtml(c, kind, side) {
  const o = c[kind];
  const a = answered.get(c.decision);
  const showPick = kind === "proposal" && (!humanFirst(c) || mode === "reveal" || mode === "review" || mode === "practice");
  const picked = mode === "reveal" ? reveal.kind : (mode === "review" || mode === "practice") ? a?.verdict : null;
  const cls = picked ? (picked === kind ? " chosen" : " unchosen") : "";
  const live = mode === "live";
  return `<button class="opt${cls}" data-side="${side}" data-kind="${kind}" ${live ? "" : 'tabindex="-1"'} aria-label="Choose ${o.name}">
      ${live ? `<kbd class="key" aria-hidden="true">${ARROW[side]}</kbd>` : ""}
      <span class="ifans">${c.crux[kind]}</span>
      <h2>${o.name}</h2>
      <p class="then">then ${o.then}</p>
      ${showPick ? `<span class="pickof">${pickLabel(c)}${c.serves ? `, for ${c.serves}` : ""}</span>` : ""}
    </button>`;
}

const caseHtml = (c) => `<p><span class="who">${c.agent}:</span> <q>${c.case.rationale}</q> Its pick is wrong if ${c.case.wrongIf} (check ${c.case.check}).</p>`;
const reasoningHtml = (c) => `<div class="reasoning" id="reasoning">${caseHtml(c)}</div>`;

/** The trigger (D73): one line on what prompted the decision. */
const doingHtml = (c) => `<p class="doing">${c.voice === "baesian" ? cap(c.doing) : `<b>${c.agent}</b> is ${c.doing}`}</p>`;

/** The crux (D74): the one question whose answer decides between the options, with the fact that bears on it. */
const cruxHtml = (c) => `<div class="crux"><p><span class="lbl">${c.crux.preference ? "It turns on what you value" : "It turns on"}</span> ${c.crux.q}</p>${c.crux.fact ? `<p class="fact">${c.crux.fact}</p>` : ""}</div>`;

/** The trial facets (D75): a premise nobody has checked, and work the agent has already done. */
function facetsHtml(c) {
  const out = [];
  if (c.premise) out.push(`<p class="facet unverified"><b>Unverified</b> “${c[c.premise.option].name}” ${c.premise.claim}. <span class="soft">Check: ${c.premise.check}.</span></p>`);
  if (c.acted) out.push(`<p class="facet acted"><b>Already built</b> ${c.agent} has done “${c[c.acted.option].name}”: ${c.acted.text}. <span class="soft">${c.acted.matches ? "They match what this card says it does." : "They don't match what this card says: check before answering."}</span></p>`);
  return out.join("");
}

function footHtml(c) {
  return `<div class="foot">
      <span class="rule" id="rule"></span>
      <button data-dir="up"><kbd>↑</kbd> Other answer</button>
      <button data-dir="down"><kbd>↓</kbd> Can't judge</button>
      ${humanFirst(c) ? "" : `<button class="why-btn" id="why-btn" aria-expanded="${showWhy}">${showWhy ? `Hide ${c.agent}'s reasoning` : `${c.agent}'s reasoning`}</button>`}
    </div>`;
}

function revealHtml(c) {
  const { d, kind } = reveal, same = kind === "proposal";
  const confirm = needsHold(c)
    ? `<button class="hold" id="hold"><span class="fill" id="hold-fill"></span><span>Hold <kbd>${ARROW[d]}</kbd> or click and hold to confirm</span></button>`
    : `<button class="confirm" id="confirm">Confirm <kbd>${ARROW[d]}</kbd></button>`;
  return `<div class="panel-in" style="--c: var(--ink)">
      <p class="verdict">You chose <b>${c[kind].name}</b>. ${c.agent} ${same ? "picked the same." : `picked <b>${c.proposal.name}</b>.`}</p>
      <div class="reasoning">${caseHtml(c)}</div>
      ${confirm}
      <p class="small">Esc goes back to the choice.</p>
    </div>`;
}

const REASONS = { write: ["Ask a question", "Suggest a correction", "Reject, with a reason"], pass: ["I need more context", "It's outside my expertise", "I need to see it run"] };
function writeHtml(c) {
  const up = mode === "write";
  return `<div class="panel-in">
      <h3>${up ? `Write to ${c.agent}` : "Why can't you judge it?"}</h3>
      <div class="chips" id="opts">${REASONS[mode].map((t) => `<button aria-pressed="false">${t}</button>`).join("")}</div>
      <textarea id="txt" aria-label="${up ? "Your answer" : "What would help"}" placeholder="${up ? `Goes back to ${c.agent} with this card.` : "Optional: what would help you judge it?"}"></textarea>
      <div class="row"><button class="send" id="send">Send to ${c.agent}</button><span class="small"><kbd>⌘</kbd> <kbd>Enter</kbd></span><button class="cancel" id="cancel">Cancel <kbd>Esc</kbd></button></div>
    </div>`;
}

function describe(c, a) {
  if (a.verdict === "proposal" || a.verdict === "alternative") return `You chose ${c[a.verdict].name}.`;
  if (a.verdict === "answer") return `You wrote${a.reason ? ` (${a.reason.toLowerCase()})` : ""}: “${a.text || "no text"}”.`;
  return `You said you can't judge it${a.reason ? `: ${a.reason.toLowerCase()}` : ""}.`;
}
function reviewHtml(c) {
  const a = answered.get(c.decision);
  return `<div class="panel-in"><div class="result" style="--c: var(--${a.side ?? "ink"})">
      <p><b>${describe(c, a)}</b> ${a.sent ? `It was sent to ${c.agent}.` : `It goes to ${c.agent} in a few seconds.`}</p></div>
      <div class="row"><button class="send" id="change">Change your answer</button><button class="cancel" id="back">Next card <kbd>Esc</kbd></button></div>
    </div>`;
}
function practiceHtml(c) {
  const a = answered.get(c.decision);
  const result = a.caught === true ? "You caught it."
    : a.caught === false ? "You accepted it: exactly what these cards look for, a fluent proposal for an option you'd already rejected."
    : "You chose neither option, which counts as neither a catch nor a miss.";
  return `<div class="panel-in"><div class="result practice"><p><b>That was a practice card.</b> ${c.reveal}</p><p style="margin-top:8px"><b>${result}</b></p>
      <div class="row" style="margin-top:10px"><button class="send" id="practice-ok">Continue <kbd>Enter</kbd></button></div></div></div>`;
}

function renderCard() {
  const c = current, card = $("card");
  const R = RAR.get(c.decision), r = RARITY[R.rarity];
  if (mode === "live") sides = sidesFor(c);
  card.className = `card rarity-${R.rarity}`;
  card.style.transform = "";
  card.style.setProperty("--pl", 0);
  card.style.setProperty("--pr", 0);
  card.setAttribute("aria-label", c.question);
  const lower = { live: () => `${facetsHtml(c)}${showWhy && !humanFirst(c) ? reasoningHtml(c) : ""}${footHtml(c)}`, reveal: revealHtml, write: writeHtml, pass: writeHtml, review: reviewHtml, practice: practiceHtml }[mode](c);
  card.innerHTML = `
    <div class="frame" aria-hidden="true"></div>
    <div class="face" id="face">
      <p class="stakes rarity-${R.rarity}"><span class="rmark" title="${r.name}: ${r.rank} of stakes" aria-label="${r.name}">${mark(R.rarity, 22)}</span><b>${stakesLine(c)}</b>${c.blocking && mode !== "review" ? `<span class="stopped">${c.agent} stopped</span>` : ""}</p>
      ${doingHtml(c)}
      <h1>${c.question}</h1>
      ${mode === "write" || mode === "pass" ? "" : `${cruxHtml(c)}<div class="options">${optionHtml(c, sides.left, "left")}${optionHtml(c, sides.right, "right")}</div>`}
      ${lower}
    </div>`;
  ruleKey = "";
  const d = byDecision(c.decision);
  $("crumbs").innerHTML = `${areaOf(d).name} › <b>${workOf(d).title}</b>`;
  wireCard();
}

// ------------------------------------------------------------------ the path: the decisions you're walking through
// A spine beside the card. Above the card's own node, the decisions you've answered this session, in the order you
// answered them; below it, what's next in this pile. The current node is joined to the card. The current card's
// relationships hang off its node, in plain words; when a related decision is on the path already, an arc along the
// spine shows the link instead of listing it twice. Each answer moves the path along: nodes keep their identity
// between renders, so they slide rather than jump.

const TRAIL_MAX = 8, NEXT_MAX = 3;

function markOf(id, size = 18) {
  const c = cardFor(id), d = byDecision(id), a = answered.get(id);
  return mark(c ? rarityName(c) : d.state === "practice" ? "uncommon" : d.state, size, { answered: Boolean(a), stopped: Boolean(c?.blocking && !a) });
}
function stateOf(id) {
  const c = cardFor(id), d = byDecision(id), a = answered.get(id);
  if (a) return a.verdict === "proposal" ? `you chose “${c.proposal.name}”` : a.verdict === "alternative" ? `you chose “${c.alternative.name}”, not ${c.agent}'s pick` : a.verdict === "answer" ? "you wrote an answer" : "you couldn't judge it";
  if (c) return c.blocking ? "to answer; an agent has stopped" : "to answer";
  return d.state === "rule" ? "your rule" : d.state === "settled" ? "settled earlier" : STATE_WORDS[d.state];
}
const onTableId = (id) => { const c = cardFor(id); return c ? onTable(c) : byDecision(id).state !== "practice"; };

/** The current card's relationships, each in the words shown beside it. */
function relationsOf(id) {
  const d = byDecision(id), c = cardFor(id), out = [];
  for (const x of d.needs ?? []) out.push({ id: x, word: "this card builds on", where: "up" });
  const conflicts = new Set([...(d.conflicts ?? []), ...DECISIONS.filter((x) => (x.conflicts ?? []).includes(id)).map((x) => x.id)]);
  for (const x of conflicts) {
    // A conflict card's two settled decisions are its two options: choosing one keeps it and replaces the other.
    const kind = c?.kind === "conflict" ? ["proposal", "alternative"].find((k) => c[k]?.keeps === x) : null;
    if (kind) {
      out.push({ id: x, word: `kept if you choose ${ARROW[Object.keys(sides).find((k) => sides[k] === kind)]} “${c[kind].name}”`, where: "down", conflict: true, keptBy: kind,
        effect: { [kind]: { text: "kept" }, [OTHER[kind]]: { text: "replaced", bad: true } } });
      continue;
    }
    const word = byDecision(x).state === "rule" || d.state === "rule" ? "this card may conflict with" : "this card conflicts with";
    out.push({ id: x, word, where: "down", conflict: true, effect: c?.effects?.[x] });
  }
  if (c?.kind === "conflict") out.sort((a, b) => (sides.left === a.keptBy ? -1 : 1) - (sides.left === b.keptBy ? -1 : 1));
  for (const x of DECISIONS.filter((x) => (x.needs ?? []).includes(id))) out.push({ id: x.id, word: "relies on this card", where: "down" });
  const p = c?.precedent?.ref;
  if (p && !out.some((r) => r.id === p)) out.push({ id: p, word: "your precedent", where: "down", precedent: true });
  return out.filter((r) => onTableId(r.id));
}

function rowHtml(id, kind, rel) {
  const d = byDecision(id), st = stateOf(id);
  const click = kind !== "now" && (answered.has(id) || pending().includes(id));
  const title = `${d.short}: ${st}${click ? (answered.has(id) ? ". Click to see your answer." : ". Click to answer it.") : ""}`;
  const open = click ? `<button class="row ${kind}" data-id="${id}" title="${title}">` : `<div class="row ${kind}" data-id="${id}" title="${title}">`;
  const close = click ? "</button>" : "</div>";
  if (kind === "rel") {
    // A related decision: off the path, its relation written above it, its own dot beside its name. When the two
    // options treat it differently, a line names the option that would hurt it, and leaning lights the effect.
    const c = current;
    const hurts = rel.effect && !rel.keptBy ? Object.entries(rel.effect).filter(([, v]) => v.bad).map(([k, v]) => `${ARROW[Object.keys(sides).find((s2) => sides[s2] === k)]} “${c[k].name}” ${v.text}`) : [];
    const fx = rel.effect ? ` data-fx-proposal="${rel.effect.proposal?.text ?? ""}" data-fx-alternative="${rel.effect.alternative?.text ?? ""}" data-bad="${Object.entries(rel.effect).filter(([, v]) => v.bad).map(([k]) => k).join(" ")}"` : "";
    return `${open.replace(">", `${fx}>`)}<span class="lbl"><span class="tag${rel.conflict ? " c" : ""}${rel.precedent ? " p" : ""}">${rel.word}</span><span class="nm">${d.short}</span><span class="st">${st}</span>${hurts.length ? `<span class="hurt">${hurts.join("; ")}</span>` : ""}</span><span class="mk-l"><i class="rdot${rel.conflict ? " c" : ""}"></i></span>${close}`;
  }
  // A step on the path. An earlier answer this card is connected to says so under your choice.
  const link = rel ? `<span class="tag link${rel.conflict ? " c" : ""}">${{ "this card builds on": "this card builds on it", "relies on this card": "it relies on this card" }[rel.word] ?? rel.word}</span>` : "";
  const isNew = kind === "next" && freshIds.has(id) ? `<span class="new-tag">new</span>` : "";
  return `${open}<span class="lbl"><span class="nm">${isNew}${d.short}</span>${kind === "past" ? `<span class="st">${st}</span>${link}` : ""}</span><span class="node">${markOf(id, kind === "now" ? 22 : 16)}</span>${close}`;
}

function renderHood() {
  const hood = $("hood");
  const before = new Map([...hood.querySelectorAll(".row")].map((r) => [r.dataset.id, r.getBoundingClientRect().top]));
  const cur = current?.decision ?? null;
  const done = [...answered.keys()].filter((id) => id !== cur && !answered.get(id).practice);
  const rel = cur ? relationsOf(cur) : [];
  // Related decisions already on the path get an arc, not a second entry.
  const onPath = new Set(done.slice(-TRAIL_MAX));
  const arcs = rel.filter((r) => onPath.has(r.id));
  const up = rel.filter((r) => r.where === "up" && !onPath.has(r.id)), down = rel.filter((r) => r.where === "down" && !onPath.has(r.id));
  const ahead = cur ? pending().filter((id) => id !== cur) : [];
  const upcoming = ahead.slice(0, NEXT_MAX), moreAhead = ahead.length - upcoming.length;
  const hidden = Math.max(0, done.length - TRAIL_MAX);
  const arcWord = new Map(arcs.map((r) => [r.id, r]));
  hood.innerHTML = `
    <div class="path" id="path">
      ${hidden ? `<p class="earlier" data-n="${hidden}">${plural(hidden, "earlier answer")}</p>` : ""}
      ${done.slice(-TRAIL_MAX).map((id) => rowHtml(id, "past", arcWord.get(id))).join("")}
      ${cur ? rowHtml(cur, "now") : ""}
      ${[...up, ...down].length ? `<div class="rels">${current?.kind === "conflict" ? `<p class="group-h">Your answer keeps one, replaces the other</p>` : ""}${[...up, ...down].map((r) => rowHtml(r.id, "rel", r)).join("")}</div>` : ""}
      ${upcoming.length ? `<p class="next-h">Next</p>${upcoming.map((id) => rowHtml(id, "next")).join("")}` : ""}
      ${moreAhead ? `<p class="earlier ahead">${moreAhead} more after these</p>` : ""}
    </div>`;
  hood.querySelectorAll("button.row").forEach((b) => b.addEventListener("click", () => goTo(b.dataset.id)));
  hood.querySelectorAll(".row").forEach((r) => {
    r.addEventListener("pointerenter", () => $("path-lines")?.querySelectorAll(`[data-id="${r.dataset.id}"]`).forEach((l) => l.classList.add("hot")));
    r.addEventListener("pointerleave", () => $("path-lines")?.querySelectorAll(".hot").forEach((l) => l.classList.remove("hot")));
  });
  alignPath();
  drawPath();
  if (reduced) return;
  // One movement, and it shows what happened: the option you chose flies from the card along the line into this
  // card's node, lands as "you chose …", and the path steps up one place. Then the next card appears.
  const svg = $("path-lines");
  const fly = pendingFly && hood.querySelector(`.row.past[data-id="${pendingFly.id}"]`);
  if (fly && lastNowTop != null) {
    const path = $("path"), shift = lastNowTop - fly.getBoundingClientRect().top;
    const base = path.style.transform || "translateY(0px)";
    // Measure the landing spot before the path is moved back a step.
    flyChoice(pendingFly, fly, shift);
    // The path starts one step back, with your answer where this card's node was, at the end of the line from the
    // card; it steps up once the choice has landed. The spine and arcs are drawn for the end state, so they wait.
    path.animate([{ transform: `${base} translateY(${shift}px)` }, { transform: `${base} translateY(${shift}px)`, offset: 0.5 }, { transform: base }],
      { duration: MOVE_MS, easing: "cubic-bezier(.3,.7,.3,1)" });
    svg.querySelectorAll(".spine, .arc, .arc-head").forEach((l) => l.animate([{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }], { duration: MOVE_MS + 100 }));
    setTimeout(drawPath, MOVE_MS + 20);
  }
  pendingFly = null;
  lastNowTop = hood.querySelector(".row.now")?.getBoundingClientRect().top ?? null;
  for (const r of hood.querySelectorAll(".row:not(.past), .group-h, .next-h")) if (!before.has(r.dataset?.id ?? "")) r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
}
let pendingFly = null, lastNowTop = null;
const MOVE_MS = 700;
function flyChoice({ rect, text }, row, shift = 0) {
  const st = row.querySelector(".st"), r = st.getBoundingClientRect(), to = { right: r.right, top: r.top + shift };
  const chip = document.createElement("span");
  chip.className = "fly";
  chip.textContent = text;
  document.body.append(chip);
  const from = { x: rect.left, y: rect.top }, w = chip.offsetWidth;
  const end = { x: to.right - w, y: to.top - 3 };
  st.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1, offset: 0.55 }], { duration: MOVE_MS });
  row.querySelector(".node")?.animate([{ transform: "scale(1)" }, { transform: "scale(1)", offset: 0.35 }, { transform: "scale(1.35)", offset: 0.45 }, { transform: "scale(1)", offset: 0.6 }], { duration: MOVE_MS });
  // Along the line to the card: level with the node first, then into the answer's row beside it.
  const lineY = to.top - 8;
  chip.animate([
    { transform: `translate(${from.x}px, ${from.y}px) scale(1.2)`, opacity: 1 },
    { transform: `translate(${from.x - 40}px, ${lineY}px) scale(1)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 0, offset: 0.55 },
    { transform: `translate(${end.x}px, ${end.y}px) scale(.85)`, opacity: 0 },
  ], { duration: MOVE_MS, easing: "cubic-bezier(.3,.7,.3,1)" }).finished.then(() => chip.remove());
}

/**
 * Line the current node up with the card's question when there's room above it; otherwise start the path at the
 * top, so nothing you've answered is hidden. If that leaves the node below the card, fold the oldest answers into
 * the "earlier" line until it's level with the card again. The join is horizontal, into the card's side, either way.
 */
function alignPath() {
  const path = $("path"), hood = $("hood"), h1 = $("card").querySelector("h1");
  if (!path) return;
  path.style.transform = "";
  const now = path.querySelector(".row.now .node");
  if (!now || !h1 || $("card").style.display === "none") return;
  const card = $("card").getBoundingClientRect();
  for (let guard = 0; guard < 12; guard++) {
    path.style.transform = "";
    const first = path.firstElementChild.getBoundingClientRect().top, top = hood.getBoundingClientRect().top + 4;
    const target = h1.getBoundingClientRect().top + 17, at = now.getBoundingClientRect().top + now.offsetHeight / 2;
    const shift = Math.max(target - at, top - first);
    path.style.transform = `translateY(${Math.round(shift)}px)`;
    if (at + shift < card.bottom - 36) break;
    const oldest = path.querySelector(".row.past");
    if (!oldest) break;
    oldest.remove();
    let earlier = path.querySelector(".earlier");
    if (!earlier) { earlier = document.createElement("p"); earlier.className = "earlier"; earlier.dataset.n = "0"; path.prepend(earlier); }
    earlier.dataset.n = String(Number(earlier.dataset.n || 0) + 1);
    earlier.textContent = plural(Number(earlier.dataset.n), "earlier answer");
  }
}

/** The spine (solid through what you've answered, dotted through what's next), the arcs to earlier answers this
 * card is connected to, and the line into the card. Related decisions sit off the spine, with no line behind them. */
function drawPath() {
  const svg = $("path-lines"), desk = document.querySelector(".desk");
  if (!svg) return;
  const base = desk.getBoundingClientRect();
  svg.setAttribute("width", base.width); svg.setAttribute("height", base.height);
  const at = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }; };
  const q = (sel) => [...document.querySelectorAll(sel)];
  const past = q("#path .row.past .node"), nowEl = document.querySelector("#path .row.now .node"), ahead = q("#path .row.next .node");
  const out = [];
  // The spine is drawn between nodes, stopping short of each one, so nothing has to be painted over it: each node's
  // radius is its own drawn size (the ring for this card, the mark for the rest) plus a small gap.
  const radius = (el) => (el === nowEl ? 15 : (el.querySelector(".mk")?.getBoundingClientRect().height ?? 16) / 2) + 4;
  const segments = (nodes, cls) => {
    for (let i = 1; i < nodes.length; i++) {
      const a = at(nodes[i - 1]), b = at(nodes[i]), y1 = a.y + radius(nodes[i - 1]), y2 = b.y - radius(nodes[i]);
      if (y2 > y1 + 2) out.push(`<path class="spine ${cls}" d="M ${a.x} ${y1.toFixed(1)} V ${y2.toFixed(1)}"/>`);
    }
  };
  segments([...past, ...(nowEl ? [nowEl] : [])], "done");
  segments([...(nowEl ? [nowEl] : []), ...ahead], "ahead");
  if (nowEl) {
    const now = at(nowEl), card = $("card").getBoundingClientRect();
    out.push(`<path class="join" d="M ${now.x + 15} ${now.y} H ${card.left - base.left + 2}"/>`);
    // A link back to an earlier answer: an arc out to the right of the spine, coming into this card's ring from
    // above, so it never runs into the line to the card.
    for (const row of q("#path .row.past")) {
      const tag = row.querySelector(".tag.link");
      if (!tag) continue;
      const p = at(row.querySelector(".node")), r = radius(row.querySelector(".node")), cls = tag.classList.contains("c") ? "conflict" : "";
      const ex = now.x + 15 * Math.cos(-Math.PI / 3), ey = now.y + 15 * Math.sin(-Math.PI / 3);
      out.push(`<path class="arc ${cls}" data-id="${row.dataset.id}" d="M ${p.x + r} ${p.y} C ${p.x + 30} ${p.y}, ${ex + 18} ${ey - 26}, ${ex + 1} ${ey - 2}"/>`);
      out.push(`<path class="arc-head ${cls}" d="M ${ex + 1} ${ey - 2} l 2.5 -7.5 M ${ex + 1} ${ey - 2} l 7.2 -2.8"/>`);
    }
  }
  svg.innerHTML = out.join("");
}

/** Clicking a decision on the path or in the tray: a card to answer opens; an answered one reopens. */
function goTo(id) {
  if (mode === "write" || mode === "pass") return toast("Send or cancel your written answer first.", { ms: 2000 });
  if (id === current?.decision) return;
  if (answered.has(id)) return openReview(id);
  if (pending().includes(id)) return next(id);
}

// ------------------------------------------------------------------ the footer's rule, by rarity, and the reading time
let ruleKey = "";
const waitLeft = () => (current ? Math.max(0, DWELL[rarityName(current)] - (performance.now() - shownAt)) : 0);
const unlocked = () => Boolean(current) && waitLeft() === 0;
function tick() {
  const el = $("rule"), face = $("face");
  if (current && face) {
    const r = rarityName(current), left = mode === "live" ? waitLeft() : 0;
    face.style.setProperty("--read", String(DWELL[r] ? 1 - left / DWELL[r] : 1));
    if (el && mode === "live") {
      const who = current.agent;
      const after = humanFirst(current) ? `${needsHold(current) ? "Choose, then hold." : "You choose first."} ${who}'s pick shows after.` : "";
      const key = `${r}${left > 0 ? Math.ceil(left / 100) : "ok"}`;
      if (key !== ruleKey) {
        el.innerHTML = left > 0 ? `<b>Read it first:</b> ${(left / 1000).toFixed(1)}&nbsp;s` : after;
        ruleKey = key;
      }
      $("card").toggleAttribute("data-locked", left > 0);
    }
  }
  requestAnimationFrame(tick);
}
function refuse() {
  const el = $("rule");
  if (el) { el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge"); }
}

// ------------------------------------------------------------------ gestures: drag, two-finger swipe, keys
const s = { x: 0, y: 0, dragging: false, samples: [], anims: [], locked: false, wheelIdle: 0, wheelCooldown: 0 };
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
  card.style.setProperty("--pl", String(d === "left" ? Math.min(1, p) : hoverSide === "left" ? 0.5 : 0));
  card.style.setProperty("--pr", String(d === "right" ? Math.min(1, p) : hoverSide === "right" ? 0.5 : 0));
  card.querySelectorAll(".opt").forEach((o) => o.classList.toggle("armed", o.dataset.side === d && p >= 1));
  card.querySelectorAll(".foot [data-dir]").forEach((b) => b.classList.toggle("armed", b.dataset.dir === d && p >= 1));
  leanPath(d === "left" || d === "right" ? sides[d] : hoverSide ? sides[hoverSide] : null);
  drawPath();
}
/** While you lean toward an option, each related decision says what that option does to it. */
function leanPath(kind) {
  const hood = $("hood");
  hood.dataset.lean = kind ?? "";
  for (const row of hood.querySelectorAll(".row.rel[data-fx-proposal]")) {
    const text = kind ? row.dataset[`fx${kind === "proposal" ? "Proposal" : "Alternative"}`] : "";
    const bad = kind && row.dataset.bad.split(" ").includes(kind);
    row.classList.toggle("fx-good", Boolean(text) && !bad);
    row.classList.toggle("fx-bad", Boolean(bad));
    const tag = row.querySelector(".tag");
    tag.dataset.rest ??= tag.textContent;
    tag.textContent = text ? `${bad ? "✗" : "✓"} ${cap(text)}` : tag.dataset.rest;
  }
}
// The path's lines are measured from the layout, so redraw them whenever it changes: a resize, the web fonts
// arriving (they reflow every line of text), or the card or column changing size.
const relayout = () => { alignPath(); drawPath(); };
addEventListener("resize", relayout);
document.fonts?.ready.then(relayout);
document.fonts?.addEventListener?.("loadingdone", relayout);
new ResizeObserver(() => requestAnimationFrame(relayout)).observe(document.querySelector(".desk"));

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
    if (mode !== "live" || s.locked || e.button !== 0 || e.target.closest(".foot button, textarea, .reasoning")) return;
    stopAnims();
    card.setPointerCapture(e.pointerId);
    s.dragging = true; s.samples = [];
    const ox = e.clientX - s.x, oy = e.clientY - s.y, start = { x: e.clientX, y: e.clientY };
    const opt = e.target.closest(".opt");
    const move = (ev) => { s.x = ev.clientX - ox; s.y = ev.clientY - oy; sample(); render(); };
    const up = (ev) => {
      card.removeEventListener("pointermove", move); card.removeEventListener("pointerup", up); card.removeEventListener("pointercancel", up);
      // A press on an option without dragging is a click: choose it.
      if (opt && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) { s.dragging = false; settle(); hoverSide = null; return reach(opt.dataset.side); }
      release();
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
    card.addEventListener("pointercancel", up);
  };
  card.querySelectorAll(".opt").forEach((b) => {
    b.addEventListener("pointerenter", () => { if (mode === "live") { hoverSide = b.dataset.side; render(); } });
    b.addEventListener("pointerleave", () => { hoverSide = null; render(); });
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); reach(b.dataset.side); } });
  });
  card.querySelectorAll(".foot [data-dir]").forEach((b) => b.addEventListener("click", () => reach(b.dataset.dir)));
  $("why-btn")?.addEventListener("click", () => { showWhy = !showWhy; renderCard(); render(); });
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
  if (!s.dragging) { stopAnims(); s.dragging = true; s.samples = []; }
  s.x -= e.deltaX; s.y -= e.deltaY;
  sample(); render();
  clearTimeout(s.wheelIdle);
  s.wheelIdle = setTimeout(() => { s.wheelCooldown = performance.now() + 650; release(); }, 110);
}, { passive: false });

// ------------------------------------------------------------------ reveal, then confirm (human-first); mythic is held (D67)
let holdStart = 0, holdRaf = 0, keyHeld = null;
function openReveal(d, kind) { reveal = { d, kind }; mode = "reveal"; renderCard(); }
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
function backToLive() { reveal = null; mode = "live"; renderCard(); render(); }
function openWrite(d) { mode = d === "up" ? "write" : "pass"; renderCard(); }

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
  toast(`Sending to ${c.agent} in <span id="toast-secs">5</span>&nbsp;s.`, { undo: true, ms: UNDO_MS });
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
  const chosenEl = card.querySelector(`.opt[data-kind="${kind}"] h2`);
  pendingFly = chosenEl && (kind === "proposal" || kind === "alternative") ? { id: c.decision, rect: chosenEl.getBoundingClientRect(), text: c[kind].name } : null;
  if (!reduced) {
    // The top card leaves the pile toward the side you chose.
    const dx = { left: -130, right: 130 }[d] ?? 0, dy = { up: -40, down: 40 }[d] ?? 0;
    const out = card.animate([{ transform: card.style.transform || "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) rotate(${dx * 0.045}deg)`, opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" });
    await out.finished;
    card.style.opacity = 0; card.style.transform = "";
    out.cancel();
  }
  s.x = 0; s.y = 0; s.samples = []; s.locked = false; reveal = null;
  const news = c.practice ? "" : arrivals();
  if (c.practice) {
    mode = "practice"; renderCard(); renderAll(); renderHood();
    fadeIn(card);
    return;
  }
  scheduleSend(c);
  await next();
}

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
  $("pile-count").textContent = "";
}
let lastArea = null;
function arrive(card, from) {
  const area = areaIdOf(current.decision), changed = lastArea !== null && lastArea !== area;
  lastArea = area;
  card.style.opacity = 1;
  if (reduced) return;
  if (pendingFly) { card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 240, delay: 460, easing: "ease-out", fill: "backwards" }); return; }
  if (changed) {
    s.anims.push(animate($("deck"), { transform: ["translateX(60px)", "translateX(0px)"], opacity: [0, 1] }, { duration: 0.34, ease: [0.2, 0.9, 0.25, 1] }));
  } else if (from) {
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

// ------------------------------------------------------------------ moving between cards
async function next(id) {
  const ids = pending();
  mode = "live"; reveal = null; showWhy = false; s.x = 0; s.y = 0; hoverSide = null;
  if (!ids.length) {
    current = null;
    $("card").style.display = "none"; $("crumbs").style.visibility = "hidden"; $("pile").innerHTML = ""; $("pile-count").textContent = "";
    $("empty-recap").textContent = recap();
    $("empty").classList.add("on");
    renderHood(); renderAll();
    return;
  }
  const target = id && ids.includes(id) ? id : ids[0];
  const under = pileIds().indexOf(target);
  current = cardFor(target);
  freshIds.delete(target);
  showCard(under >= 0 ? messy(target, under + 1) : null);
}
function showCard(from = null) {
  const card = $("card");
  stopAnims(); s.x = 0; s.y = 0; s.dragging = false; keyHeld = null; hoverSide = null;
  card.style.display = ""; $("crumbs").style.visibility = "";
  $("empty").classList.remove("on");
  shownAt = performance.now();
  renderCard(); renderPile(); renderAll(); render();
  arrive(card, from);
  renderHood();
}
function openReview(id) {
  if (mode === "write" || mode === "pass") return toast("Send or cancel your written answer first.", { ms: 2000 });
  current = cardFor(id); mode = "review"; reveal = null;
  const a = answered.get(id);
  sides = a.side ? { [a.side]: a.verdict, [a.side === "left" ? "right" : "left"]: OTHER[a.verdict] } : sidesFor(current);
  renderCard(); renderPile(); renderHood(); renderAll();
  $("card").style.display = ""; $("card").style.opacity = 1; $("empty").classList.remove("on"); $("crumbs").style.visibility = "";
}
function recap() {
  const rows = [...answered.values()].filter((a) => !a.practice);
  const n = (v) => rows.filter((a) => a.verdict === v).length;
  const parts = [[n("proposal"), "took the agent's pick"], [n("alternative"), "chose the alternative"], [n("answer"), "wrote an answer"], [n("pass"), "couldn't judge"]].filter(([k]) => k).map(([k, t]) => `${k} ${t}`);
  if (!rows.length) return "";
  if (parts.length === 1) return `You answered ${plural(rows.length, "card")}, and ${parts[0].replace(/^\d+ /, "")} each time.`;
  return `You answered ${plural(rows.length, "card")}: ${listJoin(parts)}.`;
}

// ------------------------------------------------------------------ keys
addEventListener("keydown", (e) => {
  if (e.key === "Escape") return escape();
  if (mode === "write" || mode === "pass") { // typing goes to the answer; only Esc leaves it, and ⌘ Enter sends it
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("send")?.click(); }
    return;
  }
  if (e.target instanceof Element && e.target.closest("textarea, input")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "?") { togglePanel("keys"); return; }
  if (e.key === "Enter" && mode === "practice") { e.preventDefault(); next(); return; }
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
  // Holding an arrow leans the card that way; letting go chooses it.
  const lean = { right: [THRESH_X * 0.7, 0], left: [-THRESH_X * 0.7, 0], up: [0, -THRESH_Y * 0.5], down: [0, THRESH_Y * 0.5] }[d];
  springTo(lean[0], lean[1]);
});
addEventListener("keyup", (e) => {
  const d = { ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" }[e.key];
  if (!d || keyHeld !== d) return;
  keyHeld = null;
  if (mode === "reveal") { stopHold(); return; }
  if (mode !== "live" || !current || s.locked) return;
  reach(d);
});
addEventListener("click", (e) => {
  const b = e.target instanceof Element && e.target.closest("button");
  if (b && e.detail > 0) b.blur();
  if (!(e.target instanceof Element && e.target.closest(".menu-wrap"))) closeMenu();
});
function escape() {
  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  if (!$("menu").hidden) return closeMenu();
  for (const p of ["mirror", "keys"]) if ($(p).classList.contains("open")) return $(p).classList.remove("open");
  if (keyHeld && mode === "live") { keyHeld = null; settle(); return; }
  if (mode === "write" || mode === "pass" || mode === "reveal") return backToLive();
  if (mode === "review" || mode === "practice") return next();
}

// ------------------------------------------------------------------ the queue and the summary
function renderAll() { renderSummary(); }
function renderSummary() {
  const ids = pending(), stopped = ids.filter((id) => cardFor(id).blocking).length;
  $("summary").innerHTML = !ids.length ? "<b>Nothing to answer.</b>" : `<b>${ids.length} to answer.</b> ${stopped ? `<span class="stop-dot" aria-hidden="true"></span>${NUMBER[stopped] ?? stopped} ${stopped === 1 ? "agent has" : "agents have"} stopped for you.` : ""}`;
}

// ------------------------------------------------------------------ toast
let toastTimer = 0, toastTick = 0;
function toast(text, { undo: withUndo = false, ms = 3000 } = {}) {
  const t = $("toast");
  clearInterval(toastTick);
  t.innerHTML = `<span>${text}</span>${withUndo ? `<button class="undo" id="undo">Undo <kbd>Z</kbd></button><i class="timer" id="timer"></i>` : ""}`;
  t.classList.add("on");
  if (withUndo) {
    $("undo").addEventListener("click", undo);
    if (!reduced) animate($("timer"), { transform: ["scaleX(1)", "scaleX(0)"] }, { duration: ms / 1000, ease: "linear" });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), ms);
}

// ------------------------------------------------------------------ the menu: practice cards, calibration, keys
const closeMenu = () => { $("menu").hidden = true; $("menu-btn").setAttribute("aria-expanded", "false"); };
$("menu-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = $("menu").hidden;
  $("menu").hidden = !open; $("menu-btn").setAttribute("aria-expanded", String(open));
});
function togglePanel(id) {
  const open = !$(id).classList.contains("open");
  for (const p of ["mirror", "keys"]) $(p).classList.remove("open");
  if (open) (id === "mirror" ? renderMirror : renderKeys)();
  $(id).classList.toggle("open", open);
  closeMenu();
}
$("practice").addEventListener("click", () => {
  practiceOn = !practiceOn;
  $("practice").setAttribute("aria-checked", String(practiceOn));
  closeMenu();
  if (practiceOn) toast("Practice cards are on. Now and then one arrives among your real cards, and looks just like them.", { ms: 3600 });
  if (current?.practice && !practiceOn && mode === "live") next(); else renderAll();
});
$("calib").addEventListener("click", () => togglePanel("mirror"));
$("keys-btn").addEventListener("click", () => togglePanel("keys"));
function renderKeys() {
  $("keys").innerHTML = `<h4>Keyboard shortcuts</h4><dl>
    <dt><kbd>←</kbd><kbd>→</kbd></dt><dd>Choose an option. Hold to lean first; on mythic cards, hold to confirm.</dd>
    <dt><kbd>↑</kbd></dt><dd>Write an answer</dd><dt><kbd>↓</kbd></dt><dd>Say you can't judge it</dd>
    <dt><kbd>j</kbd><kbd>k</kbd></dt><dd>Next or previous card</dd><dt><kbd>Z</kbd></dt><dd>Undo, for 5 seconds</dd>
    <dt><kbd>Esc</kbd></dt><dd>Back one step</dd><dt><kbd>?</kbd></dt><dd>These shortcuts</dd></dl>
    <p class="sub" style="margin:12px 0 0">You can also drag the card, or swipe with two fingers.</p>`;
}
const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((p, q) => p - q); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
function renderMirror() {
  const rows = [...answered.values()];
  const byTier = (names) => median(rows.filter((r) => names.includes(r.rarity)).map((r) => r.dwell));
  const fmt = (ms) => (ms == null ? "none yet" : `${(ms / 1000).toFixed(1)} s`);
  const practice = rows.filter((r) => r.practice && r.caught !== null);
  const caught = CALIBRATION_BASELINE.canaries.caught + practice.filter((r) => r.caught).length;
  const of = CALIBRATION_BASELINE.canaries.of + practice.length;
  $("mirror").innerHTML = `<h4>Your calibration</h4>
    <p class="sub">Judged by what happened afterwards, not by how often you agreed with the agents.</p>
    <dl>
      <dt>Time spent</dt><dd>Median on mythic and rare cards ${fmt(byTier(["mythic", "rare"]))}; uncommon ${fmt(byTier(["uncommon"]))}; common ${fmt(byTier(["common"]))}.</dd>
      <dt>Practice cards</dt><dd>Caught ${caught} of ${of}, counting earlier sessions.</dd>
      <dt>Later reversed</dt><dd>${CALIBRATION_BASELINE.reverted.map((r) => `“${r.text}”: ${r.note}`).join("; ")}.</dd>
    </dl>
    <p class="both">Both directions count: one accept was later reversed (over-reliance), and you overturned ${CALIBRATION_BASELINE.heldUp} decisions that held up (under-reliance).</p>`;
}

$("again").addEventListener("click", () => { answered.clear(); next(); });

// ------------------------------------------------------------------ start
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
  async function answer(side = "right") {
    const id = current.decision, k = side === "left" ? "ArrowLeft" : "ArrowRight";
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
    log(`1b every card passes the filing check: ${CARDS.every((c) => !filingProblems(c).length)} (expected true); trigger and crux on the card: ${Boolean($("card").querySelector(".doing") && $("card").querySelector(".crux"))} (expected true)`);
    log(`1c the crux check catches a card that doesn't discriminate: ${filingProblems({ ...current, crux: { q: "x", proposal: "If yes", alternative: "if yes" } }).length === 1} (expected true)`);
    log(`2 agent's pick hidden: ${!text().includes("'s pick") || text().includes("pick shows after")} and no pick label: ${!$("card").querySelector(".pickof")} (expected true)`);
    log(`3 the path shows the rule it may conflict with: ${$("hood").textContent.includes("Never put secrets") && $("hood").textContent.includes("may conflict")} (expected true); stakes lead the card: ${$("card").querySelector(".stakes b").textContent.startsWith("Hard to undo")} (expected true)`);
    await tap("ArrowRight");
    log(`4 answered before reading: ${answered.has(first)} (expected false)`);
    await wait(waitLeft() + 100);
    log(`5 open after the wait: ${!$("card").hasAttribute("data-locked")} (expected true)`);
    key("ArrowRight", "keydown"); await wait(120);
    log(`6 holding → leans the right option: ${Number($("card").style.getPropertyValue("--pr")) > 0.3} (expected true)`);
    key("ArrowRight", "keyup"); await wait(250);
    log(`7 reveal in the card, with a hold (mythic): ${mode === "reveal" && Boolean($("hold"))} (expected true)`);
    key("ArrowRight", "keydown"); await wait(HOLD_MS + 200); key("ArrowRight", "keyup"); await wait(300);
    log(`8 held to confirm: ${answered.has(first)} (expected true); undo offered: ${Boolean($("undo"))} (expected true)`);
    key("z", "keydown"); await wait(200);
    log(`9 undo brings it back: ${!answered.has(first) && current.decision === first} (expected true)`);
    await answer("left");
    log(`10 answered again: ${answered.has(first)} (expected true)`);
    const second = current.decision;
    log(`11 a card with a stopped agent comes next: ${byDecision(second).short}, blocking: ${current.blocking} (expected true)`);
    await wait(waitLeft() + 100);
    await tap("ArrowDown");
    log(`12 "can't judge" keeps the pick hidden: ${mode === "pass" && !$("card").querySelector(".pickof")} (expected true)`);
    key("Escape", "keydown"); await wait(150);
    key("ArrowLeft", "keydown"); await wait(150);
    log(`12b leaning ← on the conflict card lights one kept and one replaced: ${$("hood").querySelectorAll(".row.fx-good").length === 1 && $("hood").querySelectorAll(".row.fx-bad").length === 1} (expected true)`);
    key("Escape", "keydown"); await wait(150);
    await tap("ArrowDown");
    key("Escape", "keydown"); await wait(150);
    await answer("left");
    log(`13 rare confirmed by pressing again: ${answered.has(second)} (expected true)`);
    log(`14 a late card arrived after two answers, marked new on the path: ${queue().includes("B-t3rel") && /new\s*Relative times/.test($("hood").textContent)} (expected true)`);
    log(`14b the path holds the two answers, oldest first: ${[...$("hood").querySelectorAll(".row.past")].map((r) => r.dataset.id).join() === [...answered.keys()].join()} (expected true)`);
    log(`15 the next card didn't arrive leaning: ${s.x === 0 && Number($("card").style.getPropertyValue("--pr") || 0) === 0} (expected true)`);
    const third = current.decision;
    log(`16 third card: ${byDecision(third).short} (${rarityName(current)}); its pick labelled: ${Boolean($("card").querySelector(".pickof"))} (expected true)`);
    await tap("ArrowUp");
    log(`17 write opens in the card, focused: ${mode === "write" && document.activeElement === $("txt")} (expected true)`);
    key("k", "keydown", $("txt")); await wait(150);
    log(`18 typing k doesn't switch cards: ${current.decision === third} (expected true)`);
    key("Escape", "keydown"); await wait(150);
    $("why-btn").click(); await wait(50);
    log(`19 the agent's reasoning opens on request: ${Boolean($("reasoning"))} (expected true)`);
    await answer("right");
    log(`20 third answered: ${answered.get(third)?.verdict} (expected proposal)`);
    await answer("right");
    $("practice").click(); await wait(100);
    const pid = CARDS.find((c) => c.practice).decision;
    log(`21 practice card waits to arrive: ${!queue().includes(pid)} (expected true)`);
    await answer("right"); await wait(100);
    log(`22 then arrives in the queue: ${queue().includes(pid)} (expected true)`);
    await next(pid);
    await answer("right");
    log(`23 practice result shown in the card: ${mode === "practice" && answered.get(pid)?.caught === false} (expected true)`);
    key("Enter", "keydown"); await wait(150);
    log(`24 Enter continues: ${mode === "live" || !current} (expected true)`);
    $("calib").click(); await wait(50);
    log(`25 calibration: ${$("mirror").textContent.includes("Caught 3 of 5")} (expected true)`);
    key("Escape", "keydown");
    openReview(first); await wait(100);
    log(`26 a reopened card: ${mode === "review" && Boolean($("change"))} (expected true)`);
    log(`27 the reopened card shows on the path with the others: ${$("hood").querySelectorAll(".row.past").length >= 3} (expected true)`);
    key("Escape", "keydown"); await wait(300);
    log(`28 the path joins the card: ${Boolean($("path-lines").querySelector(".join"))} (expected true)`);
    const pre = document.createElement("pre"); pre.id = "selftest"; pre.textContent = out.join("\n"); pre.hidden = true; document.body.appendChild(pre);
  })();
}
