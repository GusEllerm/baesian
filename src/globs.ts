// Path globs for the gate's detectors: `**` crosses directories, `*` and `?` don't. Also used for
// fact-ID patterns in rules (`dep:pytest-*`).

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matcher(globs: readonly string[]): (path: string) => boolean {
  const res = globs.map(globToRegExp);
  return (path) => res.some((r) => r.test(path));
}

// ---------------------------------------------------------------- comparing globs (B-qkek1)

// Whether one list of globs covers another: every path the second matches, the first matches too. A change to what the
// commit gate looks at loosens it when the new lists don't cover the old ones (`pathsLoosening()`), so this is exact,
// not a guess from the text. Each glob is read as an automaton over a path's characters, as `globToRegExp()` reads it.
// The characters that matter are the slash, those the globs name, and any other, which every glob treats alike; walking
// all the automata together over those finds a path the first list misses, if there is one.

type Label = { lit: string } | "nonslash" | "any";

interface Automaton {
  trans: [Label, number][][];
  eps: number[][];
  accept: number;
}

function automatonOf(glob: string): Automaton {
  const trans: [Label, number][][] = [[]];
  const eps: number[][] = [[]];
  const state = () => {
    eps.push([]);
    return trans.push([]) - 1;
  };
  let at = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    const next = state();
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        // `**/`: nothing, or anything that ends in a slash.
        const any = state();
        eps[at]!.push(next, any);
        trans[any]!.push(["any", any], [{ lit: "/" }, next]);
        i += 2;
      } else {
        trans[at]!.push(["any", at]);
        eps[at]!.push(next);
        i += 1;
      }
    } else if (c === "*") {
      trans[at]!.push(["nonslash", at]);
      eps[at]!.push(next);
    } else {
      trans[at]!.push([c === "?" ? "nonslash" : { lit: c }, next]);
    }
    at = next;
  }
  return { trans, eps, accept: at };
}

function closure(a: Automaton, from: readonly number[]): number[] {
  const seen = new Set(from);
  const stack = [...from];
  while (stack.length) {
    for (const t of a.eps[stack.pop()!]!) {
      if (seen.has(t)) continue;
      seen.add(t);
      stack.push(t);
    }
  }
  return [...seen].sort((x, y) => x - y);
}

/** "" stands for every character the globs don't name: not a slash, and no glob's literal. */
const fits = (l: Label, ch: string) => l === "any" || (l === "nonslash" ? ch !== "/" : l.lit === ch);

function step(a: Automaton, states: readonly number[], ch: string): number[] {
  const to = states.flatMap((s) => a.trans[s]!.filter(([l]) => fits(l, ch)).map(([, t]) => t));
  return to.length ? closure(a, to) : [];
}

/** How far the walk goes before it gives up, and counts the glob as not covered. Real lists stay far below it. */
const BUDGET = 50_000;

/** Whether `by` matches every path `glob` matches: true, false, or undefined when it can't tell within its budget. */
function covers(by: readonly string[], glob: string): boolean | undefined {
  if (by.includes(glob)) return true;
  const g = automatonOf(glob);
  const hs = by.map(automatonOf);
  const alphabet = ["/", "", ...new Set([...glob, ...by.join("")].filter((c) => c !== "/"))];
  const start = [closure(g, [0]), ...hs.map((h) => closure(h, [0]))];
  const seen = new Set([JSON.stringify(start)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [gs, ...hss] = queue[i]!;
    // A path the glob matches, and nothing in `by` does.
    if (gs!.includes(g.accept) && !hss.some((s, j) => s.includes(hs[j]!.accept))) return false;
    for (const ch of alphabet) {
      const g2 = step(g, gs!, ch);
      if (!g2.length) continue;
      const next = [g2, ...hss.map((s, j) => (s.length ? step(hs[j]!, s, ch) : s))];
      const key = JSON.stringify(next);
      if (seen.has(key)) continue;
      if (seen.size >= BUDGET) return undefined;
      seen.add(key);
      queue.push(next);
    }
  }
  return true;
}

/**
 * The globs in `globs` that `by` doesn't cover: each that matches some path no glob in `by` matches, by `globToRegExp()`'s
 * reading. One it can't tell is counted as not covered (B-qkek1).
 */
export function uncovered(by: readonly string[], globs: readonly string[]): string[] {
  return globs.filter((g) => covers(by, g) !== true);
}
