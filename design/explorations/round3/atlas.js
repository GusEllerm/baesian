// The Atlas: one stable map of the project (Contextualising Decisions, concept A).
// Fixed coordinates, never re-laid-out: areas are columns, each piece of work is a lane, decisions sit
// along the lane in the order they were filed. Semantic zoom shows different detail at each level.

import { animate } from "https://cdn.jsdelivr.net/npm/motion@14.6.0/+esm";
import { AREAS, DECISIONS, WORKS, areaOf, byDecision, dependentsOf, workOf } from "./data.js";

const NS = "http://www.w3.org/2000/svg";
const STEP = 210, COL_W = 4 * STEP + 130, COL_GAP = 70, LEFT = 60, TOP = 70, LANE_H = 190;

const el = (name, attrs = {}, text) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};

// ------------------------------------------------------------------ layout (deterministic)
const pos = new Map();
const laneY = new Map();
const areaX = new Map();
AREAS.forEach((a, i) => areaX.set(a.id, LEFT + i * (COL_W + COL_GAP)));
for (const a of AREAS) {
  WORKS.filter((w) => w.area === a.id).forEach((w, j) => laneY.set(w.id, TOP + 150 + j * LANE_H));
}
for (const d of DECISIONS) {
  const w = workOf(d);
  pos.set(d.id, { x: areaX.get(w.area) + 70 + (d.t - 1) * STEP, y: laneY.get(w.id) });
}
const WORLD = { w: LEFT * 2 + AREAS.length * COL_W + (AREAS.length - 1) * COL_GAP, h: TOP + 110 + 2 * LANE_H + 60 };

export const positionOf = (id) => pos.get(id);

// ------------------------------------------------------------------ marks
export function markPath(kind, s) {
  if (kind === "common") return `M ${-s} 0 a ${s} ${s} 0 1 0 ${2 * s} 0 a ${s} ${s} 0 1 0 ${-2 * s} 0`;
  if (kind === "uncommon") return `M 0 ${-s * 1.25} L ${s * 1.1} 0 L 0 ${s * 1.25} L ${-s * 1.1} 0 Z`;
  if (kind === "rare") {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.55 : s * 1.3, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
    }
    return `M ${pts.join(" L ")} Z`;
  }
  // mythic: a crown
  return `M ${-s * 1.3} ${s * 0.9} L ${-s * 1.3} ${-s * 0.5} L ${-s * 0.6} ${s * 0.1} L 0 ${-s * 1.1} L ${s * 0.6} ${s * 0.1} L ${s * 1.3} ${-s * 0.5} L ${s * 1.3} ${s * 0.9} Z`;
}

// A tapered edge (wide at the dependency, narrow at what depends on it), as a filled polygon.
function taper(a, b, w0 = 5, w1 = 1.2) {
  // Lift long arcs further, so they clear the decisions and labels between their ends.
  const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - 36 - Math.hypot(b.x - a.x, b.y - a.y) * 0.22;
  const pt = (t) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t ** 2 * b.y });
  const left = [], right = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, p = pt(t), q = pt(Math.min(1, t + 0.01)), r = pt(Math.max(0, t - 0.01));
    const dx = q.x - r.x, dy = q.y - r.y, len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push(`${(p.x - (dy / len) * w).toFixed(1)},${(p.y + (dx / len) * w).toFixed(1)}`);
    right.push(`${(p.x + (dy / len) * w).toFixed(1)},${(p.y - (dx / len) * w).toFixed(1)}`);
  }
  return [...left, ...right.reverse()].join(" ");
}

