// Direction A, a real reel: the desk. The card in play, its keys (← or → to choose, the same key to confirm, held on
// a mythic card; Esc back; Z to undo within five seconds), and the drum beside it, turned a step for each answer.
import { CARDS, ANSWERED, MARKS, MARK_INK, STAKES } from "../data.js";
import { Drum, LEN, STEP } from "./drum.js";

const UNDO_MS = 5000, HOLD_MS = 900;
const CARD_W = 640;
/** From the drum's right end to the card: room for the end you can see, the pawl and the payline. */
const GAP = 132;
const reducedQ = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => reducedQ.matches;
const $ = (id) => document.getElementById(id);
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ARROW = { left: "←", right: "→" };
/** Which option is on which side. */
const SIDES = { left: "a", right: "b" };
const sideOf = (k) => (k === "a" ? "left" : "right");

const state = { answers: [...ANSWERED], mode: { kind: "live" }, undo: undefined, hold: undefined };
const current = () => state.answers.length;

const drum = new Drum({ scene: $("scene"), drum: $("drum"), over: $("over"), cast: $("cast") });

function mark(kind, size, { answered = false, stopped = false } = {}) {
  const [fill, stroke] = MARK_INK[kind];
  return `<svg class="mk" width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${MARKS[kind]}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>${
    answered ? `<circle cx="5" cy="4.6" r="3.6" fill="#3f8f5a"/><path d="M3.3 4.7 L4.6 6 L6.8 3.4" stroke="#fff" stroke-width="1.2" fill="none"/>` : ""
  }${stopped ? `<circle cx="5.2" cy="-4.8" r="3.3" fill="#8E3A5F" stroke="#F0E4BE" stroke-width="1"/>` : ""}</svg>`;
}

/** What's printed round the drum, by position on the path. `arriving`: the card coming to the front still looks
 *  like a next one, until the drum has brought it there. */
function rows({ arriving = false } = {}) {
  const out = new Map();
  const cur = current();
  out.set(-1, { cls: "start", html: `<span class="note">This session</span>` });
  CARDS.forEach((c, i) => {
    const lbl = (st, cls = "") => `<span class="lbl"><span class="nm">${esc(c.title)}</span>${st ? `<span class="st ${cls}">${esc(st)}</span>` : ""}</span>`;
    if (i < cur) {
      const ch = state.answers[i];
      const st = `you chose “${c[ch].name}”${ch !== c.pick ? `, not ${c.agent}'s pick` : ""}`;
      out.set(i, { cls: "past", html: lbl(st) + `<span class="node">${mark(c.rarity, 22, { answered: true })}</span>` });
    } else if (i === cur && !arriving) {
      out.set(i, { cls: "now", html: lbl(c.stopped ? `${c.agent} has stopped for you` : `${c.agent} is ${c.doing}`, c.stopped ? "" : "calm") + `<span class="node">${mark(c.rarity, 20, { stopped: c.stopped })}</span>` });
    } else {
      out.set(i, { cls: "next", html: lbl(c.stopped ? `${c.agent} has stopped` : "") + `<span class="node">${mark(c.rarity, 20, { stopped: c.stopped })}</span>` });
    }
  });
  out.set(CARDS.length, { cls: "end", html: `<span class="note">That's every card</span>` });
  return out;
}

function printDrum(opts = {}) {
  drum.print(rows(opts));
  const cur = current();
  // The count is of the drum as it stands: while it turns to an answer, the one before.
  const at = opts.arriving ? Math.round(drum.pos) : cur;
  // Answers turned over the top, out of sight: counted above the drum.
  const over = Math.max(0, at - Math.floor(84 / STEP));
  const top = drum.top;
  drum.extra = over ? `<text class="count" x="${top.x.toFixed(1)}" y="${(top.y - 14).toFixed(1)}" text-anchor="middle">${over} earlier ${over === 1 ? "answer" : "answers"}, over the top</text>` : "";
  drum.drawOver();
  $("sr").innerHTML = CARDS.map((c, i) => `<li>${esc(c.title)}: ${i < cur ? `you chose ${esc(c[state.answers[i]].name)}` : i === cur ? "in play" : "next"}</li>`).join("");
}

