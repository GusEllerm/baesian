// The rarity marks, as the client draws them (client/src/Mark.tsx), from the shared data's paths.
import { MARKS, MARK_INK } from "../data.js";

/** A rarity mark as SVG markup: `answered` adds the green tick, `stopped` the wine dot of an agent waiting on it. */
export function markSvg(kind, size = 16, { answered = false, stopped = false } = {}) {
  const [fill, stroke] = MARK_INK[kind];
  return `<svg class="mk" width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">
    <path d="${MARKS[kind]}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
    ${answered ? `<circle cx="5" cy="4.6" r="3.6" fill="#3f8f5a"/><path d="M3.3 4.7 L4.6 6 L6.8 3.4" stroke="#fff" stroke-width="1.2" fill="none"/>` : ""}
    ${stopped ? `<circle cx="5.2" cy="-4.8" r="3.3" fill="#8E3A5F" stroke="#F0E4BE" stroke-width="1"/>` : ""}
  </svg>`;
}
