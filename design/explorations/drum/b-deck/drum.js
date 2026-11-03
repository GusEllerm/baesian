// Drum B: the drum is the deck. The card you're answering is the drum's front face; the cards you've answered went
// up and over the top, the ones to come are underneath, rising. Answering rolls the whole drum one face, and it
// clicks into place. The path is printed on the drum's left end, a disk you can see because you stand a little to
// its left: every card's number and mark round the rim, what you chose, what's next, and the count.
//
// CSS 3D: one perspective (the scene), one 3D context (the drum), and inside it one rotor that turns as a body.
// Everything on the drum is a child of the rotor at a fixed angle, so a turn is one transform. JS owns the physics
// (a heavy drum on a spring, with a stiff notch at each face), the lighting (each face and rib shaded by where it
// faces now), and which card is on which of the drum's faces (there are more cards than faces).
import { ANSWERED, CARDS, MARKS, MARK_INK, STAKES } from "../data.js";

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

// ------------------------------------------------------------ geometry
const N = num("n", 8); // faces round the drum
const STEP = 360 / N;
const W = 720, H = num("h", 500); // one face: a card's slot on the drum
const INSET_L = 58, INSET_R = 22, INSET_Y = 8; // the card inside its slot, clear of the left flange's lip
const R = H / 2 / Math.tan(Math.PI / N); // the drum's axle to the middle of a face
const RV = R / Math.cos(Math.PI / N); // to a face's edge
const FW = 30; // the flanges' thickness
const RD = RV + num("lip", 6); // the left flange's radius: just proud of the cards' corners
const FAR = q.get("wall") !== "0"; // the far wheel at the right end (?wall=0 leaves the right end bare)
const RW = RD; // the right end's wall
const RIBS = N * 8, RIB = 360 / RIBS;
const RIB_H = 2 * RD * Math.tan(Math.PI / RIBS) + 0.8;
const P = num("p", 680); // perspective: how close you stand
const XL = -(W / 2 + FW); // the left end's outer face
const XR = W / 2; // the right flange's inner wall
const LABEL_R0 = 150, LABEL_W = Math.round(RD - 44 - LABEL_R0);
const ARM_R0 = 40, ARM_W = Math.round(RD + 14 - ARM_R0);

// ------------------------------------------------------------ timing (the client's, client/src/answer.ts)
const HOLD_MS = 900, UNDO_MS = 5000;
const TENSION = 4.5; // how far a held mythic confirm strains the drum against its notch, in degrees
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || q.has("still");

// ------------------------------------------------------------ state
const M = CARDS.length;
const S = {
  cur: ANSWERED.length,
  answers: ANSWERED.map((option) => ({ option })),
  mode: { kind: "live" },
  hold: null, // { start } while a mythic confirm is held
  pending: null, // { index, until }: the answer in its undo window
};
let version = 0; // bumped whenever what a face shows may have changed
let keyHeld = null;

// The clock: real time, or frozen for the screenshot script (window.drum.freeze / advance).
let frozen = null;
const now = () => frozen ?? performance.now();

// The drum's angle (degrees; a face's angle is D minus its index times STEP) and its speed.
let D = S.cur * STEP, V = 0;
const target = () => S.cur * STEP + (S.hold ? TENSION * holdShape(holdProgress()) : 0);
const holdProgress = () => (S.hold ? Math.min(1, (now() - S.hold.start) / HOLD_MS) : 0);
const holdShape = (p) => p * p * (3 - 2 * p);

// ------------------------------------------------------------ helpers
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mark = (kind, size) => {
  const [fill, stroke] = MARK_INK[kind];
  return `<svg class="mk" width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true"><path d="${MARKS[kind]}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/></svg>`;
};
const optKey = (side) => (side === "left" ? "a" : "b");
const sideOf = (k) => (k === "a" ? "left" : "right");
const ARROW = { left: "←", right: "→" };
const role = (i) => (i < 0 || i > M ? "blank" : i === M ? "end" : i < S.cur ? "past" : i === S.cur ? "live" : "next");
const say = (t) => { document.getElementById("say").textContent = t; };

