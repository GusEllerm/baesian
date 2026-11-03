// The drum's motion, in rows and seconds, with no DOM: a position `p` (which row is at the front, fractional while
// it turns) and a velocity `v`. One small integrator serves every way the drum moves:
//
//   hand   your hand (a drag, or the wheel) holds a target; the drum chases it through a stiff spring, so it has
//          some mass, and the target is warped so that it sticks a little at each row: you feel the detents.
//   coast  you let go of a fling: friction slows it; below a speed, the nearest detent catches it.
//   snap   a detent pulls it in: a spring, slightly under-damped, so it lands a hair past the row and settles.
//   drive  the drum turns itself (an answer, the return to the front, opening a row): a ramped target that the drum
//          follows, so it starts with weight and ends with the same click.
//
// Past either end, a rubber band: the further you push, the less it gives, and it springs back.

export const TUNING = {
  coastFriction: 2.3, // 1/s: how fast a fling dies away (τ ≈ 0.43 s)
  snapSpeed: 3.4, // rows/s: slower than this, the nearest detent catches it
  snapLookahead: 0.09, // s: which detent catches it: the one it would reach in this long
  detent: { omega: 30, zeta: 0.6 }, // the click into place
  hand: { omega: 38, zeta: 0.92 }, // the drum chasing your hand
  notch: 0.42, // 0..1: how much the drum sticks at each row while you turn it by hand
  rubber: 0.6, // rows: the most it gives past an end
  wall: { omega: 26, zeta: 0.82 }, // the spring back from past an end
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// A slow start, as if pushed, then a steady pull: the end belongs to the detent spring.
const easeIn = (t) => t * t * (2 - t);

/** Rows past an end, as the drum gives: never more than `max`, harder the further you push. */
export function rubber(d, max) {
  return d <= 0 ? d : max * (1 - 1 / (1 + (1.6 * d) / max));
}

/**
 * The detent warp: where the drum sits for a hand at x. Monotonic; flatter near each row (it sticks), steeper
 * between (it slips to the next). `a` is how much: 0 is none.
 */
export function notchWarp(x, a) {
  return x - (a / (2 * Math.PI)) * Math.sin(2 * Math.PI * x);
}

export function createDrum({ lo, hi, at, tuning = TUNING }) {
  const s = {
    p: at,
    v: 0,
    lo,
    hi,
    mode: "rest",
    target: at,
    handTarget: at,
    spring: tuning.detent,
    drive: undefined,
    onRest: undefined,
    ticks: [],
    lastTick: at,
  };
  const T = tuning;

  /** Where the hand's target lands, after the ends' rubber band and the detents' warp. */
  const handGoal = () => {
    const x = s.handTarget;
    if (x > s.hi) return s.hi + rubber(x - s.hi, T.rubber);
    if (x < s.lo) return s.lo - rubber(s.lo - x, T.rubber);
    return notchWarp(x, T.notch);
  };

  const springTo = (goal, { omega, zeta }, dt) => {
    const a = -omega * omega * (s.p - goal) - 2 * zeta * omega * s.v;
    s.v += a * dt;
    s.p += s.v * dt;
  };

  const settleTo = (n, spring = T.detent) => {
    s.mode = "snap";
    s.target = n;
    s.spring = spring;
  };

  const catchDetent = () => {
    if (s.p > s.hi + 0.02) return settleTo(s.hi, T.wall);
    if (s.p < s.lo - 0.02) return settleTo(s.lo, T.wall);
    settleTo(clamp(Math.round(s.p + s.v * T.snapLookahead), s.lo, s.hi));
  };

  function step(dt) {
    const before = s.p;
    // Fixed small steps, so the springs are stable whatever the frame rate.
    const n = Math.max(1, Math.ceil(dt / (1 / 480)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      if (s.mode === "hand") springTo(handGoal(), T.hand, h);
      else if (s.mode === "coast") {
        s.v += -T.coastFriction * s.v * h;
        // Past an end, the band pulls it back hard, and takes most of its speed.
        const w = T.wall.omega;
        if (s.p > s.hi) s.v += (-(w * w) * (s.p - s.hi) - 2 * T.wall.zeta * w * s.v) * h;
        else if (s.p < s.lo) s.v += (-(w * w) * (s.p - s.lo) - 2 * T.wall.zeta * w * s.v) * h;
        s.p += s.v * h;
        if (Math.abs(s.v) < T.snapSpeed) catchDetent();
      } else if (s.mode === "drive") {
        const d = s.drive;
        d.t += h;
        const k = clamp(d.t / d.dur, 0, 1);
        springTo(d.from + (d.to - d.from) * d.ease(k), d.spring, h);
        if (k >= 1) settleTo(d.to, d.land);
      } else if (s.mode === "snap") {
        springTo(s.target, s.spring, h);
        if (Math.abs(s.p - s.target) < 0.0015 && Math.abs(s.v) < 0.02) {
          s.p = s.target;
          s.v = 0;
          s.mode = "rest";
          const cb = s.onRest;
          s.onRest = undefined;
          cb?.(s.p);
        }
      }
    }
    // Rows that crossed the front this step: the detents it clicked through. Settling back and forth across the
    // same row is one click, not several.
    const a = Math.min(before, s.p), b = Math.max(before, s.p);
    for (let k = Math.ceil(a - 1e-9); k <= Math.floor(b + 1e-9); k++) {
      if (k === before || k === s.lastTick) continue;
      s.ticks.push(k);
      s.lastTick = k;
    }
    if (s.lastTick !== undefined && Math.abs(s.p - s.lastTick) > 0.6) s.lastTick = undefined;
    return s;
  }

  return {
    state: s,
    step,
    get p() {
      return s.p;
    },
    get v() {
      return s.v;
    },
    get mode() {
      return s.mode;
    },
    /** Whole rows only, and where it will come to rest. */
    get resting() {
      return s.mode === "rest";
    },
    get aim() {
      if (s.mode === "rest") return s.p;
      if (s.mode === "snap") return s.target;
      if (s.mode === "drive") return s.drive.to;
      if (s.mode === "hand") return clamp(Math.round(handGoal()), s.lo, s.hi);
      return clamp(Math.round(s.p + s.v / T.coastFriction), s.lo, s.hi);
    },
    setRange(lo2, hi2) {
      s.lo = lo2;
      s.hi = hi2;
    },
    /** Your hand takes hold (a drag begins, or the wheel turns): from wherever the drum is now. */
    grab() {
      if (s.mode !== "hand") s.handTarget = s.p;
      s.mode = "hand";
      s.onRest = undefined;
    },
    /** Move the hand's target by d rows. */
    nudge(d) {
      if (s.mode !== "hand") this.grab();
      s.handTarget += d;
    },
    /** Put the hand's target at x rows (a drag, measured from where it began). */
    hold(x) {
      if (s.mode !== "hand") this.grab();
      s.handTarget = x;
    },
    /** The hand lets go, moving at v rows/s (a fling), or not at all. */
    release(v = 0) {
      if (s.mode !== "hand") return;
      s.v = Math.abs(v) > Math.abs(s.v) ? v : s.v;
      s.mode = "coast";
      if (Math.abs(s.v) < T.snapSpeed) catchDetent();
    },
    /** The hand lets go of the wheel: the detent nearest where it was turned to. */
    releaseAt() {
      if (s.mode !== "hand") return;
      const goal = handGoal();
      if (goal > s.hi + 0.01) return settleTo(s.hi, T.wall);
      if (goal < s.lo - 0.01) return settleTo(s.lo, T.wall);
      // Near the crest between two rows, it goes over the way it was moving, as a detent would.
      settleTo(clamp(Math.round(s.handTarget + Math.sign(s.v) * 0.1), s.lo, s.hi));
    },
    /**
     * The drum turns itself to row n: a push (`dur` seconds, eased), followed by a spring, then the detent's click.
     * `kind` picks the feel: "answer" (one step, weighty), "return" (gentle, any distance), "step" (a key, quick).
     */
    turnTo(n, kind = "return", onRest) {
      const dist = Math.abs(n - s.p);
      const feel = {
        answer: { dur: 0.24, ease: easeIn, spring: { omega: 21, zeta: 0.72 }, land: { omega: 22, zeta: 0.48 } },
        return: { dur: Math.min(1.1, 0.26 + 0.12 * dist), ease: easeInOut, spring: { omega: 20, zeta: 0.95 }, land: { omega: 20, zeta: 0.72 } },
        step: { dur: 0.07, ease: easeIn, spring: { omega: 32, zeta: 0.8 }, land: { omega: 32, zeta: 0.58 } },
      }[kind];
      s.drive = { from: s.p, to: n, t: 0, ...feel };
      s.mode = "drive";
      s.onRest = onRest;
    },
    /** Put the drum at row n, at rest, at once (reduced motion, or a first placement). */
    jump(n) {
      s.p = n;
      s.v = 0;
      s.mode = "rest";
      s.handTarget = n;
      const cb = s.onRest;
      s.onRest = undefined;
      cb?.(n);
    },
    takeTicks() {
      const t = s.ticks;
      s.ticks = [];
      return t;
    },
  };
}