// ------------------------------------------------------------ the card

function cardHtml(c) {
  const m = state.mode;
  const reveal = m.kind === "reveal";
  const chosen = reveal ? SIDES[m.side] : undefined;
  const opt = (side) => {
    const k = SIDES[side], o = c[k];
    const cls = reveal ? (k === chosen ? " chosen" : " unchosen") : "";
    return `<button type="button" class="opt${cls}" data-side="${side}" aria-label="Choose ${esc(o.name)}">
      ${reveal ? "" : `<kbd class="key" aria-hidden="true">${ARROW[side]}</kbd>`}
      <span class="ifans">${esc(o.if)}</span><h2>${esc(o.name)}</h2><p class="then">then ${esc(o.then)}</p>
      ${reveal && k === c.pick ? `<span class="pickof">${esc(c.agent)}'s pick</span>` : ""}</button>`;
  };
  let tail;
  if (!reveal) {
    tail = `<div class="foot"><span class="rule">${c.rarity === "mythic" ? "Choose, then hold." : "You choose first."} ${esc(c.agent)}'s pick shows after.</span>
      <span class="k"><kbd>↑</kbd> Other answer</span><span class="k"><kbd>↓</kbd> Can't judge</span></div>`;
  } else {
    const same = chosen === c.pick;
    const key = ARROW[m.side];
    tail = `<div class="panel-in"><p class="verdict">You chose <b>${esc(c[chosen].name)}</b>. ${esc(c.agent)} ${same ? "picked the same." : `picked <b>${esc(c[c.pick].name)}</b>.`}</p>
      ${
        c.rarity === "mythic"
          ? `<button type="button" class="hold" data-act="hold"><span class="fill"></span><span>Hold <kbd>${key}</kbd> or click and hold to confirm</span></button>`
          : `<button type="button" class="confirm" data-act="confirm">Confirm “${esc(c[chosen].name)}” <kbd>${key}</kbd></button>`
      }
      <p class="small">Esc goes back to the choice; ${m.side === "left" ? "→" : "←"} chooses the other.</p></div>`;
  }
  return `<article class="card rarity-${c.rarity}" data-mode="${m.kind}" data-id="${c.id}"><div class="face">
    <p class="stakes"><span class="rmark" title="${c.rarity}">${mark(c.rarity, 22)}</span><b>${STAKES[c.rarity]}</b>${c.stopped ? `<span class="stopped">${esc(c.agent)} stopped</span>` : ""}</p>
    <p class="doing"><b>${esc(c.agent)}</b> is ${esc(c.doing)}</p>
    <h1>${esc(c.question)}</h1>
    <div class="crux"><p><span class="lbl">It turns on</span>${esc(c.crux)}</p><p class="fact">${esc(c.fact)}</p></div>
    <div class="options">${opt("left")}${opt("right")}</div>
    ${tail}
  </div></article>`;
}

function emptyHtml() {
  return `<article class="card"><div class="face"><div class="empty"><p class="big">Nothing to answer.</p><p class="small">Every card this session has a verdict. Z undoes the last one, for a few seconds.</p></div></div></article>`;
}

/** The stage: the pile of cards still to come under the one in play. */
function renderStage() {
  const c = CARDS[current()];
  const left = CARDS.length - current() - 1;
  const pile = [];
  for (let i = Math.min(2, Math.max(0, left)); i >= 1; i--) pile.push(`<div class="under" style="--r:${i === 1 ? -1.1 : 1.4}deg;--dx:${i === 1 ? 5 : -4}px;--dy:${i * 6}px;z-index:${10 - i}"></div>`);
  $("stage").innerHTML = `<div class="deck"><div class="pile" aria-hidden="true">${pile.join("")}</div>${c ? cardHtml(c) : emptyHtml()}</div><span class="socket" style="top:${drum.cy - cardTop}px"></span>`;
}
function rerenderCard() {
  const c = CARDS[current()];
  const old = $("stage").querySelector(".deck > .card:not(.leaving)");
  if (!old || !c) return renderStage();
  old.outerHTML = cardHtml(c);
}