function wrap(text, max) {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// ------------------------------------------------------------------ render
let svg, cam = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
let rarityOfNode = () => null;

export function mount(root, opts) {
  rarityOfNode = opts.rarityOf;
  svg = el("svg", { class: "atlas", "aria-label": "Map of the project's decisions" });
  const defs = el("defs");
  const hatch = el("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  hatch.append(el("rect", { width: 6, height: 6, fill: "#f3e6bc" }), el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "#8E3A5F", "stroke-width": 3 }));
  defs.append(hatch);
  svg.append(defs);

  const gAreas = el("g", { class: "areas" }), gEdges = el("g", { class: "edges" }), gNodes = el("g", { class: "nodes" });
  for (const a of AREAS) {
    const x = areaX.get(a.id);
    const g = el("g", { class: "area", "data-area": a.id });
    g.append(el("rect", { x: x - 20, y: TOP - 30, width: COL_W, height: WORLD.h - TOP, rx: 14, class: "area-bg" }));
    g.append(el("text", { x, y: TOP, class: "area-name" }, a.name));
    const open = DECISIONS.filter((d) => areaOf(d).id === a.id && (d.state === "open" || d.state === "practice")).length;
    g.append(el("text", { x, y: TOP + 26, class: "area-count" }, open ? `${open} waiting for you` : "nothing waiting"));
    for (const w of WORKS.filter((w) => w.area === a.id)) {
      const y = laneY.get(w.id);
      g.append(el("line", { x1: x, y1: y, x2: x + COL_W - 50, y2: y, class: "lane" }));
      g.append(el("text", { x, y: y - 72, class: "work-title" }, w.title));
      g.append(el("text", { x, y: y - 54, class: "work-meta" }, `${w.id}, by ${w.agent}`));
    }
    gAreas.append(g);
  }
  for (const d of DECISIONS) {
    for (const n of d.needs ?? []) {
      gEdges.append(el("polygon", { points: taper(pos.get(n), pos.get(d.id)), class: "edge", "data-from": n, "data-to": d.id }));
    }
    for (const c of d.conflicts ?? []) {
      const a = pos.get(d.id), b = pos.get(c);
      gEdges.append(el("path", { d: `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 70} ${b.x} ${b.y}`, class: "conflict", "data-from": d.id, "data-to": c }));
    }
  }
  for (const d of DECISIONS) {
    const p = pos.get(d.id);
    const g = el("g", { class: `node state-${d.state}`, "data-id": d.id, transform: `translate(${p.x} ${p.y})` });
    const title = el("title", {}, d.short);
    g.append(title);
    (d.commits ?? []).forEach((c, i) => {
      const t = el("rect", { x: 20 + i * 10, y: -24, width: 7, height: 14, rx: 1.5, class: "commit", "data-of": d.id });
      t.append(el("title", {}, `Commit: ${c}`));
      g.append(t);
    });
    const r = rarityOfNode(d.id);
    if (r) g.append(el("path", { d: markPath(r, 9), class: `mark rarity-${r}` }));
    else if (d.state === "rule") g.append(el("rect", { x: -8, y: -8, width: 16, height: 16, rx: 2, class: "mark rule" }));
    else g.append(el("circle", { r: d.state === "agent" ? 5.5 : 7, class: "mark" }));
    g.append(el("circle", { r: 17, class: "halo" }));
    const lines = wrap(d.short, 24);
    const label = el("text", { x: 0, y: 34, class: "label" });
    lines.forEach((line, i) => label.append(el("tspan", { x: 0, dy: i ? "1.15em" : 0 }, line)));
    g.append(label);
    const subY = 34 + lines.length * 16 + 4;
    if (d.state === "rule") g.append(el("text", { x: 0, y: subY, class: "sub" }, "rule"));
    if (d.state === "agent") g.append(el("text", { x: 0, y: subY, class: "sub" }, "an agent's own call"));
    if (d.state === "deferred") g.append(el("text", { x: 0, y: subY, class: "sub" }, "deferred"));
    if ((d.commits ?? []).length) g.append(el("text", { x: 20, y: -30, class: "sub commits-count" }, `${d.commits.length} commit${d.commits.length === 1 ? "" : "s"}`));
    gNodes.append(g);
  }
  const preview = el("text", { class: "preview-label", x: 0, y: 0 });
  svg.append(gAreas, gEdges, gNodes, preview);
  root.append(svg);
  applyCamera();
  addEventListener("resize", applyCamera);
  return svg;
}

// ------------------------------------------------------------------ camera
function applyCamera() {
  svg.setAttribute("viewBox", `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
}
function aspect() {
  const r = svg.getBoundingClientRect();
  return r.height / Math.max(1, r.width);
}
/** The view for a level: the card level puts the decision at the given screen anchor. */
function viewFor(level, id) {
  const ar = aspect();
  if (level === "project") {
    const w = Math.max(WORLD.w + 60, (WORLD.h + 120) / ar);
    return { x: (WORLD.w - w) / 2, y: (WORLD.h - w * ar) / 2 - 20, w, h: w * ar };
  }
  const p = pos.get(id), area = areaOf(byDecision(id));
  if (level === "area") {
    const w = COL_W * 2.3;
    const ax = areaX.get(area.id) + COL_W / 2;
    return { x: ax - w * 0.6, y: TOP - 120, w, h: w * ar };
  }
  // The card covers the left ~46% of the screen: put the area's left edge just right of it, at about
  // one world unit per pixel, so the whole work lane, its title and its neighbours stay visible.
  const w = Math.max(1150, Math.min(1500, svg.getBoundingClientRect().width));
  const left = areaX.get(area.id) - 40;
  const x = Math.min(left - w * 0.47, p.x - w * 0.56);
  return { x, y: TOP - 90, w, h: w * ar };
}

let level = "card", focusId = null;
export const currentLevel = () => level;

function setLevelClass(l) {
  svg.dataset.level = l;
}

async function glide(to, ms, reduced) {
  if (reduced) { cam = { ...to }; applyCamera(); return; }
  const from = { ...cam };
  await new Promise((resolve) => {
    animate(0, 1, {
      duration: ms / 1000,
      ease: "easeInOut",
      onUpdate: (t) => {
        cam = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t };
        applyCamera();
      },
      onComplete: resolve,
    });
  });
}

/**
 * Fly to a decision. Staged (Heer & Robertson): out to the shared ancestor, across, back in. Within
 * the same work it's one glide.
 */
export async function focus(id, { reduced = false, first = false } = {}) {
  const prev = focusId;
  focusId = id;
  svg.dataset.focusArea = areaOf(byDecision(id)).id;
  svg.dataset.focusWork = workOf(byDecision(id)).id;
  svg.querySelectorAll(".node").forEach((n) => n.classList.toggle("current", n.dataset.id === id));
  svg.querySelectorAll(".conflict").forEach((c) => c.classList.toggle("related", c.dataset.from === id || c.dataset.to === id));
  markAffected(id);
  if (first || !prev) { cam = viewFor("card", id); applyCamera(); setLevelClass("card"); level = "card"; return; }
  const sameWork = workOf(byDecision(prev)).id === workOf(byDecision(id)).id;
  const sameArea = areaOf(byDecision(prev)).id === areaOf(byDecision(id)).id;
  if (!sameWork) {
    setLevelClass(sameArea ? "area" : "project");
    await glide(viewFor(sameArea ? "area" : "project", sameArea ? id : prev), 260, reduced);
    if (!sameArea) await glide(viewFor("area", id), 260, reduced);
  }
  await glide(viewFor("card", id), sameWork ? 420 : 300, reduced);
  setLevelClass("card");
  level = "card";
}

/** Holding Space: zoom out one level, and back (Contextualising Decisions, the Atlas). */
export async function peek(out, { reduced = false } = {}) {
  if (!focusId) return;
  const to = out ? (level === "card" ? "area" : "project") : "card";
  setLevelClass(to);
  await glide(viewFor(to, focusId), 240, reduced);
  level = to;
}

/** Where a decision is on screen, for the thread from the card. */
export function screenOf(id) {
  const p = pos.get(id), r = svg.getBoundingClientRect();
  return { x: r.left + ((p.x - cam.x) / cam.w) * r.width, y: r.top + ((p.y - cam.y) / cam.h) * r.height };
}

// ------------------------------------------------------------------ consequence preview (concept C)
let affected = { commits: [], deps: [], edges: [] };
function markAffected(id) {
  svg.querySelectorAll(".affected").forEach((n) => n.classList.remove("affected"));
  affected = {
    commits: [...svg.querySelectorAll(`.commit[data-of="${id}"]`)],
    deps: dependentsOf(id).map((d) => svg.querySelector(`.node[data-id="${d.id}"]`)),
    edges: [...svg.querySelectorAll(`.edge[data-from="${id}"]`)],
  };
  [...affected.commits, ...affected.deps, ...affected.edges].forEach((n) => n.classList.add("affected"));
}

/**
 * Scrub the map with the drag. dir: "proposal" | "alternative" | null; p: 0..1. Toward the
 * alternative the commits built on it are hatched for rework and its dependents fade; toward the
 * proposal they firm up and the dependents light as unblocked.
 */
export function preview(dir, p, text) {
  svg.dataset.preview = dir ?? "";
  svg.style.setProperty("--p", String(Math.min(1, Math.max(0, p))));
  const label = svg.querySelector(".preview-label");
  if (!dir || p < 0.12 || !focusId) { label.textContent = ""; return; }
  const at = pos.get(focusId);
  label.setAttribute("x", at.x);
  label.setAttribute("y", at.y + 76);
  label.textContent = text;
}

// ------------------------------------------------------------------ footprints
export function stamp(id, verdict) {
  const n = svg.querySelector(`.node[data-id="${id}"]`);
  if (!n) return;
  n.classList.add("answered", `answered-${verdict}`);
  const label = n.querySelector(".label");
  if (label) label.textContent = `${byDecision(id).short}`;
  n.querySelector(".halo")?.setAttribute("r", 13);
}
export function unstampAll() {
  svg.querySelectorAll(".node.answered").forEach((n) => n.classList.remove("answered", "answered-proposal", "answered-alternative", "answered-other"));
}
