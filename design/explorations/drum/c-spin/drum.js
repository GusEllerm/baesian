// The drum: a short, thick cylinder in CSS 3D, turning on a horizontal axis, with your path mounted on it as plates.
// Built once; every frame sets one transform on the drum (it turns as one body) and the light on each plate.
//
//   .scene     perspective, seen from a little above and to the right (toward the card), so its right end shows
//   .drum      preserve-3d; translateZ(-R) puts the front plate at z = 0, drawn 1:1 (crisp text, true clicks);
//              rotateY tips the right end toward you; rotateX(p · STEP) is the turn itself
//     .plate   one per slot, rotateX(-j · STEP) translateZ(R): the rows (18 slots; 12 cards, so a strip longer than
//              the drum would just reuse the slots out of sight at the back, like a reel)
//     .flange  the ribbed rims at either end, a little proud of the plates, one rib per row: the detents
//     .wall    the left rim's inner face, which you see past the plates
//     .cap     the right end, a disc facing you at an angle, with a tick per row: it turns with the drum
//   .frame     not turning: the pawl that rides the right rim's ribs and points at the front row
//
// The light is fixed in the room, so as a plate turns away it moves out of the light (from the upper left) into
// shade, and the gloss line on the rims stays where it is while the ribs run through it.

import { createDrum } from "./physics.js";
import { markSvg } from "./marks.js";

export const GEO = (() => {
  const R = 180, STEP = 20, N = 360 / 20, L = 344, F = 15, RIM = 11;
  const t = Math.tan(((STEP / 2) * Math.PI) / 180);
  return { R, STEP, N, L, F, RIM, RF: R + RIM, H: 2 * R * t, HF: 2 * (R + RIM) * t, YAW: -9, PERSPECTIVE: 900 };
})();
const { R, STEP, N, L, F, RIM, RF, H, HF, YAW } = GEO;
/** How far your hand moves the drum: a row's height at the front, so a drag holds the surface under the pointer. */
const ROW_PX = (R * STEP * Math.PI) / 180;
/** After the last wheel event, how long until the hand has let go of the wheel. */
const WHEEL_IDLE = 130;
/** Where the drum's axis sits across the scene, from its left edge. */
const DRUM_X = 196;