/** A tween on the clock that drives the drum, so a frame of the card and a frame of the drum always agree. */
function tween(ms, f, done) {
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    f(p);
    if (p < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}
const easeIn = (p) => p * p * p;
const easeOut = (p) => 1 - (1 - p) ** 3;

/** The card in play leaves the way the drum turns (up, for an answer; down, for an undo), and the next one comes. */
function swapCard(dir) {
  const deck = $("stage").querySelector(".deck");
  const old = deck?.querySelector(".card:not(.leaving)");
  if (reduced() || !old) return renderStage();
  const ghost = old.cloneNode(true);
  ghost.classList.add("leaving");
  renderStage();
  const nd = $("stage").querySelector(".deck");
  const fresh = nd.querySelector(".card");
  nd.append(ghost);
  const s = dir === "up" ? -1 : 1;
  tween(200, (p) => {
    const e = easeIn(p);
    ghost.style.transform = `translateY(${s * 46 * e}px) rotateX(${-s * 7 * e}deg)`;
    ghost.style.opacity = String(1 - e);
  }, () => ghost.remove());
  fresh.style.opacity = "0";
  // It arrives as the drum clicks home (about 280 ms in), so the card and the drum land together.
  setTimeout(() => {
    tween(230, (p) => {
      const e = easeOut(p);
      fresh.style.transform = `translateY(${-s * 34 * (1 - e)}px)`;
      fresh.style.opacity = String(e);
    }, () => { fresh.style.transform = ""; fresh.style.opacity = ""; });
  }, 70);
}

// ------------------------------------------------------------ answering

function choose(side) {
  if (!CARDS[current()]) return;
  state.mode = { kind: "reveal", side };
  rerenderCard();
}
function back() {
  state.mode = { kind: "live" };
  rerenderCard();
}
function confirm() {
  const i = current(), c = CARDS[i];
  if (!c || state.mode.kind !== "reveal") return;
  const k = SIDES[state.mode.side];
  state.answers.push(k);
  state.mode = { kind: "live" };
  state.undo = { until: performance.now() + UNDO_MS };
  showToast(`You chose “${c[k].name}”.`, true);
  swapCard("up");
  turn();
}
function undo() {
  if (!state.undo || performance.now() > state.undo.until) return;
  state.answers.pop();
  state.undo = undefined;
  state.mode = { kind: "live" };
  showToast("Undone. The card is back.");
  swapCard("down");
  turn();
}
/** The drum turns to the card now in play. The answer is printed on its row at once; the arriving row lights up
 *  as a current one only once it's at the front. */
function turn() {
  summary();
  if (reduced()) {
    printDrum();
    drum.turnTo(current(), true);
    return;
  }
  printDrum({ arriving: true });
  drum.turnTo(current());
}
drum.onNotch(() => click());
drum.onLand(() => {
  if (Math.round(drum.target) === current()) printDrum();
});

// The click, if you want to hear it (S): a short knock as the pawl drops into the notch. Off to begin with.
let audio, sound = false;
function click() {
  if (!sound || !audio) return;
  const t = audio.currentTime;
  const len = Math.floor(audio.sampleRate * 0.03);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.004));
  const src = audio.createBufferSource();
  src.buffer = buf;
  const bp = audio.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 1.4;
  const g = audio.createGain();
  g.gain.value = 0.5;
  src.connect(bp).connect(g).connect(audio.destination);
  src.start(t);
  const o = audio.createOscillator(), og = audio.createGain();
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
  og.gain.setValueAtTime(0.25, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(og).connect(audio.destination);
  o.start(t);
  o.stop(t + 0.1);
}
function toggleSound() {
  sound = !sound;
  audio ??= new AudioContext();
  $("sound").textContent = sound ? "on" : "off";
}

