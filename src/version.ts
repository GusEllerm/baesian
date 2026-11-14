// Baesian's release, for the code that needs it apart from Node's filesystem: the format a file is written in (B-4p43b,
// `writtenFormat()`), the hook block `baesian init` writes (B-amxkp, `writtenBlock()`), and the version the CLI sends the
// relay and the relay checks (`RELEASE_HEADER`). The schema, the service and the client all import it as it is.
// `npm version` rewrites the line below from package.json (scripts/set-version.mjs); test/plugin.test.ts holds the two
// together, with the service's and the plugin's versions.

/** This release, as package.json names it. */
export const VERSION = "1.1.0";

/**
 * The first release whose files, relay protocol and agents' commands every later release keeps working (B-h0vyy,
 * B-4kj4d). The relay serves no Baesian older than it (`minimumRelease()`): before it, formats changed in place (D108).
 */
export const FIRST_STABLE = "1.0.0";

/** The header that carries the CLI's release on every request it makes to the hosted service (B-4p43b). */
export const RELEASE_HEADER = "baesian-version";

/**
 * The status the relay refuses a Baesian too old for it with (B-4p43b): 426, Upgrade Required, with the error, the
 * oldest release it serves (`minimum`), by which the CLI knows it, and its own (`release`).
 */
export const TOO_OLD = 426;

/** A release number, `major.minor.patch` with an optional pre-release, as semver writes it; build metadata is ignored. */
const RELEASE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Whether a string is a release number (`major.minor.patch`, optionally with a pre-release). */
export const isRelease = (v: string): boolean => RELEASE.test(v);

/**
 * Two releases in semver's order: negative when `a` comes first, positive when `b` does, 0 when they're the same release.
 * A pre-release comes before its release. Throws on a string that isn't a release number.
 */
export function compareReleases(a: string, b: string): number {
  const pa = RELEASE.exec(a);
  const pb = RELEASE.exec(b);
  if (!pa) throw new Error(`${JSON.stringify(a)} isn't a release number`);
  if (!pb) throw new Error(`${JSON.stringify(b)} isn't a release number`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  const [xa, xb] = [pa[4], pb[4]];
  if (xa === xb) return 0;
  if (xa === undefined) return 1;
  if (xb === undefined) return -1;
  const ia = xa.split(".");
  const ib = xb.split(".");
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    const [s, t] = [ia[i], ib[i]];
    if (s === undefined) return -1;
    if (t === undefined) return 1;
    if (s === t) continue;
    const [ns, nt] = [/^\d+$/.test(s), /^\d+$/.test(t)];
    if (ns && nt) return Number(s) - Number(t);
    if (ns) return -1;
    if (nt) return 1;
    return s < t ? -1 : 1;
  }
  return 0;
}

/** The later of two releases. */
export const laterRelease = (a: string, b: string): string => (compareReleases(a, b) >= 0 ? a : b);
