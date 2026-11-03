// The drum: a cylinder in CSS 3D, turning on a horizontal axle. A strip of slots round it, one row of the path in
// each; two knurled rims, a little proud of the strip; and the end toward the card, a disc with an impeller's
// vanes. Everything on it turns as one body (one rotateX on the drum), under a light that stays put: each slot and
// rib is shaded for where it faces now, every frame, so the light slides over the drum as it turns. The pawl and
// the payline in front are fixed; the pawl rides the detents and drops into each notch.

/** Degrees between rows, so slots round the drum. */
export const STEP = 15;
export const SLOTS = 360 / STEP;
/** The strip's radius, the rims' height above it, the drum's length along its axle, and a rim's width. */
export const R = 290, RIM_UP = 11, LEN = 368, RIM_W = 17;
/** Ribs round each rim: four a slot, so the knurl is finer than the rows; every other one is a groove, sunk
 *  this far, so the rims' edges are toothed where they turn away. */
const RIBS = 96, GROOVE = 3.5;
/** Room on a slot's right for its node, from the strip's edge. */
const NODE_PAD = 10;
/** The turn (units: slots and seconds). A push against the detent's resistance until the drum is over the hump,
 *  then a stiff, lightly damped catch into the notch: a slow start, a snap, a small overshoot, settled. */
const PUSH = 48, DETENT = 32, CATCH = 520, CATCH_DAMP = 25, FRICTION = 2.5, VMAX = 7;

const rad = (d) => (d * Math.PI) / 180;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** Toward the light: left, up, and in front. */
const LIGHT = norm([-0.35, -0.34, 0.87]);

/** How much shade and highlight a surface facing `phi` degrees above the front gets: a key light above and to the
 *  left, darkening toward both edges, and a soft band of reflected light a little above the front. */
function lightAt(phi, gloss = 1) {
  const s = Math.sin(rad(phi)), c = Math.cos(rad(phi));
  const diff = Math.max(0, -s * LIGHT[1] + c * LIGHT[2]);
  let b = 0.3 + 0.76 * diff;
  b *= 0.46 + 0.54 * Math.pow(Math.max(0, c), 1.1);
  const band = Math.exp(-(((phi - 22) / 8) ** 2));
  return { d: clamp(1.02 - b, 0, 0.9), h: 0.36 * gloss * band };
}

export class Drum {
  /** @param {{scene: HTMLElement, drum: HTMLElement, over: SVGSVGElement, cast: HTMLElement}} els */
  constructor(els) {
    Object.assign(this, els);
    this.pos = 0;
    this.vel = 0;
    this.target = 0;
    this.slotH = 2 * R * Math.tan(rad(STEP / 2));
    this.band = LEN - 2 * RIM_W + 6;
    const st = this.drum.style;
    st.setProperty("--band", `${this.band}px`);
    st.setProperty("--slot-h", `${this.slotH + 0.8}px`);
    st.setProperty("--rim-w", `${RIM_W}px`);
    st.setProperty("--len", `${LEN}px`);
    st.setProperty("--rim-r", `${R + RIM_UP}px`);
    st.setProperty("--node-pad", `${NODE_PAD + RIM_W - 3}px`);
    this.build();
    this.raf = 0;
    this.last = 0;
    this.listeners = [];
    this.notches = [];
  }

  build() {
    this.slots = [];
    for (let s = 0; s < SLOTS; s++) {
      const el = document.createElement("div");
      el.className = "slot";
      el.style.transform = `rotateX(${-s * STEP}deg) translateZ(${R}px)`;
      el.innerHTML = `<div class="row blank"></div><div class="shade"></div>`;
      this.drum.append(el);
      this.slots.push({ el, row: el.firstChild, shade: el.lastChild });
    }
    this.ribs = [];
    for (const side of ["l", "r"]) {
      for (let k = 0; k < RIBS; k++) {
        const el = document.createElement("div");
        const sunk = k % 2 === 1, r = R + RIM_UP - (sunk ? GROOVE : 0);
        el.className = `rib ${side}${sunk ? " groove" : ""}`;
        // Each rib as tall as its share of the circle at its own radius, a hair more so no seam shows.
        el.style.height = `${2 * r * Math.tan(rad(180 / RIBS)) + (sunk ? 1.2 : 0.4)}px`;
        el.style.top = `${-(r * Math.tan(rad(180 / RIBS)) + (sunk ? 0.6 : 0.2))}px`;
        el.style.transform = `rotateX(${(-k * 360) / RIBS}deg) translateZ(${r}px)`;
        this.drum.append(el);
        this.ribs.push({ el, a: (-k * 360) / RIBS, side });
      }
    }
    // The end toward the card, facing it: seen at a slant, it shows the drum's thickness and turns with it.
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.style.transform = `translateX(${LEN / 2}px) rotateY(90deg)`;
    cap.innerHTML = capSvg();
    this.drum.append(cap);
    // The light on that end stays put while the vanes turn under it: a sheen turned back by the drum's own angle.
    this.sheen = document.createElement("div");
    this.sheen.className = "cap sheen";
    this.drum.append(this.sheen);
  }

