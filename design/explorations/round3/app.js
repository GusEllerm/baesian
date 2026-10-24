// Round 3: the one-cue card inside the Atlas, with the consequence preview, tiers, human-first,
// practice cards and calibration (D70; docs/vault/Research/Contextualising Decisions.md).

import { animate } from "https://cdn.jsdelivr.net/npm/motion@14.6.0/+esm";
import * as atlas from "./atlas.js";
import { CALIBRATION_BASELINE, CARDS, DECISIONS, RARITY, areaOf, byDecision, rarityOf, workOf } from "./data.js";

// The self-test runs in headless Chrome, whose virtual clock doesn't produce animation frames.
// The screenshot hashes (#peek-left, #overview) run there too.
const SELFTEST = location.hash === "#selftest";
const HEADLESS = SELFTEST || ["#peek-left", "#overview"].includes(location.hash);
if (HEADLESS) window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16);
const reduced = HEADLESS || matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const RAR = new Map(CARDS.map((c) => [c.decision, rarityOf(c)]));
const RANK = { mythic: 4, rare: 3, uncommon: 2, common: 1 };
const DWELL = { low: 0, medium: 2000, high: 3000 };
const lower = (t) => t[0].toLowerCase() + t.slice(1);

// ------------------------------------------------------------------ state
const answered = new Map(); // decision id -> { kind, rarity, dwell, practice, caught }
let practiceOn = false;
let current = null; // the card object on screen
let shownAt = 0, previewSeen = false, sides = { left: "alternative", right: "proposal" };

const cardFor = (id) => CARDS.find((c) => c.decision === id);
const humanFirst = (c) => RAR.get(c.decision).tier === "high";

function queue() {
  return CARDS.filter((c) => (practiceOn || !c.practice))
    .sort((a, b) => (b.blocking - a.blocking) * 0.5 + (RANK[RAR.get(b.decision).rarity] - RANK[RAR.get(a.decision).rarity]))
    .map((c) => c.decision);
}
const pending = () => queue().filter((id) => !answered.has(id));

// ------------------------------------------------------------------ the card
function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

function optionHtml(c, kind, side) {
  const o = c[kind];
  const key = side === "left" ? "←" : "→";
  if (humanFirst(c)) {
    return `<div><h3>${side === "left" ? `<kbd>${key}</kbd> Option` : `Option <kbd>${key}</kbd>`}</h3>
      <p class="name">${o.name}</p><p class="case">Better if ${o.betterIf}.</p>
      <p class="then">Then: ${c.projection[kind]}.</p></div>`;
  }
  const head = kind === "proposal" ? `Proposal <kbd>${key}</kbd>` : `<kbd>${key}</kbd> Take the alternative`;
  const kase = kind === "proposal" ? `Because ${o.because}.` : `Wins if ${o.winsIf}.`;
  return `<div><h3>${head}</h3><p class="name">${o.name}</p><p class="case">${kase}</p><p class="then">Then: ${c.projection[kind]}.</p></div>`;
}

