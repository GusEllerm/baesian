// The desk: the drum beside the card being answered. The card, the keys, the hold, the undo window and the toast,
// as the client has them (client/src/Desk.tsx, Card.tsx), simplified; the drum is drum.js.
import { CARDS, ANSWERED, STAKES } from "../data.js";
import { createReel } from "./drum.js";
import { markSvg } from "./marks.js";

const HOLD_MS = 900;
const UNDO_MS = 5000;
/** How long the drum stays where you spun it, at rest, before it turns back to the card in play. */
const DWELL_MS = 2200;
/** ...or this long after the pointer leaves it. */
const DWELL_AWAY_MS = 650;
const SIDES = { left: "a", right: "b" };
const ARROW = { left: "←", right: "→" };

const answers = [...ANSWERED];
let mode = { kind: "live" };
let reviewing; // the index of a row you've opened, if any
let lastAnswer; // { at } for Z
let leanSide;
let holdStart;
let holdRaf = 0;
// The row drawn as the card in play: it becomes the new one as the drum turns it to the front, not before.
let shownFront = ANSWERED.length;
let freshRow; // the row just answered, whose "you chose" fades in

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const front = () => answers.length;
const home = () => reviewing ?? front();
const ordinal = (n) => ["", "next", "second", "third", "fourth"][n] ?? `${n}th`;

// ---------------------------------------------------------------- the drum's rows
function row(i) {
  const f = front();
  if (i === -1) return { kind: "end", title: "Start of this session", state: "", down: "solid" };
  if (i === CARDS.length) return { kind: "end", title: f === CARDS.length ? "All caught up" : "Nothing more in the queue", state: "", up: f >= CARDS.length ? "solid" : "dot" };
  const c = CARDS[i];
  if (!c) return { kind: "blank" };
  if (i < f) return { kind: "past", title: c.title, state: `you chose “${c[answers[i]].name}”`, rarity: c.rarity, up: "solid", down: "solid", ...(i === freshRow ? { fresh: true } : {}) };
  if (i === f && shownFront === f) return { kind: "now", title: c.title, state: c.stopped ? `${c.agent} stopped` : "in play", rarity: c.rarity, stopped: c.stopped, up: "solid", down: "dot" };
  return { kind: "next", title: c.title, state: i === (shownFront === f ? f + 1 : f) ? "next" : "", rarity: c.rarity, stopped: c.stopped, up: i === f ? "solid" : "dot", down: "dot" };
}

const reelEl = $("reel");
const reel = createReel(reelEl, {
  count: Math.max(CARDS.length, front() + 1),
  front: front(),
  row,
  onHand: () => {
    lastSpinAt = performance.now();
    spunByKey = false;
    scheduleReturn();
  },
  onLetGo: () => {
    lastSpinAt = performance.now();
    scheduleReturn();
  },
  onAim: () => updateAim(),
  onNear: (n) => {
    if (n === front() && shownFront !== front()) {
      shownFront = front();
      reel.refresh();
    }
  },
  onPick: (i) => openRow(i),
});
reelEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") spunByKey = true;
});

// ---------------------------------------------------------------- the return to the front
let lastSpinAt = 0;
let spunByKey = false;
let leftAt = 0;
let hovering = false;
let returnTimer = 0;
reelEl.addEventListener("pointerenter", () => (hovering = true));
reelEl.addEventListener("pointerleave", () => {
  hovering = false;
  leftAt = performance.now();
  scheduleReturn();
});
reelEl.addEventListener("blur", () => spunByKey && scheduleReturn());
function scheduleReturn() {
  clearTimeout(returnTimer);
  returnTimer = setTimeout(checkReturn, 120);
}
function checkReturn() {
  updateAim();
  if (reel.held || !reel.resting) return scheduleReturn();
  if (reel.aim === home()) return;
  // Spun with the keys: it stays while the drum has focus (Esc turns it back).
  if (spunByKey && document.activeElement === reelEl) return;
  const now = performance.now();
  const since = Math.max(lastSpinAt, reel.restedAt ?? 0);
  const due = hovering ? since + DWELL_MS : Math.min(since + DWELL_MS, Math.max(leftAt, since) + DWELL_AWAY_MS);
  if (now < due) {
    clearTimeout(returnTimer);
    returnTimer = setTimeout(checkReturn, Math.min(200, due - now + 10));
    drainAt(due);
    return;
  }
  turnHome();
}
function turnHome() {
  clearTimeout(returnTimer);
  reel.turnTo(home(), "return", () => updateAim());
  updateAim();
}

