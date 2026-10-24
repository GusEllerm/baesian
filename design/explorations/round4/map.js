// The project map (the Atlas), fifth version, after map reviews 1–4.
//
// The whole project on one screen. Areas are rows; within an area, each piece of work is a track, its
// decisions left to right, oldest to newest. Cards to answer and answered ones carry a short name inline;
// settled decisions, rules and deferred ones are marks, named on hover. That depends on each decision's
// own state alone, never on which card you're looking from, so nothing ever moves: only highlights,
// letters and lines change.
//
// The subject (your card, or a decision you clicked to look at) is outlined. Each decision it's connected to
// gets a letter, the same letter as in the list on the right, which names it with its place and state.
// Nothing floats over the tracks.

import { mark } from "./marks.js";
import { AREAS, DECISIONS, WORKS, areaOf, byDecision, workOf } from "./data.js";

let body, foot, tip, more, less, opts;
let inspect = null, hover = null, pointerArmed = false, quietFocus = false;
let seen = null, fresh = new Set(); // what the map showed last time, so new cards can say so
let keyX = null; // ↑ and ↓ keep to the column you started in, so ↑ undoes ↓
const NEXT = 5; // order numbers on the next five cards only; the rest just wait

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const slug = (t) => t.replace(/[^a-z]+/gi, "-").toLowerCase();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const QUIET = new Set(["settled", "rule", "agent", "deferred"]);
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * els: { body, foot, tip, more, less }. o: { stateOf(id), precedentOf(id), kindOf(id), queue(), currentId(), reviewing(), onGo(id), onReview(id), onChange() }.
 * stateOf returns { kind: waiting | answered | settled | rule | agent | deferred | hidden, rarity?, stopped?, chose?, order? }.
 */
export function mountMap(els, o) {
  ({ body, foot, tip, more, less } = els);
  opts = o;
  addEventListener("resize", () => { if (isOpen()) render(); });
  body.addEventListener("scroll", () => { drawLines(); edges(); });
  // The tooltip waits until the pointer moves, so one doesn't pop up under a pointer left where it was.
  body.addEventListener("pointermove", (e) => {
    if (pointerArmed) return;
    pointerArmed = true;
    const g = e.target instanceof Element && e.target.closest(".gx");
    if (g) setHover(g.dataset.id, g);
  });
  // On the document, so the keys still work when focus has fallen back to the page.
  document.addEventListener("keydown", (e) => { if (isOpen()) onKey(e); });
  for (const [bar, dir] of [[more, 1], [less, -1]]) bar.addEventListener("click", (e) => {
    const go = e.target instanceof Element && e.target.closest("[data-go]");
    if (go) return reveal(go.dataset.go);
    body.scrollBy({ top: dir * body.clientHeight * 0.8, behavior: "smooth" });
  });
}
const isOpen = () => !body.closest(".map").hidden;