function renderCard(c) {
  const card = $("card");
  const d = byDecision(c.decision), w = workOf(d), a = areaOf(d);
  const { rarity, why } = RAR.get(c.decision);
  const r = RARITY[rarity];
  const inWork = DECISIONS.filter((x) => x.work === d.work).length;
  sides = humanFirst(c) ? (hash(c.decision) % 2 ? { left: "proposal", right: "alternative" } : { left: "alternative", right: "proposal" }) : { left: "alternative", right: "proposal" };
  const variants = [
    c.kind === "conflict" ? `<span class="variant">Split card</span>` : "",
    c.kind === "audit" ? `<span class="variant">Reprint</span>` : "",
    c.firstEdition ? `<span class="variant first">First edition</span>` : "",
  ].join("");
  const cue = [...c.cues].sort((x, y) => y.voi - x.voi)[0];
  card.className = `card rarity-${rarity}`;
  card.style.transform = "";
  card.setAttribute("aria-label", c.question);
  card.innerHTML = `
    <div class="foil"></div><div class="glare"></div>
    <div class="rarity-row rarity-${rarity}">
      <span class="rmark" aria-hidden="true">${r.mark}</span><span class="rname">${r.name}</span>${variants}
      <button class="why-rarity" title="${why.join("; ")}">why ${r.name.toLowerCase()}?</button>
      <span class="collector" title="Card ${c.decision}">No. ${d.t} of ${inWork} in “${w.title}”, ${a.name}</span>
    </div>
    <p class="trigger">${c.trigger}${c.blocking ? `<span class="blocked">Agent waiting</span>` : ""}</p>
    <p class="typeline">${c.type} ${c.precedent}</p>
    <h1>${c.question}</h1>
    <div class="options">${optionHtml(c, sides.left, "left")}${optionHtml(c, sides.right, "right")}</div>
    ${humanFirst(c)
      ? `<p class="sinks"><b>Check before you choose</b> ${c.keyQuestion}</p>`
      : `<p class="voice"><b>${c.agent}</b> “${c.rationale}”</p>
         <p class="sinks"><b>Wrong if</b> ${c.sinksIf.claim.replace(/^Wrong if /, "")} <span class="check">Check: ${c.sinksIf.check}.</span></p>`}
    <div class="cue"><b>The one thing most likely to change your answer</b><br>${cue.text}<span class="why">Why this one: ${cue.why}.</span></div>
    <div class="unlock" aria-hidden="true"><i id="unlock-bar"></i></div><div class="unlock-note" id="unlock-note"></div>
    <div class="reveal" id="reveal"></div>`;
  $("cue-left").innerHTML = `<span>${humanFirst(c) ? "Option" : "Take the alternative"}</span>`;
  $("cue-right").innerHTML = `<span>${humanFirst(c) ? "Option" : "Accept"}</span>`;
  shownAt = performance.now();
  previewSeen = false;
  bindCardPointer(card);
}

// ------------------------------------------------------------------ tiers: dwell, preview-to-unlock
function tierOf(c) { return RAR.get(c.decision).tier; }
function unlocked() {
  if (!current) return false;
  const t = tierOf(current);
  const dwellOk = performance.now() - shownAt >= DWELL[t];
  return dwellOk && (t !== "high" || previewSeen);
}
function lockReason() {
  const t = tierOf(current);
  const left = Math.max(0, DWELL[t] - (performance.now() - shownAt));
  if (left > 0) return `Read it first: answers unlock in ${(left / 1000).toFixed(1)} s.`;
  if (t === "high" && !previewSeen) return "Drag the card a little either way to see what each answer does; then it unlocks.";
  return "";
}
function tickUnlock() {
  if (current) {
    const t = tierOf(current), bar = $("unlock-bar"), note = $("unlock-note");
    if (bar && note) {
      const p = DWELL[t] ? Math.min(1, (performance.now() - shownAt) / DWELL[t]) : 1;
      bar.style.width = `${(t === "high" && !previewSeen ? Math.min(p, 0.9) : p) * 100}%`;
      note.textContent = unlocked() ? (t === "low" ? "" : "Unlocked.") : lockReason();
    }
  }
  requestAnimationFrame(tickUnlock);
}

// ------------------------------------------------------------------ gestures (from round 2)
const THRESH_X = 150, THRESH_Y = 110, HOLD_MS = 900;
const s = { x: 0, y: 0, dragging: false, samples: [], anims: [], locked: false, revealing: null, holdStart: 0, wheelIdle: 0, wheelCooldown: 0 };
const VERB_RIGHT = () => sides.right, VERB_LEFT = () => sides.left;

const dirOf = (x, y) => (Math.abs(x) < 8 && Math.abs(y) < 8 ? null : Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : y < 0 ? "up" : "down");
const progressOf = (x, y) => Math.min(1.25, Math.max(Math.abs(x) / THRESH_X, Math.abs(y) / THRESH_Y));