// The chip under the pawl while the drum points elsewhere: what Enter would open, and a line running down to the return.
let drainDue = 0;
function drainAt(due) {
  if (Math.abs(due - drainDue) < 30) return;
  drainDue = due;
  const d = $("drain");
  d.getAnimations().forEach((a) => a.cancel());
  if (reduced()) return;
  d.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: Math.max(0, due - performance.now()), easing: "linear", fill: "forwards" });
}
function updateAim() {
  const aim = reel.aim;
  const off = aim !== home() && CARDS[aim] !== undefined;
  const chip = $("aim-chip");
  chip.hidden = !off;
  $("reel-hint").hidden = off;
  reelEl.dataset.off = off ? "1" : "";
  $("join").classList.toggle("loose", aim !== home());
  if (off) {
    $("aim-name").textContent = aim === front() ? "the card in play" : `“${CARDS[aim].title}”`;
    if (!reel.resting || reel.held) {
      drainDue = 0;
      $("drain").getAnimations().forEach((a) => a.cancel());
    }
  }
}

// ---------------------------------------------------------------- opening a row you've spun to
function openRow(i) {
  if (!CARDS[i]) return;
  clearTimeout(returnTimer);
  const from = home();
  if (i === front()) {
    if (reviewing === undefined) return reel.turnTo(i, "return", () => updateAim());
    reviewing = undefined;
  } else reviewing = i;
  reel.turnTo(i, "return", () => updateAim());
  renderCard(i < from ? "down" : "up");
  updateAim();
}
function closeReview() {
  if (reviewing === undefined) return;
  const from = reviewing;
  reviewing = undefined;
  reel.turnTo(front(), "return", () => updateAim());
  renderCard(front() < from ? "down" : "up");
  updateAim();
}