// ---------------------------------------------------------------- light
const norm = (v) => {
  const m = Math.hypot(...v);
  return v.map((x) => x / m);
};
const LIGHT = norm([-0.5, -0.46, 0.74]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
const yaw = (YAW * Math.PI) / 180;
/** A plate's normal when it's φ degrees above the front, in the room. */
const normal = (phi) => {
  const f = (phi * Math.PI) / 180;
  return [Math.cos(f) * Math.sin(yaw), -Math.sin(f), Math.cos(f) * Math.cos(yaw)];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const D_MAX = Math.max(...Array.from({ length: 181 }, (_, k) => dot(normal(k - 90), LIGHT)));
/** The angle where the gloss sits: where a surface faces halfway between the light and your eye. */
const GLOSS_AT = (() => {
  const A = HALF[0] * Math.sin(yaw) + HALF[2] * Math.cos(yaw), B = -HALF[1];
  return (Math.atan2(B, A) * 180) / Math.PI;
})();
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** How much shade lies on the surface at φ: out of the light, and darker still as it turns edge-on. */
function shadeAt(phi) {
  const d = Math.max(0, dot(normal(phi), LIGHT)) / D_MAX;
  const lit = 0.2 + 0.8 * d;
  return Math.min(0.92, (1 - lit) * 0.86 + 0.46 * smooth(46, 92, Math.abs(phi)));
}

// ---------------------------------------------------------------- building it
const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.append(e);
  return e;
};

export function createReel(root, opts) {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = el("div", "scene", root);
  const drum = el("div", "drum", scene);
  const frame = el("div", "frame", scene);
  for (const box of [drum, frame]) Object.assign(box.style, { width: `${L}px`, height: `${H}px`, marginLeft: `${-L / 2}px`, marginTop: `${-H / 2}px` });
  frame.style.transform = `translateZ(${-R}px) rotateY(${YAW}deg)`;
  // Seen from a little above, and from just past its right end, toward the card.
  scene.style.perspective = `${GEO.PERSPECTIVE}px`;
  scene.style.perspectiveOrigin = `calc(${DRUM_X}px + ${L / 2 + 64}px) calc(50% - 84px)`;
  drum.style.left = frame.style.left = `${DRUM_X}px`;
  // Motion blur: at speed, each plate's print smears along the way it's moving (in the plate's own plane, so up
  // and down the drum, foreshortened with it).
  const blurSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  blurSvg.setAttribute("width", "0");
  blurSvg.setAttribute("height", "0");
  blurSvg.style.position = "absolute";
  blurSvg.innerHTML = `<filter id="drum-smear" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="0 0"/></filter>`;
  root.append(blurSvg);
  const smear = blurSvg.querySelector("feGaussianBlur");
  let smearAt = 0;

  const slots = [];
  for (let j = 0; j < N; j++) {
    const a = -j * STEP;
    const plate = el("div", "plate", drum);
    Object.assign(plate.style, { left: `${F}px`, width: `${L - 2 * F}px`, height: `${H}px`, transform: `rotateX(${a}deg) translateZ(${R}px)` });
    const flanges = [0, L - F].map((x, k) => {
      const f = el("div", `flange ${k ? "right" : "left"}`, drum);
      Object.assign(f.style, { left: `${x}px`, width: `${F}px`, top: `${(H - HF) / 2}px`, height: `${HF}px`, transform: `rotateX(${a}deg) translateZ(${RF}px)` });
      return f;
    });
    const wall = el("div", "wall", drum);
    Object.assign(wall.style, { left: `${F - RIM / 2}px`, width: `${RIM}px`, top: `${(H - HF) / 2}px`, height: `${HF}px`, transform: `rotateX(${a}deg) translateZ(${R + RIM / 2}px) rotateY(90deg)` });
    slots.push({ j, plate, flanges, wall, index: undefined, shown: true });
  }
  // The right end: a disc as wide as the rims, cut to their 18 sides, with a tick per row and a hub.
  const RV = RF / Math.cos(((STEP / 2) * Math.PI) / 180);
  const cap = el("div", "cap", drum);
  Object.assign(cap.style, { left: `${L - RV}px`, top: `${H / 2 - RV}px`, width: `${2 * RV}px`, height: `${2 * RV}px`, transform: "rotateY(90deg)" });
  const poly = Array.from({ length: N }, (_, k) => {
    const t = ((k + 0.5) * STEP * Math.PI) / 180;
    return `${(50 + 50 * Math.cos(t)).toFixed(3)}% ${(50 + 50 * Math.sin(t)).toFixed(3)}%`;
  });
  cap.style.clipPath = `polygon(${poly.join(",")})`;
  const ticks = Array.from({ length: N }, (_, k) => {
    const t = (k * STEP * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const r1 = RV - 30, r2 = RV - 13;
    return `<line x1="${(RV + r1 * c).toFixed(1)}" y1="${(RV + r1 * s).toFixed(1)}" x2="${(RV + r2 * c).toFixed(1)}" y2="${(RV + r2 * s).toFixed(1)}"/>`;
  }).join("");
  cap.innerHTML = `<svg viewBox="0 0 ${2 * RV} ${2 * RV}" aria-hidden="true">
    <circle class="ring" cx="${RV}" cy="${RV}" r="${RV - 36}"/>
    <g class="ticks">${ticks}</g>
    <circle class="hub" cx="${RV}" cy="${RV}" r="38"/><circle class="boss" cx="${RV}" cy="${RV}" r="15"/>
    <path class="slot" d="M ${RV - 9} ${RV} H ${RV + 9}"/>
    <circle class="screw" cx="${RV + 58}" cy="${RV - 22}" r="4.5"/><circle class="screw" cx="${RV - 58}" cy="${RV + 22}" r="4.5"/>
  </svg>`;

  // The pawl: fixed to the frame, its tip in the right rim's ribs at the front, pivoting on a pin past the end.
  const pawl = el("div", "pawl", frame);
  const PAWL_W = 58;
  Object.assign(pawl.style, { left: `${L - F / 2 - 4}px`, top: `${H / 2 - 9}px`, width: `${PAWL_W}px`, height: "18px", transformOrigin: `${PAWL_W - 9}px 9px` });
  pawl.innerHTML = `<svg viewBox="0 0 ${PAWL_W} 18" aria-hidden="true"><path class="tongue" d="M 2 9 L ${PAWL_W - 14} 4.2 Q ${PAWL_W - 3} 3.4 ${PAWL_W - 3} 9 Q ${PAWL_W - 3} 14.6 ${PAWL_W - 14} 13.8 Z"/><path class="glint" d="M 5 8.4 L ${PAWL_W - 15} 5.6"/><circle class="pin" cx="${PAWL_W - 9}" cy="9" r="3.6"/></svg>`;
  // The tick of light: where the pawl's tip snaps over a rib, a glint.
  const spark = el("i", "spark", frame);
  Object.assign(spark.style, { left: `${L - F / 2 - 2}px`, top: `${H / 2}px`, transform: `translateZ(${RF + 3}px)` });
  const pin = el("i", "pin-at", frame);
  Object.assign(pin.style, { left: `${L - F / 2 - 4 + PAWL_W - 9}px`, top: `${H / 2}px`, transform: `translateZ(${RF + 2}px)` });

  // ---------------------------------------------------------------- the rows on the plates
  const fill = (slot, i, row = opts.row(i)) => {
    slot.key = JSON.stringify(row);
    const p = slot.plate;
    p.className = `plate ${row.kind}${row.rarity ? ` r-${row.rarity}` : ""}${row.fresh ? " fresh" : ""}`;
    p.dataset.index = String(i);
    p.replaceChildren();
    const spine = el("span", "spine", p);
    spine.dataset.up = row.up ?? "";
    spine.dataset.down = row.down ?? "";
    if (row.kind === "blank") return;
    const lbl = el("span", "lbl", p);
    el("span", "nm", lbl).textContent = row.title;
    if (row.state) {
      const st = el("span", "st", lbl);
      st.textContent = row.state;
    }
    const node = el("span", "node", p);
    if (row.rarity) node.innerHTML = markSvg(row.rarity, row.kind === "now" ? 22 : 17, { answered: row.kind === "past", stopped: row.stopped });
    else el("i", "end-dot", node);
  };

  // ---------------------------------------------------------------- motion
  const phys = createDrum({ lo: 0, hi: opts.count - 1, at: opts.front });
  let frontRow = opts.front;
  const flap = { th: 0, w: 0, glint: 0 };
  let last = performance.now();
  let raf = 0;
  let prevAim = Math.round(phys.p);
  let wasResting = true;
  let prevNear = Math.round(phys.p);
  let restedAt = 0;

  function render() {
    const p = phys.p;
    drum.style.transform = `translateZ(${-R}px) rotateY(${YAW}deg) rotateX(${(p * STEP).toFixed(3)}deg)`;
    for (const s of slots) {
      const i = s.j + N * Math.round((p - s.j) / N);
      const phi = (p - i) * STEP;
      const shown = Math.abs(phi) < 100;
      if (shown !== s.shown) {
        s.shown = shown;
        for (const e of [s.plate, ...s.flanges, s.wall]) e.style.visibility = shown ? "" : "hidden";
      }
      if (s.index !== i) {
        s.index = i;
        fill(s, i);
      }
      if (!shown) continue;
      const a0 = shadeAt(phi + STEP / 2), a1 = shadeAt(phi), a2 = shadeAt(phi - STEP / 2);
      // The gloss: where on this plate (0 at its top edge, 1 at its bottom) the fixed line of light falls.
      const gy = (STEP / 2 - (GLOSS_AT - phi)) / STEP;
      const vars = [["--a0", a0.toFixed(3)], ["--a1", a1.toFixed(3)], ["--a2", a2.toFixed(3)], ["--gy", `${(gy * 100).toFixed(1)}%`], ["--ga", gy > -0.3 && gy < 1.3 ? "1" : "0"]];
      for (const e of [s.plate, ...s.flanges]) for (const [k, v] of vars) e.style.setProperty(k, v);
      s.wall.style.setProperty("--a1", a1.toFixed(3));
    }
    // The pawl rides the ribs (one at each row's edge): a rib coming toward its tip pushes it aside, and once past,
    // it springs back and rings a little. Pushed the way the drum is turning.
    const u = p - Math.floor(p);
    const W = 0.2, A = 15;
    let push = 0;
    if (phys.v > 0.05 && 0.5 - u < W && u <= 0.5) push = A * (1 - (0.5 - u) / W);
    else if (phys.v < -0.05 && u - 0.5 < W && u >= 0.5) push = -A * (1 - (u - 0.5) / W);
    pawl.style.transform = `translateZ(${RF + 2}px) rotateZ(${(-flap.th).toFixed(2)}deg)`;
    pawl.style.setProperty("--glint", flap.glint.toFixed(3));
    spark.style.opacity = flap.glint.toFixed(3);
    flap.push = push;
    root.dataset.turning = phys.resting ? "" : "1";
    const sd = reduced() ? 0 : Math.max(0, Math.min(3.2, (Math.abs(phys.v) - 2.6) * 0.26));
    if (Math.abs(sd - smearAt) > 0.05 || (sd === 0 && smearAt !== 0)) {
      smearAt = sd;
      smear.setAttribute("stdDeviation", `0 ${sd.toFixed(2)}`);
      if (sd > 0) drum.dataset.smear = "";
      else delete drum.dataset.smear;
    }
  }

  function frame_(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    phys.step(dt);
    // The pawl's own spring, with its tip held by the rib while it's pushed.
    const k = 900, c = 9;
    for (let n = 0; n < 4; n++) {
      const h = dt / 4;
      flap.w += (-k * flap.th - c * flap.w) * h;
      flap.th += flap.w * h;
      if (flap.push > 0 && flap.th < flap.push) {
        flap.th = flap.push;
        flap.w = Math.max(flap.w, 0);
      } else if (flap.push < 0 && flap.th > flap.push) {
        flap.th = flap.push;
        flap.w = Math.min(flap.w, 0);
      }
    }
    // Each detent it clicks through: a tick of light on the pawl.
    for (const t of phys.takeTicks()) {
      flap.glint = 1;
      opts.onTick?.(t);
    }
    flap.glint = Math.max(0, flap.glint - dt / 0.16);
    render();
    if (phys.resting && !wasResting) restedAt = now;
    wasResting = phys.resting;
    const near = Math.round(phys.p);
    if (near !== prevNear) {
      prevNear = near;
      opts.onNear?.(near);
    }
    const aim = phys.aim;
    if (aim !== prevAim) {
      prevAim = aim;
      opts.onAim?.(aim);
    }
    const busy = !phys.resting || Math.abs(flap.th) > 0.05 || Math.abs(flap.w) > 0.5 || flap.glint > 0;
    raf = busy ? requestAnimationFrame(frame_) : 0;
  }
  const wake = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame_);
    }
  };

  // ---------------------------------------------------------------- your hand: the wheel, a drag, the keys
  let wheelTimer = 0;
  let stepAcc = 0;
  let stepCool = 0;
  const handStarted = () => opts.onHand?.();
  root.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      handStarted();
      if (reduced()) {
        // One row at a time, however hard the wheel turns: no momentum.
        stepAcc += dy;
        const nowT = performance.now();
        if (Math.abs(stepAcc) >= ROW_PX * 0.6 && nowT > stepCool) {
          stepTo(clampRow(phys.aim + Math.sign(stepAcc)));
          stepAcc = 0;
          stepCool = nowT + 160;
        }
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => ((stepAcc = 0), opts.onLetGo?.()), 200);
        return;
      }
      // A mouse wheel's notch is a row; a trackpad's pixels move the surface under your fingers.
      if (Math.abs(dy) >= 90) phys.hold(Math.round(phys.state.mode === "hand" ? phys.state.handTarget : phys.p) + Math.sign(dy));
      else phys.nudge(Math.max(-0.9, Math.min(0.9, dy / ROW_PX)));
      wake();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        phys.releaseAt();
        wake();
        opts.onLetGo?.();
      }, WHEEL_IDLE);
    },
    { passive: false },
  );

  let drag;
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const plate = e.target instanceof Element ? e.target.closest(".plate") : null;
    drag = { id: e.pointerId, y0: e.clientY, p0: phys.p, moved: false, index: plate ? Number(plate.dataset.index) : undefined, samples: [{ t: e.timeStamp, y: e.clientY }], stepped: 0 };
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      root.dataset.dragging = "";
      handStarted();
      phys.grab();
      drag.p0 = phys.p + dy / ROW_PX;
    }
    drag.samples.push({ t: e.timeStamp, y: e.clientY });
    if (drag.samples.length > 8) drag.samples.shift();
    if (reduced()) {
      const want = clampRow(Math.round(drag.p0 - dy / ROW_PX));
      if (want !== phys.aim) stepTo(want);
      return;
    }
    phys.hold(drag.p0 - dy / ROW_PX);
    wake();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = undefined;
    delete root.dataset.dragging;
    if (!d.moved) {
      if (d.index !== undefined && Number.isFinite(d.index)) opts.onPick?.(d.index);
      return;
    }
    if (reduced()) return opts.onLetGo?.();
    // The fling: how fast the pointer was moving over its last 80 ms.
    const s = d.samples, end = s[s.length - 1];
    let first = s[0];
    for (const x of s) if (end.t - x.t <= 80) {
      first = x;
      break;
    }
    const v = end.t > first.t ? -((end.y - first.y) / (end.t - first.t)) * 1000 / ROW_PX : 0;
    phys.release(e.type === "pointercancel" ? 0 : Math.max(-40, Math.min(40, v)));
    wake();
    opts.onLetGo?.();
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  const clampRow = (n) => Math.max(phys.state.lo, Math.min(phys.state.hi, n));
  function stepTo(n) {
    if (reduced()) {
      phys.jump(n);
      render();
      opts.onAim?.((prevAim = n));
      return;
    }
    phys.turnTo(n, "step");
    wake();
  }

  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    handStarted();
    stepTo(clampRow(phys.aim + (e.key === "ArrowUp" ? -1 : 1)));
    opts.onLetGo?.();
  });

  render();

  return {
    get p() {
      return phys.p;
    },
    get aim() {
      return phys.aim;
    },
    get resting() {
      return phys.resting;
    },
    get restedAt() {
      return restedAt;
    },
    get held() {
      return phys.mode === "hand" || drag?.moved === true;
    },
    /** The rows changed (an answer, an undo): fill the plates again. */
    refresh(count) {
      if (count !== undefined) phys.setRange(0, count - 1);
      // Only the plates whose rows changed are printed again, so a row's own transition isn't cut short.
      for (const s of slots) {
        if (s.index === undefined) continue;
        const row = opts.row(s.index);
        if (JSON.stringify(row) !== s.key) fill(s, s.index, row);
      }
      render();
    },
    /** Where the drum is nearest, now: the row at the pawl, or about to be. */
    get near() {
      return Math.round(phys.p);
    },
    /** Turn to row n: "answer" (one step, with weight), "return" (gentle), "step". */
    turnTo(n, kind = "return", onRest) {
      if (reduced()) {
        phys.jump(n);
        render();
        opts.onAim?.((prevAim = n));
        onRest?.(n);
        return;
      }
      phys.turnTo(n, kind, onRest);
      wake();
    },
    setFront(n) {
      frontRow = n;
    },
    get front() {
      return frontRow;
    },
    /** Where the pawl's pin is on screen, for the line to the card. */
    pinRect: () => pin.getBoundingClientRect(),
  };
}