function render() {
  const card = $("card");
  if (!current) return;
  const rot = Math.max(-12, Math.min(12, s.x * 0.045));
  card.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${rot}deg)`;
  card.style.setProperty("--px", String(0.5 + Math.max(-0.5, Math.min(0.5, s.x / 400))));
  card.style.setProperty("--py", String(0.5 + Math.max(-0.5, Math.min(0.5, s.y / 300))));
  const d = dirOf(s.x, s.y), p = progressOf(s.x, s.y);
  const locked = !unlocked();
  for (const side of ["left", "right"]) {
    const cue = $(`cue-${side}`);
    cue.style.opacity = d === side ? Math.min(1, p) : 0;
    cue.classList.toggle("locked", locked);
  }
  if (d === "left" || d === "right") {
    const kind = d === "right" ? VERB_RIGHT() : VERB_LEFT();
    const o = current[kind];
    if (p >= 0.35) previewSeen = true;
    atlas.preview(kind, p, `${o.name}: ${current.projection[kind]}`);
  } else {
    atlas.preview(null, 0, "");
  }
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
function sample() { s.samples.push({ x: s.x, y: s.y, t: performance.now() }); if (s.samples.length > 12) s.samples.shift(); }
function velocity() {
  const now = performance.now(), r = s.samples.filter((q) => now - q.t < 90);
  if (r.length < 2) return { vx: 0, vy: 0 };
  const a = r[0], b = r[r.length - 1], dt = Math.max(1, b.t - a.t);
  return { vx: ((b.x - a.x) / dt) * 1000, vy: ((b.y - a.y) / dt) * 1000 };
}

function release() {
  const { vx, vy } = velocity();
  const d = dirOf(s.x, s.y), p = progressOf(s.x, s.y);
  const flick = d && Math.abs(d === "left" || d === "right" ? vx : vy) > 900 && p > 0.3;
  s.dragging = false;
  if (d && (p >= 1 || flick)) return reach(d, vx, vy);
  springTo(0, 0, vx, vy);
}

function reach(d, vx = 0, vy = 0) {
  if (!current || s.locked) return;
  if (d === "up" || d === "down") { springTo(0, d === "up" ? -30 : 30); return openSheet(d); }
  if (!unlocked()) { flash(lockReason()); return springTo(0, 0, vx, vy); }
  const kind = d === "right" ? VERB_RIGHT() : VERB_LEFT();
  if (humanFirst(current) || RAR.get(current.decision).rarity === "mythic") {
    springTo(d === "right" ? THRESH_X * 0.9 : -THRESH_X * 0.9, 0, vx, vy);
    return showReveal(d, kind);
  }
  return commit(kind, d);
}

// ------------------------------------------------------------------ human-first reveal + hold (D67)
let holdRaf = 0, keyHeld = null;
function showReveal(d, kind) {
  const c = current, chose = c[kind].name, agentPick = c.proposal.name;
  const same = kind === "proposal";
  const el = $("reveal");
  el.style.setProperty("--c", d === "right" ? "var(--stamp)" : "var(--thread)");
  el.innerHTML = `<div class="box">
      <p>You chose <b>${lower(chose)}</b>. ${c.agent} proposed <b>${lower(agentPick)}</b>.</p>
      <p class="agree">${same ? "You agree with the agent." : "You differ: your choice goes back as the answer."}</p>
      <p><b style="font-family: var(--ui); font-size: 12.5px; color: var(--ink-soft)">${c.agent}</b> “${c.rationale}”</p>
      <p style="font-size:15px">Wrong if ${lower(c.sinksIf.claim.replace(/^Wrong if /, ""))} Check: ${c.sinksIf.check}.</p>
      <button class="ring" id="ring" aria-label="Hold to confirm"><svg viewBox="0 0 116 116" aria-hidden="true"><circle cx="58" cy="58" r="54"/></svg><span>Hold ${d === "right" ? "→" : "←"} or press here</span></button>
      <small>Esc to think again.</small></div>`;
  el.classList.add("on");
  s.revealing = { d, kind, start: 0 };
  const ring = $("ring");
  ring.addEventListener("pointerdown", (e) => { e.preventDefault(); beginHold(); });
  ring.addEventListener("pointerup", stopHold);
  ring.addEventListener("pointerleave", () => s.revealing?.start && stopHold());
}
function beginHold() {
  if (!s.revealing || s.revealing.start) return;
  s.revealing.start = performance.now();
  const circle = $("reveal").querySelector("circle");
  const tick = () => {
    if (!s.revealing?.start) return;
    const p = Math.min(1, (performance.now() - s.revealing.start) / HOLD_MS);
    circle.style.strokeDashoffset = 339 * (1 - p);
    if (p >= 1) { const { kind, d } = s.revealing; keyHeld = null; closeReveal(); commit(kind, d); return; }
    holdRaf = requestAnimationFrame(tick);
  };
  holdRaf = requestAnimationFrame(tick);
}
function stopHold() {
  if (!s.revealing?.start) return;
  cancelAnimationFrame(holdRaf);
  s.revealing.start = 0;
  $("reveal").querySelector("circle").style.strokeDashoffset = 339;
  flash("A full hold confirms it.");
}
function closeReveal() { cancelAnimationFrame(holdRaf); s.revealing = null; $("reveal")?.classList.remove("on"); }

// ------------------------------------------------------------------ committing an answer
async function commit(kind, d) {
  const c = current;
  if (!c) return;
  s.locked = true;
  const dwell = performance.now() - shownAt;
  if (!reduced) {
    const W = innerWidth, H = innerHeight;
    const target = { right: [W * 0.6, s.y], left: [-W * 0.7, s.y], up: [s.x, -H], down: [s.x, H] }[d] ?? [W, 0];
    stopAnims();
    await Promise.all([
      animate(s.x, target[0], { duration: 0.32, ease: "easeIn", onUpdate: (v) => { s.x = v; render(); } }).finished,
      animate(s.y, target[1], { duration: 0.32, ease: "easeIn", onUpdate: (v) => { s.y = v; render(); } }).finished,
    ]);
  }
  const verdict = kind === "proposal" ? "proposal" : kind === "alternative" ? "alternative" : "other";
  const rarity = RAR.get(c.decision).rarity;
  const caught = c.practice ? (verdict === "alternative" ? true : verdict === "proposal" ? false : null) : undefined;
  answered.set(c.decision, { kind, verdict, rarity, dwell, practice: Boolean(c.practice), caught });
  atlas.stamp(c.decision, verdict);
  atlas.preview(null, 0, "");
  closeSheet();
  ["left", "right"].forEach((side) => ($(`cue-${side}`).style.opacity = 0));
  s.x = 0; s.y = 0; s.samples = []; s.locked = false;
  const words = { proposal: c.kind === "audit" ? "Let it stand" : "Accepted", alternative: c.kind === "audit" ? "Overturned" : "Took the alternative", other: kind === "answer" ? "Answered in writing" : "Passed on" };
  const then = verdict === "other" ? "" : ` ${c.projection[verdict]}.`;
  if (c.practice) showPractice(c, caught);
  else showToast(`${words[verdict]}: ${lower(byDecision(c.decision).short)}.${then}`);
  await next();
}

async function next(id) {
  const ids = pending();
  renderDock();
  renderSummary();
  if (!ids.length) {
    current = null;
    $("card").innerHTML = "";
    $("card").style.display = "none";
    $("empty").classList.add("on");
    $("thread").style.opacity = 0;
    return;
  }
  const target = id && ids.includes(id) ? id : ids[0];
  current = cardFor(target);
  $("card").style.display = "";
  $("empty").classList.remove("on");
  $("card").style.opacity = 0;
  await atlas.focus(target, { reduced });
  renderCard(current);
  render();
  $("card").style.opacity = 1;
  if (!reduced) animate($("card"), { opacity: [0, 1], y: [10, 0] }, { duration: 0.22 });
  renderDock();
}

// ------------------------------------------------------------------ pointer drag
function bindCardPointer(card) {
  card.onpointermove = (e) => {
    if (s.dragging || reduced) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--px", String((e.clientX - r.left) / r.width));
    card.style.setProperty("--py", String((e.clientY - r.top) / r.height));
  };
  card.onpointerdown = (e) => {
    if (s.locked || s.revealing || e.button !== 0 || e.target.closest("button")) return;
    stopAnims();
    card.setPointerCapture(e.pointerId);
    s.dragging = true;
    const ox = e.clientX - s.x, oy = e.clientY - s.y;
    s.samples = [];
    const move = (ev) => { s.x = ev.clientX - ox; s.y = ev.clientY - oy; sample(); render(); };
    const up = () => { card.removeEventListener("pointermove", move); card.removeEventListener("pointerup", up); card.removeEventListener("pointercancel", up); release(); };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
    card.addEventListener("pointercancel", up);
  };
}

// ------------------------------------------------------------------ two-finger trackpad swipe
$("stage").addEventListener("wheel", (e) => {
  if (e.ctrlKey) return;
  e.preventDefault();
  if (s.locked || s.revealing || performance.now() < s.wheelCooldown || !current) return;
  if (!s.dragging) { stopAnims(); s.dragging = true; s.samples = []; }
  s.x -= e.deltaX; s.y -= e.deltaY;
  sample(); render();
  clearTimeout(s.wheelIdle);
  s.wheelIdle = setTimeout(() => { s.wheelCooldown = performance.now() + 650; release(); }, 110);
}, { passive: false });

// ------------------------------------------------------------------ keys
const KEYS = { ArrowRight: "right", ArrowLeft: "left", ArrowUp: "up", ArrowDown: "down" };
let peeking = false;
addEventListener("keydown", (e) => {
  const inField = e.target instanceof Element && e.target.closest("textarea");
  if (e.key === "Escape") { closeSheet(); if (s.revealing) { closeReveal(); springTo(0, 0); } $("mirror").classList.remove("open"); return; }
  if (inField) return;
  if (e.key === " ") { e.preventDefault(); if (!e.repeat && !peeking && current) { peeking = true; $("card").classList.add("peeking"); atlas.peek(true, { reduced }); } return; }
  if ((e.key === "j" || e.key === "k") && current && !s.locked) {
    const ids = pending(), i = ids.indexOf(current.decision);
    next(ids[(i + (e.key === "j" ? 1 : ids.length - 1)) % ids.length]);
    return;
  }
  const d = KEYS[e.key];
  if (!d || !current || s.locked) return;
  e.preventDefault();
  if (e.repeat) return;
  keyHeld = d;
  if (s.revealing) { if (s.revealing.d === d) beginHold(); return; }
  const lean = { right: [THRESH_X * 0.6, 0], left: [-THRESH_X * 0.6, 0], up: [0, -THRESH_Y * 0.5], down: [0, THRESH_Y * 0.5] }[d];
  springTo(lean[0], lean[1]);
  if (d === "left" || d === "right") previewSeen = true; // leaning shows the consequence preview
});
addEventListener("keyup", (e) => {
  if (e.key === " " && peeking) { peeking = false; $("card").classList.remove("peeking"); atlas.peek(false, { reduced }); return; }
  const d = KEYS[e.key];
  if (!d || keyHeld !== d) return;
  keyHeld = null;
  if (s.revealing) { stopHold(); return; }
  if (!current || s.locked || $("sheet").classList.contains("open")) return;
  reach(d);
});

// ------------------------------------------------------------------ sheets: ↑ write, ↓ can't judge
function openSheet(d) {
  const c = current, sh = $("sheet");
  sh.style.setProperty("--c", d === "up" ? "var(--ink)" : "var(--pass)");
  sh.innerHTML = d === "up"
    ? `<h4>Answer in writing</h4>
       <div class="opts" id="opts"><button>Ask: have you considered…</button><button>Write a correction</button><button>Reject, with a reason</button></div>
       <textarea id="txt" aria-label="Your answer" placeholder="Goes back to ${c.agent} with the card."></textarea>
       <div class="row"><button class="send" id="send">Send to ${c.agent}</button><button class="cancel" id="cancel">Cancel (Esc)</button></div>`
    : `<h4>Why can't you judge it?</h4>
       <div class="opts" id="opts"><button>I need more context</button><button>It's outside my expertise</button><button>I need to see it run</button></div>
       <div class="row"><button class="send" id="send">Send</button><button class="cancel" id="cancel">Cancel (Esc)</button></div>`;
  sh.querySelectorAll("#opts button").forEach((b) => b.addEventListener("click", () => {
    sh.querySelectorAll("#opts button").forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    sh.querySelector("textarea")?.focus();
  }));
  $("send").addEventListener("click", () => commit(d === "up" ? "answer" : "pass", d));
  $("cancel").addEventListener("click", () => { closeSheet(); springTo(0, 0); });
  sh.classList.add("open");
}
function closeSheet() { $("sheet").classList.remove("open"); }

// ------------------------------------------------------------------ practice cards (opt-in canaries)
function showPractice(c, caught) {
  const el = $("practice-reveal");
  const result = caught === true ? "You caught it." : caught === false ? "You accepted it. That's the case these cards exist to find: a fluent proposal for the option you'd rejected." : "You passed on it, which counts as neither.";
  el.innerHTML = `<h4>Practice card</h4><p>${c.reveal}</p><p><b>${result}</b></p><button id="practice-ok">Continue</button>`;
  el.classList.add("on");
  $("practice-ok").addEventListener("click", () => el.classList.remove("on"));
}
$("practice").addEventListener("click", () => {
  practiceOn = !practiceOn;
  $("practice").setAttribute("aria-pressed", String(practiceOn));
  $("practice").textContent = `Practice cards: ${practiceOn ? "on" : "off"}`;
  if (current?.practice && !practiceOn) next(); else { renderDock(); renderSummary(); }
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
      <dt>This session</dt><dd>${rows.length} answered. Median time on mythic and rare cards: ${fmt(byTier(["mythic", "rare"]))}; uncommon: ${fmt(byTier(["uncommon"]))}; common: ${fmt(byTier(["common"]))}.</dd>
      <dt>Practice cards</dt><dd>Caught ${caught} of ${of} so far.</dd>
      <dt>Later reversed</dt><dd>${CALIBRATION_BASELINE.reverted.map((r) => `“${r.text}”: ${r.note}`).join("; ")}.</dd>
      <dt>Alternatives</dt><dd>You chose the alternative ${alternatives} time${alternatives === 1 ? "" : "s"} today. This month the agents worked around ${CALIBRATION_BASELINE.workedAround} of your rejections.</dd>
    </dl>
    <p class="both">Both directions count. One accept was later reversed, which is over-reliance. You also overturned ${CALIBRATION_BASELINE.heldUp} decisions that held up when they were re-decided, which is under-reliance.</p>`;
}
$("calib").addEventListener("click", () => {
  const open = !$("mirror").classList.contains("open");
  if (open) renderMirror();
  $("mirror").classList.toggle("open", open);
  $("calib").setAttribute("aria-expanded", String(open));
});