export function show() {
  inspect = null; hover = null; pointerArmed = false; keyX = null;
  const now = DECISIONS.filter((d) => opts.stateOf(d.id).kind === "waiting").map((d) => d.id);
  fresh = seen ? new Set(now.filter((id) => !seen.has(id))) : new Set();
  seen = new Set([...(seen ?? []), ...now]);
  body.scrollTop = 0;
  render();
  requestAnimationFrame(() => {
    frame();
    // A brief pulse on the subject, so the moment of opening says where you are.
    body.querySelector(".gx.subject")?.animate([{ boxShadow: "0 0 0 0 #2e234366" }, { boxShadow: "0 0 0 10px #2e234300" }], { duration: 700, easing: "ease-out" });
  });
}
export const inspecting = () => inspect;
export function backToCard() {
  inspect = null; setHover(null); render(); opts.onChange?.();
  requestAnimationFrame(() => { frame(); focusQuietly(subject()); });
}
function focusQuietly(id) {
  quietFocus = true;
  body.querySelector(`.gx[data-id="${id}"]`)?.focus({ preventScroll: true });
  quietFocus = false;
}
/** Scroll so the subject and everything it's connected to fit on screen if they can; else centre the subject. */
function frame() {
  const s = subject();
  if (!s) return;
  const els = [s, ...relationsOf(s).map((r) => r.id)].map((id) => body.querySelector(`.gx[data-id="${id}"]`)).filter(Boolean);
  const b = body.getBoundingClientRect(), top = Math.min(...els.map((e) => e.getBoundingClientRect().top)), bottom = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
  const subj = els[0].getBoundingClientRect();
  if (bottom - top < b.height - 40) body.scrollTop += (top + bottom) / 2 - (b.top + b.height / 2);
  else body.scrollTop += subj.top - b.top - (b.height - subj.height) / 2;
  edges();
}
/** Bring one decision into view, without moving anything else. */
function reveal(id) {
  const el = body.querySelector(`.gx[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.animate([{ boxShadow: "0 0 0 0 #2c3da680" }, { boxShadow: "0 0 0 9px #2c3da600" }], { duration: 800, delay: 300, easing: "ease-out" });
}

/** The decision the map is about: the one you clicked to look at, or else the card you're answering. */
const subject = () => inspect ?? opts.currentId();

/** Relations in the card view's words, conflicts first. */
export function relationsOf(id) {
  if (!id) return [];
  const d = byDecision(id), out = [];
  const conflicts = new Set([...(d.conflicts ?? []), ...DECISIONS.filter((x) => (x.conflicts ?? []).includes(id)).map((x) => x.id)]);
  for (const c of conflicts) {
    const kind = opts.kindOf(id) === "conflict" ? "disagrees" : [c, id].some((x) => opts.stateOf(x).kind === "rule") ? "may conflict" : "conflicts";
    out.push({ id: c, kind, from: id, to: c });
  }
  for (const n of d.needs ?? []) out.push({ id: n, kind: "builds on", from: id, to: n });
  for (const x of DECISIONS) if ((x.needs ?? []).includes(id)) out.push({ id: x.id, kind: "built on it", from: x.id, to: id });
  const p = opts.precedentOf(id);
  if (p && !out.some((r) => r.id === p)) out.push({ id: p, kind: "your precedent", from: id, to: p });
  return out.filter((r) => opts.stateOf(r.id).kind !== "hidden").map((r, i) => ({ ...r, letter: LETTERS[i] }));
}

function describe(st) {
  return {
    waiting: st.stopped ? "to answer; an agent has stopped" : "to answer",
    answered: st.chose ? `answered: you chose “${st.chose}”` : "answered",
    settled: "settled", rule: "your rule", agent: "an agent's own call", deferred: "deferred",
  }[st.kind];
}
const shapeOf = (st) => st.rarity ?? st.kind;
const markOf = (id, size = 16) => { const st = opts.stateOf(id); return mark(shapeOf(st), size, { answered: st.kind === "answered", stopped: st.stopped }); };
function tagFor(r) {
  const whose = inspect ? "it" : opts.reviewing?.() ? "this card" : "your card";
  return { "builds on": `${whose} builds on this`, "built on it": `builds on ${whose}`, "may conflict": "may conflict", conflicts: "conflicts", disagrees: "disagrees", "your precedent": "your precedent" }[r.kind];
}
const visible = (d) => opts.stateOf(d.id).kind !== "hidden";

// ------------------------------------------------------------------ rendering
function render() {
  const s = subject(), cur = opts.currentId();
  const rel = relationsOf(s), relById = new Map(rel.map((r) => [r.id, r]));
  const lanes = WORKS.filter((w) => DECISIONS.some((d) => d.work === w.id && visible(d))).length;
  body.innerHTML = `<div class="tracks${lanes > 10 ? " dense" : ""}"><svg class="rels" aria-hidden="true"></svg><svg class="rel-ends" aria-hidden="true"></svg>
      <div class="tr-head" aria-hidden="true"><span>Area</span><span>Piece of work</span><span>Each piece of work's decisions, oldest <span class="arrow">→</span> newest</span></div>
      ${AREAS.map((a) => area(a, s, cur, relById)).join("")}</div>`;
  body.querySelectorAll(".gx").forEach((b) => {
    const id = b.dataset.id;
    b.addEventListener("click", () => act(id));
    b.addEventListener("pointerenter", () => { if (pointerArmed) setHover(id, b); });
    b.addEventListener("pointerleave", () => setHover(null));
    b.addEventListener("focus", () => { if (!quietFocus) setHover(id, b); });
    b.addEventListener("blur", () => setHover(null));
  });
  renderFoot(s, cur, rel);
  requestAnimationFrame(() => { drawLines(); edges(); });
}

function counts(areaId) {
  const ds = DECISIONS.filter((d) => areaOf(d).id === areaId && visible(d));
  const n = (k) => ds.filter((d) => opts.stateOf(d.id).kind === k).length;
  return { waiting: n("waiting"), answered: n("answered"), stopped: ds.filter((d) => opts.stateOf(d.id).stopped).length, settled: n("settled") + n("agent"), rules: n("rule"), deferred: n("deferred") };
}
function countLine(c) {
  const parts = [c.waiting ? `${c.waiting} to answer` : "nothing to answer"];
  if (c.stopped) parts.push(`${c.stopped} stopped`);
  if (c.answered) parts.push(`${c.answered} answered`);
  if (c.settled) parts.push(`${c.settled} settled`);
  if (c.rules) parts.push(plural(c.rules, "rule"));
  if (c.deferred) parts.push(`${c.deferred} deferred`);
  return parts.join(", ");
}

/** Three lines, always, so a count changing never moves anything: what needs you, what you've done, and the rest. */
function headLines(c) {
  const l1 = c.waiting ? `${c.waiting} to answer` : "nothing to answer";
  const l2 = c.stopped ? `${c.stopped} with an agent stopped` : "";
  const answered = c.answered ? `<span class="tally done" title="${c.answered} answered">✓${c.answered}</span>` : "";
  const l3 = answered + [[c.settled, "settled"], [c.rules, "rule"], [c.deferred, "deferred"]].filter(([n]) => n)
    .map(([n, k]) => `<span class="tally" title="${n} ${k === "rule" ? (n === 1 ? "rule" : "rules") : k}">${mark(k, 11)}${n}</span>`).join("");
  return `<p class="hl">${l1}</p><p class="hl">${l2 || "&nbsp;"}</p><p class="hl tl">${l3 || "&nbsp;"}</p>`;
}

function area(a, s, cur, relById) {
  const works = WORKS.filter((w) => w.area === a.id && DECISIONS.some((d) => d.work === w.id && visible(d)));
  const mine = s && areaOf(byDecision(s)).id === a.id;
  const c = counts(a.id);
  const touched = [...relById.keys()].some((id) => areaOf(byDecision(id)).id === a.id) || (cur && areaOf(byDecision(cur)).id === a.id);
  const quiet = !mine && !touched && !c.waiting; // nothing here needs you or touches the subject
  return `<section class="ar${mine ? " mine" : ""}${quiet ? " quiet" : ""}" data-area="${a.id}">
      <header title="${a.name}: ${countLine(c)}"><h3>${a.name}</h3>${headLines(c)}</header>
      <div class="ar-works">${works.map((w) => track(w, s, cur, relById)).join("")}</div>
    </section>`;
}

function track(w, s, cur, relById) {
  const ds = DECISIONS.filter((d) => d.work === w.id && visible(d)).sort((x, y) => x.t - y.t);
  // A name depends only on the decision's own state.
  const named = (d) => !QUIET.has(opts.stateOf(d.id).kind);
  return `<div class="wk"><p class="wk-name" title="${w.title}, by ${w.agent}">${w.title} <span>${w.agent}</span></p>
      <ol class="track">${ds.map((d) => `<li>${item(d, named(d), s, cur, relById)}</li>`).join("")}</ol></div>`;
}

function item(d, named, s, cur, relById) {
  const st = opts.stateOf(d.id), r = relById.get(d.id);
  const cls = ["gx", named ? "chip" : "dot", `k-${st.kind}`, d.id === s ? "subject" : "", d.id === cur ? "current" : "", r ? "rel" : "", r && /conflict|disagree/.test(r.kind) ? "rel-conflict" : ""].join(" ");
  const you = d.id === cur && s !== cur;
  const badge = r ? `<i class="letter${/conflict|disagree/.test(r.kind) ? " c" : ""}${you ? " wide" : ""}" aria-hidden="true">${r.letter}${you ? ", you" : ""}</i>` : you ? `<i class="letter you" aria-hidden="true">you</i>` : "";
  const label = `${d.short}: ${describe(st)}${r ? `; ${r.letter}, ${tagFor(r)}` : ""}${d.id === cur ? "; your card" : ""}`;
  const num = st.kind === "waiting" && st.order && st.order <= NEXT ? `<i class="num" title="Number ${st.order} to answer">${st.order}</i>` : "";
  const isNew = fresh.has(d.id) ? " fresh" : "";
  return `<button class="${cls}${isNew}" data-id="${d.id}" aria-label="${label}${isNew ? "; new since you last looked" : ""}">${badge}${markOf(d.id, 16)}${named ? `<span class="nm">${d.short}</span>${isNew ? `<i class="new">new</i>` : ""}` : ""}${num}</button>`;
}

/**
 * Above and below the tracks, outside them: what's out of view in each direction. The areas, the order numbers
 * of their cards to answer, stopped agents, and the letters of anything the subject is connected to. Each bar
 * keeps its row while the project overflows at all, so showing one never changes what the other can see.
 */
function edges() {
  const s = subject(), rel = relationsOf(s);
  const tracks = body.querySelector(".tracks");
  if (!tracks) return;
  const overflows = body.scrollHeight > body.clientHeight + 2 || !more.hidden || !less.hidden;
  const fits = tracks.offsetHeight + 24 <= body.clientHeight + (more.hidden ? 0 : more.offsetHeight) + (less.hidden ? 0 : less.offsetHeight);
  if (!overflows || fits) { more.hidden = true; less.hidden = true; return; }
  more.hidden = false; less.hidden = false;
  const b = body.getBoundingClientRect();
  const out = (el) => { const r = el.getBoundingClientRect(); return r.bottom < b.top + 8 ? -1 : r.top > b.bottom - 8 ? 1 : 0; };
  const say = (dir) => {
    const areas = AREAS.map((a) => {
      const el = body.querySelector(`.ar[data-area="${a.id}"]`);
      if (!el) return null;
      if (out(el) === dir) return a.name;
      const r = el.getBoundingClientRect(); // partly out of view on this side
      return (dir < 0 ? r.top < b.top - 20 : r.bottom > b.bottom + 20) ? `part of ${a.name}` : null;
    }).filter(Boolean);
    const waiting = opts.queue().filter((id) => { const el = body.querySelector(`.gx[data-id="${id}"]`); return el && out(el) === dir; });
    const stopped = waiting.filter((id) => opts.stateOf(id).stopped).length;
    const letters = rel.filter((r) => { const el = body.querySelector(`.gx[data-id="${r.id}"]`); return el && out(el) === dir; });
    const parts = [];
    if (areas.length) parts.push(areas.join(", "));
    const top = waiting.filter((id) => opts.stateOf(id).order <= NEXT), rest = waiting.length - top.length;
    if (waiting.length) parts.push(`${top.length ? `next up: ${top.map((id) => `<i class="ord">${opts.stateOf(id).order}</i>`).join("")}${rest ? ` and ` : ""}` : ""}${rest ? `${rest}${top.length ? " more" : ""} to answer` : ""}${stopped ? `, ${stopped} with an agent stopped` : ""}`);
    else if (areas.length) parts.push("nothing out of view needs you");
    const cur = opts.currentId(), curEl = cur && body.querySelector(`.gx[data-id="${cur}"]`);
    const youChip = curEl && cur !== s && out(curEl) === dir ? `<button class="edge-chip you" data-go="${cur}">you ${dir < 0 ? "↑" : "↓"} ${areaOf(byDecision(cur)).name}</button>` : "";
    const subjChip = s && out(body.querySelector(`.gx[data-id="${s}"]`)) === dir ? `<button class="edge-chip you" data-go="${s}">${inspect ? "looking at" : "your card"} ${dir < 0 ? "↑" : "↓"} ${areaOf(byDecision(s)).name}</button>` : "";
    const chips = subjChip + youChip + letters.map((r) => `<button class="edge-chip${/conflict|disagree/.test(r.kind) ? " c" : ""}" data-go="${r.id}">${r.letter} ${dir < 0 ? "↑" : "↓"} ${areaOf(byDecision(r.id)).name}</button>`).join("");
    return parts.length || chips ? `<span class="edge-txt">${dir < 0 ? "↑ Above" : "↓ Below"}: ${parts.join("; ")}</span>${chips}` : `<span class="edge-txt soft">${dir < 0 ? "The top of the project." : "The end of the project."}</span>`;
  };
  less.innerHTML = say(-1);
  more.innerHTML = say(1);
  // Showing the bars shrinks the tracks' window; measure once more so the first reading is right.
  if (!edges.again) { edges.again = true; requestAnimationFrame(() => { edges(); edges.again = false; }); }
}

// ------------------------------------------------------------------ the side panel
function renderFoot(s, cur, rel) {
  const q = opts.queue();
  const where = (id) => { const x = byDecision(id); return `in “${workOf(x).title}”, ${areaOf(x).name}`; };
  let left;
  if (s) {
    const d = byDecision(s), st = opts.stateOf(s);
    left = `<section class="mf-rel">
        <p class="mf-h">${inspect ? "You're looking at" : opts.reviewing?.() ? "The card you reopened" : "The card you're answering"}</p>
        <p class="mf-name">${markOf(s, 18)}<span><b>${d.short}</b><br><span class="soft">${cap(describe(st))}, ${where(s)}.</span></span></p>
        ${rel.length ? `<p class="mf-h" style="margin-top:12px">Connected to it, lettered on the map</p><ul>${rel.map((r) => `<li data-id="${r.id}"><button class="letter${/conflict|disagree/.test(r.kind) ? " c" : ""}" data-show="${r.id}" title="Show it on the map">${r.letter}</button><span class="rk t-${slug(r.kind)}">${tagFor(r)}</span><button class="mf-go" data-id="${r.id}">${markOf(r.id, 14)}<span>${byDecision(r.id).short}</span></button><span class="soft">${cap(describe(opts.stateOf(r.id)))}, ${where(r.id)}${r.id === cur ? ". It's your card" : ""}.</span></li>`).join("")}</ul>` : `<p class="soft">Nothing else is connected to it yet.</p>`}
        ${inspect && cur ? `<button class="mf-back" id="mf-back">Show my card's connections instead <kbd>Esc</kbd></button>` : ""}
      </section>`;
  } else {
    left = `<section class="mf-rel"><p class="mf-h">All answered</p><p class="soft">Nothing is waiting for you. Click any decision to see what it's connected to.</p></section>`;
  }
  const right = `<section class="mf-queue"><p class="mf-h">Next up, with stopped agents first</p>
      ${q.length ? `<ol>${q.slice(0, NEXT).map((id) => `<li><button class="mf-go${id === cur ? " cur" : ""}" data-id="${id}"><i class="ord">${opts.stateOf(id).order}</i>${markOf(id, 14)}<span>${byDecision(id).short} <span class="soft">${areaOf(byDecision(id)).name}</span></span></button></li>`).join("")}</ol>${q.length > NEXT ? `<p class="soft">and ${q.length - NEXT} more: the first five are numbered on the map.</p>` : ""}` : `<p class="soft">Nothing.</p>`}
    </section>`;
  foot.innerHTML = left + right;
  foot.querySelectorAll(".mf-go").forEach((b) => {
    // Hovering points at the decision on the map.
    const target = () => body.querySelector(`.gx[data-id="${b.dataset.id}"]`);
    b.addEventListener("click", () => act(b.dataset.id));
    b.addEventListener("pointerenter", () => target()?.classList.add("hovered", "pointed"));
    b.addEventListener("pointerleave", () => target()?.classList.remove("hovered", "pointed"));
  });
  foot.querySelector("#mf-back")?.addEventListener("click", backToCard);
  requestAnimationFrame(() => fitQueue(q.length));
  foot.querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", () => reveal(b.dataset.show)));
}