// ---------------------------------------------------------------- the card
function renderCard(enter) {
  const cardEl = $("card");
  const i = home();
  const c = CARDS[i];
  if (!c) {
    cardEl.className = "card done";
    cardEl.innerHTML = `<div class="face"><p class="big">All caught up.</p><p>You answered every card in the queue this session. <kbd>Z</kbd> takes the last one back for a few seconds.</p></div>`;
    return swap(cardEl, enter);
  }
  const past = i < front();
  const ahead = i > front();
  const chosen = past ? answers[i] : mode.kind === "reveal" && !reviewing ? mode.option : undefined;
  const live = !past && !ahead && mode.kind === "live";
  const showPick = chosen !== undefined;
  const opt = (side) => {
    const k = SIDES[side], o = c[k];
    const cls = chosen ? (chosen === k ? " chosen" : " unchosen") : "";
    return `<button type="button" class="opt${cls}" data-side="${side}" ${live ? "" : 'tabindex="-1"'} ${past || ahead ? "disabled" : ""}>
      ${live ? `<kbd class="key">${ARROW[side]}</kbd>` : ""}
      <span class="ifans">${esc(o.if)}</span>
      <h2>${esc(o.name)}</h2>
      <p class="then">then ${esc(o.then)}</p>
      ${showPick && c.pick === k ? `<span class="pickof">${esc(c.agent)}'s pick</span>` : ""}
    </button>`;
  };
  let banner = "";
  if (past) banner = `<p class="banner"><span>Answered earlier this session. Read-only.</span><button type="button" class="back" data-act="back">Back to the card in play <kbd>Esc</kbd></button></p>`;
  if (ahead) banner = `<p class="banner ahead"><span>Coming up, ${ordinal(i - front())} after the card in play. Read-only.</span><button type="button" class="back" data-act="back">Back to the card in play <kbd>Esc</kbd></button></p>`;
  let lower = "";
  if (past) {
    lower = `<div class="panel-in"><p class="verdict">You chose <b>${esc(c[answers[i]].name)}</b>. ${esc(c.agent)} ${c.pick === answers[i] ? "picked the same." : `picked <b>${esc(c[c.pick].name)}</b>.`}</p></div>`;
  } else if (ahead) {
    lower = `<div class="foot"><span class="rule">Its options open when it comes to the front. ${esc(c.agent)}'s pick shows after you choose.</span></div>`;
  } else if (mode.kind === "reveal") {
    const side = mode.side, same = c.pick === mode.option;
    lower = `<div class="panel-in">
      <p class="verdict">You chose <b>${esc(c[mode.option].name)}</b>. ${esc(c.agent)} ${same ? "picked the same." : `picked <b>${esc(c[c.pick].name)}</b>.`}</p>
      <div class="reveal-row">
        ${c.rarity === "mythic"
          ? `<button type="button" class="hold" data-act="hold"><span class="fill" id="hold-fill"></span><span>Hold <kbd>${ARROW[side]}</kbd> to confirm</span></button>`
          : `<button type="button" class="confirm" data-act="confirm">Confirm <kbd>${ARROW[side]}</kbd></button>`}
        <button type="button" class="switch" data-act="unchoose">Back <kbd>Esc</kbd></button>
      </div>
    </div>`;
  } else {
    lower = `<div class="foot"><span class="rule">${c.rarity === "mythic" ? "Choose, then hold." : "You choose first."} ${esc(c.agent)}'s pick shows after.</span><span class="keys"><kbd>←</kbd> or <kbd>→</kbd> chooses, the same key confirms</span></div>`;
  }
  cardEl.className = `card rarity-${c.rarity}${past || ahead ? " review" : ""}`;
  cardEl.dataset.mode = past || ahead ? "review" : mode.kind;
  cardEl.dataset.lean = leanSide ?? "";
  cardEl.innerHTML = `<div class="frame"></div><div class="face">
    ${banner}
    <p class="stakes"><span class="rmark" title="${c.rarity}">${markSvg(c.rarity, 22)}</span><b>${esc(STAKES[c.rarity])}</b>${c.stopped && !past ? `<span class="stopped">${esc(c.agent)} stopped</span>` : ""}</p>
    <p class="doing"><b>${esc(c.agent)}</b> is ${esc(c.doing)}</p>
    <h1>${esc(c.question)}</h1>
    <div class="crux"><p><span class="lbl">It turns on</span> ${esc(c.crux)}</p><p class="fact">${esc(c.fact)}</p></div>
    <div class="options">${opt("left")}${opt("right")}</div>
    ${lower}
  </div>`;
  swap(cardEl, enter);
}
function swap(cardEl, enter) {
  if (!enter || reduced()) return;
  const dy = enter === "up" ? 26 : -26;
  cardEl.animate(
    [
      { transform: `translateY(${dy}px)`, opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { duration: 380, easing: "cubic-bezier(.2,.8,.25,1)", delay: 70, fill: "backwards" },
  );
}
$("card").addEventListener("click", (e) => {
  const t = e.target instanceof Element ? e.target : null;
  const act = t?.closest("[data-act]")?.dataset.act;
  if (act === "back") return closeReview();
  if (act === "confirm") return confirmAnswer();
  if (act === "unchoose") return unchoose();
  const opt = t?.closest(".opt");
  if (opt && mode.kind === "live" && reviewing === undefined) choose(opt.dataset.side);
});
$("card").addEventListener("pointerdown", (e) => {
  if (e.target instanceof Element && e.target.closest('[data-act="hold"]')) beginHold();
});
$("card").addEventListener("pointerup", () => endHold());
$("card").addEventListener("pointerleave", () => endHold());

// ---------------------------------------------------------------- answering
function choose(side) {
  if (!CARDS[front()]) return;
  if (reel.aim !== front()) turnHome();
  mode = { kind: "reveal", side, option: SIDES[side] };
  leanSide = undefined;
  renderCard();
}
function unchoose() {
  mode = { kind: "live" };
  renderCard();
}
function confirmAnswer() {
  if (mode.kind !== "reveal") return;
  // The key that confirmed is still down: its release mustn't choose on the next card.
  keyHeld = undefined;
  const c = CARDS[front()];
  answers.push(mode.option);
  const name = c[mode.option].name;
  mode = { kind: "live" };
  lastAnswer = { at: Date.now() };
  freshRow = front() - 1;
  reel.refresh(Math.max(CARDS.length, front() + 1));
  reel.turnTo(front(), "answer", landed);
  renderCard("up");
  toast(`You chose “${name}”.`, Date.now() + UNDO_MS);
  summary();
}
function undo() {
  if (!lastAnswer || Date.now() - lastAnswer.at > UNDO_MS) return;
  lastAnswer = undefined;
  answers.pop();
  mode = { kind: "live" };
  reviewing = undefined;
  freshRow = undefined;
  reel.refresh(Math.max(CARDS.length, front() + 1));
  reel.turnTo(front(), "answer", landed);
  renderCard("down");
  toast("Undone. The card is back.");
  summary();
}
/** A turn has landed: the row at the front is the card in play, drawn so. */
function landed() {
  if (shownFront !== front()) {
    shownFront = front();
    reel.refresh();
  }
  updateAim();
}
function beginHold() {
  if (mode.kind !== "reveal" || holdStart !== undefined) return;
  holdStart = performance.now();
  const tick = () => {
    if (holdStart === undefined) return;
    const k = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
    const fill = $("hold-fill");
    if (fill) fill.style.width = `${k * 100}%`;
    if (k >= 1) {
      holdStart = undefined;
      return confirmAnswer();
    }
    holdRaf = requestAnimationFrame(tick);
  };
  holdRaf = requestAnimationFrame(tick);
}
function endHold() {
  if (holdStart === undefined) return;
  holdStart = undefined;
  cancelAnimationFrame(holdRaf);
  const fill = $("hold-fill");
  if (fill) fill.style.width = "0%";
  toast("Keep holding until the bar fills.");
}

// ---------------------------------------------------------------- keys
let keyHeld;
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "z" || e.key === "Z") return undo();
  if (e.key === "Escape") {
    if (reviewing !== undefined) return closeReview();
    if (mode.kind === "reveal") return unchoose();
    if (reel.aim !== home()) return turnHome();
    return;
  }
  if (e.key === "Enter") {
    if (e.target instanceof Element && e.target.closest("button:not(.plate)") && e.target !== reelEl) return;
    const aim = reel.aim;
    if (aim !== home() && CARDS[aim]) {
      e.preventDefault();
      openRow(aim);
    }
    return;
  }
  const side = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : undefined;
  if (!side) return;
  e.preventDefault();
  if (e.repeat) return;
  if (reviewing !== undefined) {
    const back = document.querySelector(".banner .back");
    back?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 260 });
    return;
  }
  if (!CARDS[front()]) return;
  if (reel.aim !== front()) turnHome();
  // Answering is the card's: the drum gives up the focus it took for spinning.
  if (document.activeElement === reelEl) reelEl.blur();
  if (mode.kind === "reveal") {
    if (side !== mode.side) return choose(side);
    keyHeld = side;
    return CARDS[front()].rarity === "mythic" ? beginHold() : confirmAnswer();
  }
  // Holding an arrow leans toward that option; letting go chooses it.
  keyHeld = side;
  leanSide = side;
  $("card").dataset.lean = side;
});
addEventListener("keyup", (e) => {
  const side = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : undefined;
  if (!side || keyHeld !== side) return;
  keyHeld = undefined;
  if (mode.kind === "reveal") return endHold();
  if (mode.kind === "live" && reviewing === undefined) choose(side);
});