// The hold, on a mythic card: the bar fills over HOLD_MS; letting go early starts again.
function beginHold() {
  if (state.hold) return;
  const t0 = performance.now();
  state.hold = { t0 };
  const step = (t) => {
    if (!state.hold || state.hold.t0 !== t0) return;
    const p = Math.min(1, (t - t0) / HOLD_MS);
    const fill = $("stage").querySelector(".card:not(.leaving) .hold .fill");
    if (fill) fill.style.width = `${p * 100}%`;
    if (p >= 1) {
      state.hold = undefined;
      return confirm();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function endHold() {
  if (!state.hold) return;
  state.hold = undefined;
  const fill = $("stage").querySelector(".card:not(.leaving) .hold .fill");
  if (fill) fill.style.width = "0";
  showToast("Keep holding until the bar fills.");
}

let keyHeld;
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "z" || e.key === "Z") return undo();
  if (e.key === "s" || e.key === "S") return toggleSound();
  if (e.key === "Escape") return state.mode.kind === "reveal" && back();
  const side = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : undefined;
  if (!side) return;
  e.preventDefault();
  if (e.repeat) return;
  const c = CARDS[current()];
  if (!c) return;
  if (state.mode.kind === "reveal" && state.mode.side === side) {
    keyHeld = side;
    return c.rarity === "mythic" ? beginHold() : confirm();
  }
  choose(side);
});
addEventListener("keyup", (e) => {
  const side = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : undefined;
  if (side && side === keyHeld) {
    keyHeld = undefined;
    endHold();
  }
});
$("stage").addEventListener("click", (e) => {
  const opt = e.target.closest(".opt");
  if (opt) return choose(opt.dataset.side);
  if (e.target.closest('[data-act="confirm"]')) confirm();
});
$("stage").addEventListener("pointerdown", (e) => e.target.closest('[data-act="hold"]') && beginHold());
for (const ev of ["pointerup", "pointerleave"]) $("stage").addEventListener(ev, (e) => e.target.closest?.('[data-act="hold"]') && endHold(), true);

// ------------------------------------------------------------ the toast, the summary

let toastTimer;
function showToast(text, withUndo = false) {
  const t = $("toast");
  clearTimeout(toastTimer);
  t.hidden = false;
  t.innerHTML = `<span>${esc(text)}</span>${withUndo ? `<button type="button" class="undo">Undo <kbd>Z</kbd></button><span class="timer"></span>` : ""}`;
  t.querySelector(".undo")?.addEventListener("click", undo);
  const timer = t.querySelector(".timer");
  if (timer && !reduced()) timer.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: UNDO_MS, easing: "linear", fill: "forwards" });
  toastTimer = setTimeout(() => (t.hidden = true), withUndo ? UNDO_MS + 200 : 2400);
}

function summary() {
  const left = CARDS.slice(current());
  const stopped = left.filter((c) => c.stopped).length;
  const words = ["No", "One", "Two", "Three", "Four"];
  $("summary").innerHTML = left.length
    ? `<b>${left.length} to answer.</b>${stopped ? ` <span class="stop-dot"></span>${words[stopped] ?? stopped} ${stopped === 1 ? "agent has" : "agents have"} stopped for you.` : ""}`
    : "<b>Nothing to answer.</b>";
}

// ------------------------------------------------------------ layout: the drum and the card, one composition

let cardTop = 96;
function layout() {
  const W = innerWidth, H = innerHeight - 56;
  const left = Math.max(24, Math.round((W - (LEN + GAP + CARD_W)) / 2));
  const cx = left + LEN / 2;
  const cardLeft = left + LEN + GAP;
  const cy = Math.round(H * 0.48);
  drum.cardLeft = cardLeft;
  // The eye: level with the front, a little above it, and over toward the card, so the near end shows.
  drum.layout({ cx, cy, eyeX: cardLeft + 40, eyeY: cy - 70, persp: 1100 });
  const stage = $("stage");
  stage.style.setProperty("--card-left", `${cardLeft}px`);
  // The card sits centred on the drum's front, measured once for the first card, and stays put after.
  const card = stage.querySelector(".card");
  const h = card ? card.offsetHeight : 600;
  cardTop = Math.max(16, Math.round(cy - h / 2));
  stage.style.setProperty("--card-top", `${cardTop}px`);
  const socket = stage.querySelector(".socket");
  if (socket) socket.style.top = `${cy - cardTop}px`;
  printDrum();
}

summary();
renderStage();
layout();
drum.turnTo(current(), true);
printDrum();
addEventListener("resize", layout);
document.fonts?.ready.then(layout);
window.reel = { drum, state, choose, confirm, undo };