// ------------------------------------------------------------------ dock, summary, toast, thread
function renderDock() {
  const chips = $("chips");
  chips.innerHTML = "";
  for (const id of queue()) {
    const r = RAR.get(id), b = document.createElement("button");
    b.className = `chip${current?.decision === id ? " current" : ""}${answered.has(id) ? " done" : ""}`;
    b.title = `${RARITY[r.rarity].name}: ${r.why.join("; ")}`;
    b.innerHTML = `<span class="m rarity-${r.rarity}">${RARITY[r.rarity].mark}</span><span class="t">${byDecision(id).short}</span>`;
    b.addEventListener("click", () => { if (!answered.has(id) && !s.locked) next(id); });
    chips.appendChild(b);
  }
}
function renderSummary() {
  const ids = pending(), mythics = ids.filter((id) => RAR.get(id).rarity === "mythic").length;
  $("summary").innerHTML = ids.length ? `<b>${ids.length} decision${ids.length === 1 ? "" : "s"} need you.</b> ${mythics ? `${mythics === 1 ? "One is mythic" : `${mythics} are mythic`}: an agent has stopped.` : ""}` : "<b>Nothing needs you.</b>";
}
let toastTimer;
function showToast(text) { const t = $("toast"); t.textContent = text; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3200); }
function flash(text) { if (text) showToast(text); }

