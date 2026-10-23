// Cheap, deterministic matching for the filing check (D36, D38, D44). No model in the loop.

const STOP = new Set(
  "a an and are as at be by do for from how in is it of on or should the this to use we what which with".split(" "),
);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Two card titles that probably ask the same question. */
export const SIMILAR_TITLE = 0.5;

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** Existing topics close enough to `topic` to be worth a "did you mean" (D44). */
export function nearTopics(topic: string, existing: Iterable<string>): string[] {
  const last = (t: string) => t.split("/").at(-1) ?? t;
  const out: string[] = [];
  for (const other of existing) {
    if (other === topic) continue;
    if (levenshtein(topic, other) <= 2 || last(topic) === last(other)) out.push(other);
  }
  return out.sort();
}