  /** Where the drum sits on the desk: its axle's centre, and the eye it's seen from. */
  layout({ cx, cy, eyeX, eyeY, persp = 1100 }) {
    Object.assign(this, { cx, cy, eyeX, eyeY, persp });
    this.drum.style.setProperty("--cx", `${cx}px`);
    this.drum.style.setProperty("--cy", `${cy}px`);
    this.scene.style.setProperty("--persp", `${persp}px`);
    this.scene.style.perspectiveOrigin = `${eyeX}px ${eyeY}px`;
    // The shadow it casts on the desk, down and to the right of the light.
    const half = R * (persp / (persp + R)) + RIM_UP;
    Object.assign(this.cast.style, { left: `${cx - LEN / 2 + 26}px`, top: `${cy - half + 40}px`, width: `${LEN + 26}px`, height: `${2 * half - 30}px` });
    this.half = half;
    this.draw();
  }

  /** Where a point on the desk plane at depth z (0 is the drum's front) is seen. */
  proj(x, y, z) {
    const k = this.persp / (this.persp - z);
    return { x: this.eyeX + (x - this.eyeX) * k, y: this.eyeY + (y - this.eyeY) * k };
  }
  /** How far right the end you can see reaches, at the front's height: past it, the pawl's pin. */
  get capRight() { return this.proj(this.cx + LEN / 2, this.cy, -(2 * R + RIM_UP)).x; }
  /** The top of the drum as seen, for the count above it. */
  get top() { return this.proj(this.cx, this.cy - R - RIM_UP, -R); }

  /** The front row's node, and the right end of the drum at the front, on the desk. */
  get front() {
    const nodeX = this.cx + this.band / 2 - (NODE_PAD + RIM_W - 3) - 15;
    return { nodeX, rimX: this.cx + LEN / 2 - RIM_W / 2, endX: this.cx + LEN / 2, y: this.cy };
  }

  /** What's printed on each slot: `rows` maps a position on the path (0 the first card) to a row's HTML. */
  print(rows) {
    for (const s of this.slots) s.used = false;
    for (const [i, { cls, html }] of rows) {
      const s = this.slots[((i % SLOTS) + SLOTS) % SLOTS];
      s.used = true;
      if (s.row.className !== `row ${cls}`) s.row.className = `row ${cls}`;
      if (s.html !== html) s.row.innerHTML = s.html = html;
    }
    for (const s of this.slots) if (!s.used && s.html !== "") { s.row.className = "row blank"; s.row.innerHTML = s.html = ""; }
  }