function drawThread() {
  const path = $("thread-path"), end = $("thread-end");
  if (current && !peeking) {
    const r = $("card").getBoundingClientRect(), n = atlas.screenOf(current.decision);
    const x1 = r.right - 6, y1 = r.top + Math.min(130, r.height / 3);
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + 90} ${y1 + 50}, ${n.x - 110} ${n.y + 40}, ${n.x - 18} ${n.y}`);
    end.setAttribute("cx", n.x - 18); end.setAttribute("cy", n.y);
    $("thread").style.opacity = 1;
  } else {
    $("thread").style.opacity = 0;
  }
  requestAnimationFrame(drawThread);
}

$("again").addEventListener("click", () => { answered.clear(); atlas.unstampAll(); next(); });

// ------------------------------------------------------------------ start
atlas.mount($("atlas"), { rarityOf: (id) => RAR.get(id)?.rarity ?? null });
await atlas.focus(pending()[0], { first: true, reduced: true });
current = cardFor(pending()[0]);
renderCard(current);
renderDock();
renderSummary();
render();
requestAnimationFrame(tickUnlock);
requestAnimationFrame(drawThread);

// #peek-left shows the second card mid-drag toward the alternative, for checking the preview.
if (location.hash === "#peek-left") {
  const id = "B-k7m2p";
  await next(id);
  shownAt -= 5000; previewSeen = true;
  s.x = -120; s.y = 4; render();
}

// #overview shows the project-level map.
if (location.hash === "#overview") { peeking = true; $("card").classList.add("peeking"); await atlas.peek(true, { reduced: true }); await atlas.peek(true, { reduced: true }); }

// ------------------------------------------------------------------ self-test (#selftest)
if (SELFTEST) {
  const out = [];
  const log = (m) => { out.push(m); console.log(`SELFTEST ${m}`); };
  const key = (k, type) => document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.onerror = (m) => console.log(`SELFTEST error ${m}`);
  (async () => {
    const first = current.decision;
    log(`first card: ${byDecision(first).short} (${RAR.get(first).rarity}), human-first: ${humanFirst(current)}`);
    log(`labels hidden: ${!$("card").textContent.includes("Proposal")} (expected true); foil layer: ${Boolean($("card").querySelector(".foil"))}`);
    key("ArrowRight", "keydown"); await wait(100); key("ArrowRight", "keyup"); await wait(300);
    log(`answered before the dwell: ${answered.has(first)} (expected false)`);
    await wait(3100);
    key("ArrowRight", "keydown"); await wait(150); key("ArrowRight", "keyup"); await wait(300);
    log(`reveal shown after dwell + lean: ${$("reveal").classList.contains("on")} (expected true)`);
    key("ArrowRight", "keydown"); await wait(1100); key("ArrowRight", "keyup"); await wait(500);
    const a1 = answered.get(first);
    log(`held to confirm: ${a1?.verdict} via the ${sides && a1 ? "right" : "?"} side; map stamped: ${document.querySelector(`.node[data-id="${first}"]`).classList.contains("answered")}`);
    log(`second card: ${byDecision(current.decision).short} (${RAR.get(current.decision).rarity})`);
    await wait(3200);
    key("ArrowLeft", "keydown"); await wait(150);
    log(`preview while leaning left: ${document.querySelector(".atlas").dataset.preview} (expected alternative or proposal)`);
    key("ArrowLeft", "keyup"); await wait(300);
    if ($("reveal").classList.contains("on")) { key("ArrowLeft", "keydown"); await wait(1100); key("ArrowLeft", "keyup"); await wait(500); }
    log(`second answered: ${[...answered.keys()].length === 2}`);
    log(`third card: ${byDecision(current.decision).short} (${RAR.get(current.decision).rarity}), labelled: ${$("card").textContent.includes("Proposal")}`);
    key("ArrowRight", "keydown"); await wait(80); key("ArrowRight", "keyup"); await wait(200);
    log(`uncommon before its 2 s dwell: answered=${answered.has(current.decision)} (expected false)`);
    await wait(2100);
    const third = current.decision;
    key("ArrowRight", "keydown"); await wait(80); key("ArrowRight", "keyup"); await wait(500);
    log(`uncommon after dwell, tapped right: ${answered.get(third)?.verdict} (expected proposal)`);
    $("practice").click(); await wait(100);
    const pid = CARDS.find((c) => c.practice).decision;
    await next(pid); await wait(2100);
    key("ArrowRight", "keydown"); await wait(80); key("ArrowRight", "keyup"); await wait(500);
    log(`practice card accepted: caught=${answered.get(pid)?.caught} (expected false); reveal shown: ${$("practice-reveal").classList.contains("on")}`);
    $("calib").click(); await wait(50);
    log(`calibration: ${$("mirror").textContent.includes("Caught 3 of 5")} (expected true)`);
    const pre = document.createElement("pre"); pre.id = "selftest"; pre.textContent = out.join("\n"); document.body.appendChild(pre);
  })();
}