// ---------------------------------------------------------------- the toast, the summary, the line to the card
let toastTimer = 0;
function toast(text, undoUntil) {
  const t = $("toast");
  clearTimeout(toastTimer);
  t.hidden = false;
  t.innerHTML = `<span>${esc(text)}</span>${undoUntil ? `<button type="button" class="undo">Undo <kbd>Z</kbd></button><span class="timer"></span>` : ""}`;
  t.querySelector(".undo")?.addEventListener("click", undo);
  const timer = t.querySelector(".timer");
  if (timer && !reduced()) timer.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: undoUntil - Date.now(), fill: "forwards" });
  toastTimer = setTimeout(() => (t.hidden = true), undoUntil ? undoUntil - Date.now() + 150 : 2400);
}
function summary() {
  const left = CARDS.length - front();
  const stopped = CARDS.slice(front()).filter((c) => c.stopped).length;
  $("summary").innerHTML = left ? `<b>${left}</b> to answer${stopped ? ` · <i class="stop-dot"></i>${stopped} agent${stopped > 1 ? "s" : ""} stopped` : ""} · <b>${front()}</b> answered this session` : `All caught up · <b>${front()}</b> answered this session`;
}
function drawJoin() {
  const desk = $("desk").getBoundingClientRect();
  const pin = reel.pinRect();
  const card = $("card").getBoundingClientRect();
  const y = Math.round(pin.top + pin.height / 2 - desk.top) + 0.5;
  const x1 = pin.left + pin.width / 2 - desk.left;
  $("join").setAttribute("width", String(desk.width));
  $("join").setAttribute("height", String(desk.height));
  $("join-line").setAttribute("d", `M ${x1.toFixed(1)} ${y} H ${(card.left - desk.left + 1).toFixed(1)}`);
}
/** Line the card's question up with the drum's front, once: the drum is an object; it doesn't move to suit a card. */
function align() {
  const pin = reel.pinRect();
  const stage = $("stage");
  stage.style.paddingTop = "0px";
  const h1 = $("card").querySelector("h1");
  if (!h1) return drawJoin();
  const r = h1.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(h1).lineHeight) || 34;
  stage.style.paddingTop = `${Math.max(0, Math.round(pin.top + pin.height / 2 - (r.top + line / 2)))}px`;
  drawJoin();
}

summary();
renderCard();
document.fonts.ready.then(() => {
  align();
  updateAim();
});
addEventListener("resize", align);
align();

// For the screenshots: a handle on the state, nothing more.
window.__c = { reel, get front() { return front(); }, get reviewing() { return reviewing; } };