  /** Turn to put path position `n` at the front: with weight, or at once (reduced motion, or the first draw). */
  turnTo(n, instant = false) {
    this.target = n;
    if (instant) {
      this.pos = n;
      this.vel = 0;
      this.draw();
      return;
    }
    if (!this.raf) {
      this.lastNotch = Math.round(this.pos);
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
  }

  get turning() { return this.raf !== 0; }
  onLand(f) { this.listeners.push(f); }
  onNotch(f) { this.notches.push(f); }

  tick(now) {
    let dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const before = this.pos - this.target, was = this.pos;
    while (dt > 0) {
      const h = Math.min(dt, 0.001);
      const off = this.target - this.pos;
      let a;
      if (Math.abs(off) > 0.5) a = PUSH * Math.sign(off) - DETENT * Math.sin(2 * Math.PI * this.pos) - FRICTION * this.vel;
      else a = CATCH * off - CATCH_DAMP * this.vel;
      this.vel = clamp(this.vel + a * h, -VMAX, VMAX);
      this.pos += this.vel * h;
      dt -= h;
    }
    const after = this.pos - this.target;
    // Every notch the drum passes clicks, once: not as it leaves one, nor as the overshoot swings back through it.
    const n = Math.ceil(Math.min(was, this.pos));
    if (n > Math.min(was, this.pos) && n < Math.max(was, this.pos) && n !== this.lastNotch) {
      this.lastNotch = n;
      for (const f of this.notches) f();
    }
    if (before !== 0 && Math.sign(before) !== Math.sign(after)) for (const f of this.listeners) f();
    if (Math.abs(this.target - this.pos) < 0.0006 && Math.abs(this.vel) < 0.004) {
      this.pos = this.target;
      this.vel = 0;
      this.raf = 0;
    } else {
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
    this.draw();
  }

  draw() {
    const A = this.pos * STEP;
    this.drum.style.transform = `translateZ(${-R}px) rotateX(${A}deg)`;
    this.sheen.style.transform = `rotateX(${-A}deg) translateX(${LEN / 2 + 0.6}px) rotateY(90deg)`;
    for (let s = 0; s < SLOTS; s++) {
      const slot = this.slots[s], { el, shade } = slot;
      const phi = wrap(A - s * STEP);
      const seen = Math.abs(phi) < 96;
      if (slot.seen !== seen) el.style.visibility = seen ? "" : "hidden";
      slot.seen = seen;
      if (!seen) continue;
      const t = lightAt(phi + STEP / 2), m = lightAt(phi), b = lightAt(phi - STEP / 2);
      const ss = shade.style;
      ss.setProperty("--d0", t.d.toFixed(3));
      ss.setProperty("--d1", m.d.toFixed(3));
      ss.setProperty("--d2", b.d.toFixed(3));
      ss.setProperty("--h0", t.h.toFixed(3));
      ss.setProperty("--h1", m.h.toFixed(3));
      ss.setProperty("--h2", b.h.toFixed(3));
    }
    for (const r of this.ribs) {
      const phi = wrap(A + r.a);
      const seen = Math.abs(phi) < 96;
      r.el.style.visibility = seen ? "" : "hidden";
      if (!seen) continue;
      const l = lightAt(phi, 2.6);
      r.el.style.setProperty("--d", (l.d * 0.9).toFixed(3));
      r.el.style.setProperty("--h", Math.min(0.75, l.h * (r.side === "l" ? 1.25 : 0.9)).toFixed(3));
    }
    this.movePawl();
  }

  /** In front, fixed: the pawl on the right rim at the front, lifted by the detent between notches, and the payline. */
  drawOver() {
    if (this.cx === undefined) return;
    const f = this.front;
    const lift = this.lift();
    // The pawl's pin sits on the payline, past the end you can see; its tongue lies along the line to the rim at the
    // front and drops into a notch there. Between notches the ribs lift it; it falls back as the drum clicks home.
    const px = Math.max(f.endX + 40, this.capRight + 16), py = f.y;
    const card = this.cardLeft ?? f.endX + 120;
    const len = px - (f.rimX - 2);
    this.over.innerHTML = `
      <line class="pay" x1="${f.nodeX + 16}" y1="${f.y}" x2="${card}" y2="${f.y}"/>
      <circle class="index" cx="${f.nodeX}" cy="${f.y}" r="16"/>
      <g class="pawl" transform="translate(${px} ${py}) rotate(${(180 + lift).toFixed(2)})">
        <path class="pawl-arm" d="M -3 -5.5 L ${len - 9} -2.4 L ${len} 3.4 L ${len - 9} 3 L -3 5.5 Z"/>
        <path class="pawl-hi" d="M 3 -3.2 L ${len - 12} -1.2"/>
      </g>
      <circle class="pawl-pin" cx="${px}" cy="${py}" r="6.5"/>
      <circle cx="${px}" cy="${py}" r="2" fill="#2e2343"/>
      ${this.extra ?? ""}`;
    this.pawl = this.over.querySelector(".pawl");
    this.pawlAt = [px, py];
  }
  /** How far the ribs have lifted the pawl: not at all in a notch, most halfway between two. */
  lift() {
    return Math.sin(Math.PI * Math.abs(this.pos - Math.round(this.pos))) * 12;
  }
  movePawl() {
    if (!this.pawl) return this.drawOver();
    this.pawl.setAttribute("transform", `translate(${this.pawlAt[0]} ${this.pawlAt[1]}) rotate(${(180 + this.lift()).toFixed(2)})`);
  }
}

function wrap(a) {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a;
}

/** The end disc, toward the card: a rim of notches, seven curved vanes from the hub, the hub and its axle. */
function capSvg() {
  const notches = [];
  for (let k = 0; k < RIBS; k++) {
    const a = (k * 360) / RIBS;
    notches.push(`<rect x="0.955" y="-0.018" width="0.05" height="0.036" transform="rotate(${a})" fill="#140c22"/>`);
  }
  const vanes = [];
  for (let k = 0; k < 7; k++) {
    const a = (k * 360) / 7;
    vanes.push(`<path d="M 0.2 0 C 0.42 0.04 0.62 0.2 0.86 0.44" transform="rotate(${a})" fill="none" stroke="#8576a3" stroke-width="0.075" stroke-linecap="round"/>`);
    vanes.push(`<path d="M 0.2 0 C 0.42 0.04 0.62 0.2 0.86 0.44" transform="rotate(${a + 2.6})" fill="none" stroke="#1c1330" stroke-width="0.03" stroke-linecap="round"/>`);
  }
  return `<svg viewBox="-1 -1 2 2"><defs><radialGradient id="capg" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#55476f"/><stop offset=".7" stop-color="#3a2d52"/><stop offset=".93" stop-color="#2b2040"/><stop offset="1" stop-color="#4a3c63"/></radialGradient></defs>
    <circle r="1" fill="url(#capg)"/>
    <circle r="0.93" fill="none" stroke="#1a1129" stroke-width="0.012"/>
    ${notches.join("")}${vanes.join("")}
    <circle r="0.22" fill="#3d3056" stroke="#1a1129" stroke-width="0.02"/>
    <circle r="0.1" fill="#bdb0c6" stroke="#1a1129" stroke-width="0.015"/></svg>`;
}