/** Drop queue items from the end until the panel fits, and keep the count of the rest in view. */
function fitQueue(total) {
  const ol = foot.querySelector(".mf-queue ol");
  if (!ol) return;
  let note = foot.querySelector(".mf-queue .more-note");
  if (!note) { note = document.createElement("p"); note.className = "soft more-note"; ol.after(note); }
  foot.querySelector(".mf-queue > p.soft:not(.more-note)")?.remove();
  const shown = () => ol.children.length;
  const say = () => { const rest = total - shown(); note.textContent = !rest ? "" : shown() ? `and ${rest} more. The first five are numbered on the map.` : `${rest} to answer. The first five are numbered on the map.`; };
  say();
  while (foot.scrollHeight > foot.clientHeight + 1 && shown() > 0) { ol.lastElementChild.remove(); say(); }
}

// ------------------------------------------------------------------ acting, hovering, keys
function act(id) {
  const st = opts.stateOf(id);
  setHover(null);
  if (st.kind === "waiting") return opts.onGo(id);
  if (st.kind === "answered") return opts.onReview(id);
  // Anything else: look at it and what it's connected to. Nothing moves; the outline, letters and lines change.
  inspect = id === opts.currentId() ? null : id;
  const keep = body.scrollTop;
  pointerArmed = false; // the pointer is over the new layout; wait for it to move before showing a tooltip
  render();
  body.scrollTop = keep;
  opts.onChange?.();
  focusQuietly(id);
}