// ------------------------------------------------------------ the card faces
function cardHTML(i) {
  const r = role(i);
  if (r === "blank") return `<article class="card blank"><div class="face"></div></article>`;
  if (r === "end") {
    const done = S.cur >= M;
    return `<article class="card end"><div class="face">
      <p class="small">The end of the session</p>
      <h1>${done ? "That's every decision." : "Nothing after this."}</h1>
      <p class="small">${done ? `All ${M} answered. Each goes to the agent that asked.` : `${M} decisions; ${M - S.cur} still to answer.`}</p>
    </div></article>`;
  }
  const c = CARDS[i];
  const reveal = r === "live" && S.mode.kind === "reveal" ? S.mode : null;
  const chosen = r === "past" ? S.answers[i].option : reveal ? reveal.option : null;
  const showPick = r === "past" || !!reveal;
  const live = r === "live" && !reveal;
  const opt = (side) => {
    const k = optKey(side), o = c[k];
    const cls = chosen ? (chosen === k ? " chosen" : " unchosen") : "";
    return `<button type="button" class="opt${cls}" data-side="${side}" data-kind="${k}" tabindex="${live ? 0 : -1}" aria-label="Choose ${esc(o.name)}">
      ${live ? `<kbd class="key" aria-hidden="true">${ARROW[side]}</kbd>` : ""}
      <span class="ifans">${esc(o.if)}</span>
      <h2>${esc(o.name)}</h2>
      <p class="then">then ${esc(o.then)}</p>
      ${showPick && c.pick === k ? `<span class="pickof">${esc(c.agent)}'s pick</span>` : ""}
    </button>`;
  };
  let foot;
  if (r === "past") foot = edgeHTML(i);
  else if (reveal) foot = revealHTML(c, reveal);
  else if (r === "live") foot = `<div class="foot"><span class="rule">${c.rarity === "mythic" ? "Choose, then hold." : "You choose first."} ${esc(c.agent)}'s pick shows after.</span><span class="pos">${i + 1} of ${M}</span></div>`;
  else foot = `<div class="foot"><span class="rule">Coming up</span><span class="pos">${i + 1} of ${M}</span></div>`;
  return `<article class="card rarity-${c.rarity}" data-role="${r}"${reveal ? ' data-mode="reveal"' : ""}><div class="face">
    <p class="stakes"><span class="rmark" aria-label="${c.rarity}">${mark(c.rarity, 22)}</span><b>${esc(STAKES[c.rarity])}</b>${c.stopped && r !== "past" ? `<span class="stopped">${esc(c.agent)} stopped</span>` : ""}</p>
    <p class="doing"><b>${esc(c.agent)}</b> is ${esc(c.doing)}</p>
    <h1>${esc(c.question)}</h1>
    <div class="crux"><p><span class="lbl">It turns on</span>${esc(c.crux)}</p><p class="fact">${esc(c.fact)}</p></div>
    <div class="options">${opt("left")}${opt("right")}</div>
    ${foot}
  </div></article>`;
}

/** The edge of an answered card: what you chose, and the undo window. It's what you see as the card tips away. */
function edgeHTML(i) {
  const c = CARDS[i], k = S.answers[i].option;
  const fresh = S.pending && S.pending.index === i && now() - S.pending.at < 120 ? " stamp" : "";
  return `<div class="edge${fresh}"><span class="what">You chose “${esc(c[k].name)}”</span><span class="when">${whenText(i)}</span></div>`;
}
function whenText(i) {
  const c = CARDS[i];
  const p = S.pending;
  if (p && p.index === i && now() < p.until) return `Sending to ${esc(c.agent)} in ${Math.max(1, Math.ceil((p.until - now()) / 1000))}&nbsp;s. <kbd>Z</kbd> undoes it.`;
  return `Sent to ${esc(c.agent)}.`;
}

function revealHTML(c, m) {
  const same = m.option === c.pick;
  const name = c[m.option].name;
  const key = ARROW[m.side];
  const confirm = c.rarity === "mythic"
    ? `<button type="button" class="hold"><span class="fill"></span><span>Hold <kbd>${key}</kbd> or click and hold to confirm</span></button>`
    : `<button type="button" class="confirm">Confirm “${esc(name)}” <kbd>${key}</kbd></button>`;
  return `<div class="panel-in">
    <p class="verdict">You chose <b>${esc(name)}</b>. ${esc(c.agent)} ${same ? "picked the same." : `picked <b>${esc(c[c.pick].name)}</b>.`}</p>
    <div class="reveal-row">${confirm}${same ? "" : `<button type="button" class="switch">Switch to ${esc(c.agent)}'s pick</button>`}</div>
    <p class="small">Esc goes back to the choice.</p>
  </div>`;
}

/** A card's label on the drum's end: its number and mark, and what you chose, what it is, or the count. */
function labelHTML(i) {
  const r = role(i);
  if (r === "blank") return "";
  if (r === "end") return `<span class="num">·</span><span class="txt">${S.cur >= M ? `all ${M} answered` : "the end of the session"}</span>`;
  const c = CARDS[i];
  // Laid out from the rim inward (row-reverse): the number at the rim, then the mark, then the words.
  const n = `<span class="num">${i + 1}</span>${mark(c.rarity, 22)}`;
  if (r === "past") return `${n}<span class="txt"><i>chose</i> ${esc(c[S.answers[i].option].name)}</span>`;
  if (r === "live") return `${n}<span class="txt">of ${M}, in play</span>`;
  return `${n}<span class="txt">${esc(c.title)}</span>`;
}

// ------------------------------------------------------------ building the drum
const drum = document.getElementById("drum");
const rotor = el("div", "rotor", drum);
function el(tag, cls, parent) {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
const slots = [];
for (let s = 0; s < N; s++) {
  const e = el("div", "slot", rotor);
  e.style.transform = `rotateX(${-s * STEP}deg) translateZ(${R}px)`;
  const body = el("div", "card-host", e);
  const shade = el("div", "shade", e), shine = el("div", "shine", e);
  const label = el("div", "label", rotor);
  label.setAttribute("aria-hidden", "true");
  label.style.transform = `translateX(${XL - 3}px) rotateX(${-s * STEP}deg) translateZ(${LABEL_R0}px) rotateY(-90deg)`;
  slots.push({ s, e, body, shade, shine, label, key: "", lkey: "", index: NaN });
}
const ribs = [];
for (const side of FAR ? [-1, 1] : [-1]) {
  for (let j = 0; j < RIBS; j++) {
    const e = el("div", "rib" + (j % 8 === 0 ? " lip" : ""), rotor);
    e.style.transform = `translateX(${side * (W / 2 + FW / 2)}px) rotateX(${j * RIB}deg) translateZ(${RD}px)`;
    ribs.push({ e, a: j * RIB, side });
  }
}
const disk = el("div", "disk", rotor);
disk.style.transform = `translateX(${XL}px) rotateY(-90deg)`;
const hub = el("div", "hub", rotor);
hub.style.transform = `translateX(${XL - 2}px) rotateY(-90deg)`;
// Fixed in the scene, not on the rotor: the light on the end, the far wall, the pointer.
const light = el("div", "disk-light", drum);
light.style.transform = `translate3d(${XL - 1}px, 0, ${-R}px) rotateY(-90deg)`;
const wall = el("div", "wall", drum);
if (!FAR) wall.style.display = "none";
wall.style.transform = `translate3d(${XR}px, 0, ${-R}px) rotateY(-90deg)`;
// The index arm: fixed to the axle, lying across the end from the hub to the rim, at the front. The card in play's
// label comes to rest on it; its tip rides the ribs and ticks as each one passes.
const arm = el("div", "arm", drum);
const cap = el("div", "cap", drum);
cap.style.transform = `translate3d(${XL - 8}px, 0, ${-R}px) rotateY(-90deg)`;

const root = document.documentElement.style;
root.setProperty("--w", `${W}px`);
root.setProperty("--h", `${H}px`);
root.setProperty("--inset-l", `${INSET_L}px`);
root.setProperty("--inset-r", `${INSET_R}px`);
root.setProperty("--inset-y", `${INSET_Y}px`);
root.setProperty("--fw", `${FW}px`);
root.setProperty("--rib-h", `${RIB_H}px`);
root.setProperty("--dd", `${2 * RD}px`);
root.setProperty("--dw", `${2 * RW}px`);
root.setProperty("--p", `${P}px`);
root.setProperty("--label-w", `${LABEL_W}px`);
root.setProperty("--arm-w", `${ARM_W}px`);

function layout() {
  const vw = innerWidth, vh = innerHeight;
  const k = Math.min(1, vw / 1440, vh / 900);
  const desk = document.getElementById("desk");
  desk.style.transform = k < 1 ? `scale(${k})` : "";
  desk.style.transformOrigin = "50% 50%";
  const cx = vw / 2 + num("dx", 90), cy = vh / 2 + num("dy", 12);
  root.setProperty("--cx", `${cx}px`);
  root.setProperty("--cy", `${cy}px`);
  root.setProperty("--ox", `${cx + num("ox", -800)}px`);
  root.setProperty("--oy", `${cy - num("up", 70)}px`);
}
layout();
addEventListener("resize", layout);

// ------------------------------------------------------------ the light: from the upper left, a little in front
const L = (() => {
  const v = [-0.5, 0.42, 0.76];
  const m = Math.hypot(...v);
  return v.map((x) => x / m);
})();
/** How lit a surface on the drum is, facing `a` degrees up from you (math: y up, z toward you). */
const lit = (a) => {
  const r = (a * Math.PI) / 180;
  return L[1] * Math.sin(r) + L[2] * Math.cos(r);
};
const FRONT_LIT = lit(0);
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const RIB_DARK = [30, 22, 42], RIB_LIGHT = [148, 132, 168];
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// ------------------------------------------------------------ each frame
let last = now();
function frame() {
  const t = now();
  let dt = Math.min(64, t - last);
  last = t;
  // A mythic confirm held to the end: the drum breaks out of its notch.
  if (S.hold && holdProgress() >= 1) {
    S.hold = null;
    keyHeld = null;
    commit();
  }
  if (S.pending && t >= S.pending.until) {
    S.pending = null;
    version++;
  }
  simulate(dt);
  render();
  requestAnimationFrame(frame);
}

/** The drum: heavy, on a soft spring toward its target face, and a stiff notch once it's nearly there. */
const K1 = 45, C1 = 8.5, NOTCH = 5, K2 = 1800, C2 = 22;
function simulate(dt) {
  const goal = target();
  if (reduced) {
    D = S.cur * STEP;
    V = 0;
    return;
  }
  while (dt > 0) {
    const h = Math.min(1, dt) / 1000;
    dt -= 1;
    const x = D - goal;
    let a = -K1 * x - C1 * V;
    if (Math.abs(x) < NOTCH) a += -K2 * x - C2 * V;
    V += a * h;
    D += V * h;
  }
  if (Math.abs(D - goal) < 0.002 && Math.abs(V) < 0.05) {
    D = goal;
    V = 0;
  }
}

// ------------------------------------------------------------ sound (off until you press S): the ribs tick past the
// arm, and the drum clacks into its notch
let audio = null, sound = false, lastRib = Math.floor(D / RIB + 1e-6), inNotch = true;
function noise(ms, freq, q, gain) {
  if (!sound) return;
  audio ??= new AudioContext();
  const n = Math.round((audio.sampleRate * ms) / 1000);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = buf;
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = gain;
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
function listen() {
  const rib = Math.floor(D / RIB + 1e-6);
  if (rib !== lastRib && Math.abs(V) > 8) noise(7, 3800, 2.5, Math.min(0.35, Math.abs(V) / 400));
  lastRib = rib;
  const near = Math.abs(D - target()) < NOTCH;
  if (near && !inNotch && Math.abs(V) > 20) {
    noise(24, 900, 1.2, 0.5);
    noise(40, 160, 0.8, 0.6);
  }
  inNotch = near;
}

let lastFill = -1, lastWhen = "";
function render() {
  listen();
  rotor.style.transform = `translateZ(${-R}px) rotateX(${D}deg)`;
  // Which card is on which face: the one whose angle is nearest the front.
  for (const sl of slots) {
    const i = sl.s + N * Math.round((D / STEP - sl.s) / N);
    const a = norm(D - i * STEP);
    const key = `${i}:${version}`;
    if (sl.key !== key) {
      sl.key = key;
      sl.index = i;
      sl.body.innerHTML = cardHTML(i);
      sl.label.innerHTML = labelHTML(i);
      sl.label.className = `label ${role(i)}`;
      sl.e.toggleAttribute("data-front", i === S.cur);
      sl.e.setAttribute("aria-hidden", i === S.cur ? "false" : "true");
      sl.e.inert = i !== S.cur;
    }
    // Shade: darker as a face turns down from the light, a little brighter as it turns up to it.
    const d = lit(a) - FRONT_LIT;
    const away = Math.min(1, Math.abs(a) / 90);
    sl.shade.style.opacity = Math.min(0.8, Math.max(0, -d * 0.8) + away * away * 0.3).toFixed(3);
    sl.shine.style.opacity = Math.min(0.5, Math.max(0, d * 1.4)).toFixed(3);
    // Labels fade only toward the back, where a face is handed from the oldest card to the next one coming.
    sl.label.style.opacity = Math.max(0, Math.min(1, (172 - Math.abs(a)) / 70)).toFixed(3);
  }
  for (const rb of ribs) {
    const a = norm(D - rb.a);
    const l = Math.max(0, lit(a));
    const spec = Math.pow(Math.max(0, lit(a)), 14) * 0.5;
    const c = mix(RIB_DARK, RIB_LIGHT, Math.min(1, l * (rb.side < 0 ? 1.08 : 0.78) + spec));
    rb.e.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  // The arm's tip rides the ribs: lifted as each one passes, dropping off it with a tick.
  const frac = ((D / RIB) % 1 + 1) % 1;
  const lift = reduced ? 0 : (frac < 0.8 ? Math.sin((frac / 0.8) * Math.PI * 0.5) : 1 - (frac - 0.8) / 0.2) * 0.7 * Math.sign(V || 1);
  arm.style.transform = `translate3d(${XL - 6}px, 0, ${-R}px) rotateX(${lift.toFixed(3)}deg) translateZ(${ARM_R0}px) rotateY(-90deg)`;
  // The held confirm's bar, and the undo window's seconds, without re-rendering the card.
  const fill = document.querySelector(".slot[data-front] .hold .fill");
  const p = holdProgress();
  if (fill && p !== lastFill) {
    fill.style.width = `${p * 100}%`;
    lastFill = p;
  }
  if (S.pending) {
    const w = whenText(S.pending.index);
    if (w !== lastWhen) {
      lastWhen = w;
      const sl = slots.find((x) => x.index === S.pending.index);
      const when = sl?.body.querySelector(".edge .when");
      if (when) when.innerHTML = w;
    }
  }
}

// ------------------------------------------------------------ answering
function choose(side) {
  if (S.cur >= M || S.mode.kind !== "live") return;
  S.mode = { kind: "reveal", side, option: optKey(side) };
  version++;
  const c = CARDS[S.cur];
  say(`You chose ${c[S.mode.option].name}. ${c.agent} ${S.mode.option === c.pick ? "picked the same" : `picked ${c[c.pick].name}`}.`);
}
function confirm() {
  if (S.mode.kind !== "reveal") return;
  if (CARDS[S.cur].rarity === "mythic") return;
  commit();
}
function commit() {
  const i = S.cur, m = S.mode;
  S.answers[i] = { option: m.option };
  S.pending = { index: i, at: now(), until: now() + UNDO_MS };
  lastWhen = "";
  S.cur = i + 1;
  S.mode = { kind: "live" };
  version++;
  say(`Sending to ${CARDS[i].agent} in 5 seconds. Z undoes.`);
}
function undo() {
  const p = S.pending;
  if (!p || now() >= p.until) return;
  S.pending = null;
  S.answers.length = p.index;
  S.cur = p.index;
  S.mode = { kind: "live" };
  S.hold = null;
  version++;
  say("Undone. The card is back.");
}
function back() {
  if (S.mode.kind !== "reveal") return;
  S.hold = null;
  S.mode = { kind: "live" };
  version++;
}
function beginHold() {
  if (S.mode.kind !== "reveal" || S.hold) return;
  S.hold = { start: now() };
}
function endHold() {
  if (!S.hold) return;
  S.hold = null;
  say("Keep holding until the bar fills.");
}
function switchToPick() {
  if (S.mode.kind !== "reveal") return;
  const k = CARDS[S.cur].pick;
  S.mode = { kind: "reveal", side: sideOf(k), option: k };
  version++;
}

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "z" || e.key === "Z") return undo();
  if (e.key === "s" || e.key === "S") {
    sound = !sound;
    document.getElementById("sound").textContent = sound ? "on" : "off";
    return say(sound ? "Sound on." : "Sound off.");
  }
  if (e.key === "Escape") return back();
  const dir = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
  if (!dir) return;
  e.preventDefault();
  if (e.repeat) return;
  if (S.mode.kind === "live") return choose(dir);
  if (dir !== S.mode.side) return;
  keyHeld = dir;
  if (CARDS[S.cur].rarity === "mythic") beginHold();
  else confirm();
});
addEventListener("keyup", (e) => {
  const dir = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
  if (!dir || dir !== keyHeld) return;
  keyHeld = null;
  endHold();
});
drum.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || !t.closest(".slot[data-front]")) return;
  if (t.classList.contains("opt")) choose(t.dataset.side);
  else if (t.classList.contains("confirm")) confirm();
  else if (t.classList.contains("switch")) switchToPick();
});
drum.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".slot[data-front] .hold")) beginHold();
});
addEventListener("pointerup", () => !keyHeld && endHold());

// For the screenshot script: stop the clock, and step it.
window.drum = {
  freeze() { frozen = performance.now(); last = frozen; },
  advance(ms) { frozen += ms; frame0(); },
  state: S,
  get angle() { return D; },
};
function frame0() {
  const t = now();
  const dt = t - last;
  last = t;
  if (S.hold && holdProgress() >= 1) { S.hold = null; keyHeld = null; commit(); }
  if (S.pending && t >= S.pending.until) { S.pending = null; version++; }
  simulate(dt);
  render();
}
requestAnimationFrame(frame);
