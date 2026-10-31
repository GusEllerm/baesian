import type { Rarity } from "./model";

// The rarity marks, drawn the same everywhere: on the card now, and on the path from step 5d. Ported from round 5's
// marks.js, as SVG elements rather than strings, so nothing is ever written into the page as HTML.

/** A rarity's shape at size s: a circle, a diamond, a star or a crown. */
export function markPath(kind: Rarity, s: number): string {
  if (kind === "common") return `M ${-s} 0 a ${s} ${s} 0 1 0 ${2 * s} 0 a ${s} ${s} 0 1 0 ${-2 * s} 0`;
  if (kind === "uncommon") return `M 0 ${-s * 1.25} L ${s * 1.1} 0 L 0 ${s * 1.25} L ${-s * 1.1} 0 Z`;
  if (kind === "rare") {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.55 : s * 1.3, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
    }
    return `M ${pts.join(" L ")} Z`;
  }
  return `M ${-s * 1.3} ${s * 0.9} L ${-s * 1.3} ${-s * 0.5} L ${-s * 0.6} ${s * 0.1} L 0 ${-s * 1.1} L ${s * 0.6} ${s * 0.1} L ${s * 1.3} ${-s * 0.5} L ${s * 1.3} ${s * 0.9} Z`;
}

const INK: Record<Rarity, [fill: string, stroke: string]> = {
  common: ["#F0E4BE", "#2E2343"],
  uncommon: ["#F0E4BE", "#6d7482"],
  rare: ["#f6e3a4", "#B8860B"],
  mythic: ["#f3d58a", "#6E1F2E"],
};

/** A rarity mark. `answered` adds a green tick, and `stopped` a wine dot for an agent waiting on it now. */
export function Mark({ kind, size = 16, answered = false, stopped = false }: { kind: Rarity; size?: number; answered?: boolean; stopped?: boolean }) {
  const [fill, stroke] = INK[kind];
  return (
    <svg className="mk" width={size} height={size} viewBox="-8 -8 16 16" aria-hidden="true">
      <path d={markPath(kind, 5.2)} fill={fill} stroke={stroke} strokeWidth={1.6} />
      {answered && (
        <>
          <circle cx={5} cy={4.6} r={3.6} fill="#3f8f5a" />
          <path d="M3.3 4.7 L4.6 6 L6.8 3.4" stroke="#fff" strokeWidth={1.2} fill="none" />
        </>
      )}
      {stopped && <circle cx={5.2} cy={-4.8} r={3.3} fill="#8E3A5F" stroke="#F0E4BE" strokeWidth={1} />}
    </svg>
  );
}