function setHover(id, el) {
  hover = id;
  body.querySelectorAll(".hovered, .hrel").forEach((g) => g.classList.remove("hovered", "hrel"));
  if (!id) { tip.classList.remove("on"); drawLines(); return; }
  el.classList.add("hovered");
  const rels = id === subject() ? [] : relationsOf(id);
  rels.forEach((r) => body.querySelector(`.gx[data-id="${r.id}"]`)?.classList.add("hrel"));
  const d = byDecision(id), st = opts.stateOf(id), r = relationsOf(subject()).find((x) => x.id === id);
  const verb = el.matches(":focus-visible") && !el.matches(":hover") ? "Press Enter" : "Click";
  const action = st.kind === "waiting" ? `${verb} to answer it.` : st.kind === "answered" ? `${verb} to see your answer.` : `${verb} to see what it's connected to.`;
  const link = r ? `<span class="tip-rel">${r.letter}: ${tagFor(r)}</span>` : "";
  const others = rels.filter((x) => x.id !== subject());
  const links = others.length ? `<span class="tip-rel">Also connected to ${others.map((x) => `“${byDecision(x.id).short}” (${x.kind})`).join(", ")}</span>` : "";
  tip.innerHTML = `<b>${d.short}</b><br>${cap(describe(st))}, in “${workOf(d).title}”, ${areaOf(d).name}. ${action}${link}${links}`;
  // Below the decision, clear of its track; above it near the bottom of the map.
  const er = el.getBoundingClientRect(), box = tip.offsetParent.getBoundingClientRect(), br = body.getBoundingClientRect();
  tip.classList.add("on");
  const w = tip.offsetWidth, h = tip.offsetHeight;
  // Below or above, whichever keeps it off the subject (and the line between them); then whichever fits.
  const subj = body.querySelector(".gx.subject")?.getBoundingClientRect();
  const left = Math.max(br.left + 4, Math.min(br.right - w - 4, er.left));
  const place = (below) => ({ l: left, t: below ? er.bottom + 8 : er.top - 8 - h });
  const hits = (p) => subj && id !== subject() && !(p.l + w < subj.left || p.l > subj.right || p.t + h < subj.top || p.t > subj.bottom);
  const between = (below) => subj && (below ? subj.top > er.bottom : subj.bottom < er.top); // the line runs that way
  const fits = (p) => p.t > br.top && p.t + h < br.bottom;
  const options = [place(true), place(false)].map((p, i) => ({ p, bad: (hits(p) ? 2 : 0) + (between(i === 0) ? 1 : 0) + (fits(p) ? 0 : 4) }));
  const best = options.sort((x, y) => x.bad - y.bad)[0].p;
  tip.style.left = `${best.l - box.left}px`;
  tip.style.top = `${best.t - box.top}px`;
  drawLines();
}

