// The marks, drawn the same everywhere: on the card, in the side panels, in the queue and on the map.

/** A rarity shape at size s: a circle, a diamond, a star or a crown. */
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
  return `M ${-s * 1.3} ${s * 0.9} L ${-s * 1.3} ${-s * 0.5} L ${-s * 0.6} ${s * 0.1} L 0 ${-s * 1.1} L ${s * 0.6} ${s * 0.1} L ${s * 1.3} ${-s * 0.5} L ${s * 1.3} ${s * 0.9} Z`;
}

const RARITY_INK = { common: ["#F0E4BE", "#2E2343"], uncommon: ["#F0E4BE", "#6d7482"], rare: ["#f6e3a4", "#B8860B"], mythic: ["#f3d58a", "#6E1F2E"] };
const SHAPES = {
  settled: `<circle r="4" fill="#2E2343"/>`,
  rule: `<rect x="-4.5" y="-4.5" width="9" height="9" rx="1.2" fill="#2C3DA6"/>`,
  agent: `<circle r="4.6" fill="none" stroke="#54476A" stroke-width="1.4" stroke-dasharray="2 1.6"/>`,
  deferred: `<rect x="-4.2" y="-4.6" width="3" height="9.2" rx=".8" fill="#85799A"/><rect x="1.2" y="-4.6" width="3" height="9.2" rx=".8" fill="#85799A"/>`,
  commit: `<rect x="-4.5" y="-5" width="3.5" height="10" rx=".8" fill="#54476A"/><rect x="1" y="-5" width="3.5" height="10" rx=".8" fill="#54476A"/>`,
  actor: `<rect x="-6.5" y="-5" width="13" height="10" rx="2" fill="none" stroke="#2E2343" stroke-width="1.3"/><path d="M-3.6 -1.6 L-1.2 .4 L-3.6 2.4 M.4 2.6 H3.6" stroke="#2E2343" stroke-width="1.2" fill="none"/>`,
  outside: `<path d="M-3.5 3.5 L3.5 -3.5 M-.8 -3.5 H3.5 V.8" stroke="#2E2343" stroke-width="1.4" fill="none"/>`,
};

/**
 * A mark as inline SVG. `answered` adds a green tick, and `stopped` a wine dot for an agent that has stopped
 * until you answer, so the same two signals read the same wherever a decision is drawn.
 */
export function mark(kind, size = 16, { answered = false, stopped = false } = {}) {
  const body = RARITY_INK[kind] ? `<path d="${markPath(kind, 5.2)}" fill="${RARITY_INK[kind][0]}" stroke="${RARITY_INK[kind][1]}" stroke-width="1.6"/>` : SHAPES[kind];
  const tick = answered ? `<circle cx="5" cy="4.6" r="3.6" fill="#3f8f5a"/><path d="M3.3 4.7 L4.6 6 L6.8 3.4" stroke="#fff" stroke-width="1.2" fill="none"/>` : "";
  const dot = stopped ? `<circle cx="5.2" cy="-4.8" r="3.3" fill="#8E3A5F" stroke="#F0E4BE" stroke-width="1"/>` : "";
  return `<svg class="mk" width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">${body}${tick}${dot}</svg>`;
}
