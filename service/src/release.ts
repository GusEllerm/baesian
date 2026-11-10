import { minimumRelease } from "../../src/schema.js";
import { FIRST_STABLE, RELEASE_HEADER, TOO_OLD, VERSION, compareReleases, isRelease } from "../../src/version.js";
import { fail } from "./http.js";

// The relay's check of the CLI's release (B-4p43b, Release v1 step 4): every request a machine makes names its release
// in `baesian-version`, and the relay refuses one too old to read what it holds, before anything is pulled, with a
// message naming the release to install. A release that adds a format still writes the one before (`asWritten()`), so the
// relay's minimum is the oldest release that reads every format this one writes (`minimumRelease()`), and never one
// before 1.0.0. docs/vault/Modules/service.md describes it.

/**
 * The refusal of a machine's request from a Baesian older than this relay serves, or nothing. A request that names no
 * release comes from a Baesian before the header (0.1.x), which is older than any minimum from 1.0.0 on; one whose header
 * isn't a release number is refused the same way. `own` is the release this relay runs.
 */
export function tooOld(sent: string | null, own: string = VERSION): Response | undefined {
  const minimum = minimumRelease(own);
  const release = sent !== null && isRelease(sent.trim()) ? sent.trim() : undefined;
  if (release !== undefined && compareReleases(release, minimum) >= 0) return undefined;
  const which =
    release !== undefined
      ? `Baesian ${release} is`
      : sent === null
        ? `this Baesian sends no version, so it's from before ${FIRST_STABLE}, and is`
        : `this Baesian's ${RELEASE_HEADER} (${JSON.stringify(sent.slice(0, 40))}) isn't a release number, so it's taken as`;
  return fail(
    TOO_OLD,
    `${which} too old for this service, which runs Baesian ${own} and serves ${minimum} or later: install baesian ${own} (npm install -g baesian@${own}), then run the command again. Nothing was sent or received.`,
    { minimum, release: own },
  );
}