function onKey(e) {
  if (e.target instanceof Element && e.target.closest("textarea, input")) return;
  if (e.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); focusQuietly(subject() ?? opts.queue()[0]); return; }
  const all = [...body.querySelectorAll(".gx")];
  const at = all.indexOf(document.activeElement);
  if (e.key === "j" || e.key === "k") {
    // j and k step through the cards to answer, in queue order.
    const order = opts.queue().map((id) => body.querySelector(`.gx[data-id="${id}"]`)).filter(Boolean);
    if (!order.length) return;
    const i = order.indexOf(document.activeElement);
    const nx = i < 0 ? (e.key === "j" ? 0 : order.length - 1) : (i + (e.key === "j" ? 1 : order.length - 1)) % order.length;
    order[nx].focus();
    order[nx].scrollIntoView({ block: "nearest" });
    e.preventDefault(); e.stopPropagation();
    return;
  }
  const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
  if (!dir) return;
  e.preventDefault();
  if (at < 0) return (body.querySelector(".gx.subject") ?? all[0])?.focus();
  // Spatial: along a track for ← and →; to the nearest decision in the next track for ↑ and ↓, keeping to the
  // column you started in, so ↑ undoes ↓.
  const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; };
  const from = c(all[at]);
  if (dir[1]) { keyX ??= from.x; from.x = keyX; } else keyX = null;
  let best = null, score = Infinity;
  const here = c(all[at]);
  const cands = all.filter((el) => el !== all[at]).map((el) => ({ el, p: c(el) })).filter(({ p }) =>
    dir[0] ? Math.abs(p.y - here.y) < 10 && (p.x - here.x) * dir[0] > 4 : (p.y - here.y) * dir[1] > 6);
  // ↑ and ↓ go to the adjacent track only, nearest to the column you started in.
  const nearestRow = dir[1] ? Math.min(...cands.map(({ p }) => Math.abs(p.y - here.y))) : 0;
  for (const { el, p } of cands) {
    if (dir[1] && Math.abs(Math.abs(p.y - here.y) - nearestRow) > 6) continue;
    const sc = dir[0] ? Math.abs(p.x - here.x) : Math.abs(p.x - from.x);
    if (sc < score) { score = sc; best = el; }
  }
  best?.focus();
  best?.scrollIntoView({ block: "nearest" });
}

// ------------------------------------------------------------------ the relation lines
const rectIn = (el, base) => { const r = el.getBoundingClientRect(); return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top }; };
function centre(id, base) {
  const el = body.querySelector(`.gx[data-id="${id}"] .mk`);
  if (!el) return null;
  const r = rectIn(el, base);
  return { x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 };
}

function drawLines() {
  const tracks = body.querySelector(".tracks"), svg = body.querySelector(".rels"), ends = body.querySelector(".rel-ends");
  if (!svg || !isOpen()) return;
  const base = tracks.getBoundingClientRect();
  for (const g of [svg, ends]) { g.setAttribute("width", tracks.scrollWidth); g.setAttribute("height", tracks.scrollHeight); }
  const lines = [], heads = [];
  const s = subject();
  const add = (id, cls) => relationsOf(id).forEach((rel, i) => {
    const a = centre(rel.from, base), c = centre(rel.to, base);
    if (!a || !c) return;
    const sameTrack = Math.abs(a.y - c.y) < 4;
    // Within a track, a low arc above it, so even neighbours show which way they point; between tracks, a curve
    // bowed sideways.
    const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(50, 14 + len * 0.1) * (i % 2 ? 1 : -1);
    const qx = sameTrack ? (a.x + c.x) / 2 : (a.x + c.x) / 2 - (dy / len) * bow, qy = sameTrack ? a.y - 30 : (a.y + c.y) / 2 + (dx / len) * bow;
    const at = (t) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * qx + t ** 2 * c.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * qy + t ** 2 * c.y });
    lines.push(`<path class="rel ${cls} r-${slug(rel.kind)}" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}"/>`);
    if (rel.kind === "builds on" || rel.kind === "built on it") {
      // The arrowhead goes on top, where the curve meets the mark it points at.
      const target = rectIn(body.querySelector(`.gx[data-id="${rel.to}"] .mk`), base);
      let t = 1;
      for (; t > 0.5; t -= 0.01) { const p = at(t); if (p.x < target.l - 3 || p.x > target.r + 3 || p.y < target.t - 3 || p.y > target.b + 3) break; }
      const tp = at(t), back = at(t - 0.04), ux = tp.x - back.x, uy = tp.y - back.y, ul = Math.hypot(ux, uy) || 1;
      const nx = ux / ul, ny = uy / ul;
      heads.push(`<path class="head ${cls}" d="M ${(tp.x + nx * 2).toFixed(1)} ${(tp.y + ny * 2).toFixed(1)} L ${(tp.x - nx * 8 - ny * 4.5).toFixed(1)} ${(tp.y - ny * 8 + nx * 4.5).toFixed(1)} L ${(tp.x - nx * 8 + ny * 4.5).toFixed(1)} ${(tp.y - ny * 8 - nx * 4.5).toFixed(1)} Z"/>`);
    }
  });
  if (s) add(s, "main");
  if (hover && hover !== s) add(hover, "hover");
  svg.innerHTML = lines.join("");
  ends.innerHTML = heads.join("");
}
