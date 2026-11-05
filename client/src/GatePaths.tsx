import { type ReactNode, useEffect, useState } from "react";
import type { ApiPreferenceFile, ApiRouting } from "../../src/api";
import { DEFAULT_IGNORE, type GatePaths, PATH_KEYS, PATH_KINDS, type PathKind, pathsOf } from "../../src/gate-paths";
import { uncovered } from "../../src/globs";
import { postAnswer, useEndpoints } from "./endpoints";
import { replacesOf } from "./prefs";
import { NotConfirmed } from "./proof";

// B-qkek1: what the commit gate looks for, in your preferences. The gate's built-in detectors, and four lists of globs a
// person changes here and nowhere else: agents edit the committed config, so the gate no longer reads it. A change goes
// through the same path as every other preference change, as a new file over the one in force; one that makes the gate
// see less (a narrower list, or more ignored) is loosening (D163), so on the website it asks for your passkey first.

/** Each list as you edit it: one glob a line. */
type Texts = Record<PathKind, string>;

const lines = (text: string) => [...new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))];

/** The lists the gate applies, as text: the built-in ones where a file leaves them out. Ignores are yours only. */
const textsOf = (paths: GatePaths): Texts => Object.fromEntries(PATH_KINDS.map((k) => [k, pathsOf(paths, k).join("\n")])) as Texts;

const pathsOfTexts = (t: Texts): GatePaths => Object.fromEntries(PATH_KINDS.map((k) => [k, lines(t[k])]));

/** A preference file's lists, as the gate reads them. */
const pathsOfFile = (file: ApiPreferenceFile["file"]): GatePaths => Object.fromEntries(PATH_KINDS.flatMap((k) => (file[PATH_KEYS[k]] ? [[k, file[PATH_KEYS[k]]]] : [])));

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((g) => b.includes(g));
const samePaths = (a: GatePaths, b: GatePaths) => PATH_KINDS.every((k) => sameList(pathsOf(a, k), pathsOf(b, k)));

const BUILT_IN: Partial<Record<PathKind, readonly string[]>> = { schema: pathsOf({}, "schema"), infra: pathsOf({}, "infra") };

const LISTS: { kind: PathKind; name: string; help: ReactNode }[] = [
  { kind: "schema", name: "Schemas and data formats", help: "A change to a file that matches is a schema decision." },
  { kind: "infra", name: "CI, infrastructure and deploys", help: "Workflows, containers, deploy settings, and the git hooks that run on everyone's machine." },
  {
    kind: "api",
    name: "Public modules",
    help: "A breaking change to what these export is an API decision. With none, the gate doesn't look; it needs livedocs on the machine that commits.",
  },
  {
    kind: "ignore",
    name: "Never looked at",
    help: (
      <>
        Besides these, always:{" "}
        {DEFAULT_IGNORE.map((g, i) => (
          <span key={g}>
            {i ? ", " : ""}
            <code>{g}</code>
          </span>
        ))}
        .
      </>
    ),
  },
];

const KIND_WORDS: Record<Exclude<PathKind, "ignore">, string> = { schema: "for schemas", infra: "for infrastructure", api: "for API changes" };

/** What a draft makes the gate stop seeing, in words: a list that no longer covers what it did, and paths newly ignored. */
function lessWords(before: GatePaths, after: GatePaths): ReactNode[] {
  const out: ReactNode[] = [];
  const codes = (globs: string[]) =>
    globs.map((g, i) => (
      <span key={g}>
        {i ? ", " : ""}
        <code>{g}</code>
      </span>
    ));
  for (const kind of ["schema", "infra", "api"] as const) {
    const lost = uncovered(pathsOf(after, kind), pathsOf(before, kind));
    if (lost.length) out.push(<span key={kind}>it would stop looking at {codes(lost)} {KIND_WORDS[kind]}</span>);
  }
  const more = uncovered([...DEFAULT_IGNORE, ...pathsOf(before, "ignore")], pathsOf(after, "ignore"));
  if (more.length) out.push(<span key="ignore">it would never look at {codes(more)}</span>);
  return out;
}

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "stale" } | { kind: "unconfirmed" } | { kind: "error"; message: string };

export function GatePathsSection(p: { routing: ApiRouting; onSaved: (text: string) => void }) {
  const endpoints = useEndpoints();
  const hosted = !!endpoints.hosted;
  const inForce = { name: replacesOf(p.routing), paths: p.routing.settings.paths ?? {} };
  const [base, setBase] = useState(inForce);
  const [texts, setTexts] = useState<Texts>(() => textsOf(inForce.paths));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const draft = pathsOfTexts(texts);
  const changed = !samePaths(draft, base.paths);
  const less = lessWords(base.paths, draft);

  // A new file in force: lists you haven't touched follow it. Edited, yours stay; and when the new file left the gate's
  // lists as they were (a row moved, say), yours still apply over it rather than being refused as made from an old view.
  useEffect(() => {
    if (inForce.name === base.name) return;
    if (!changed) {
      setBase(inForce);
      setTexts(textsOf(inForce.paths));
    } else if (samePaths(inForce.paths, base.paths)) {
      setBase(inForce);
    }
  }, [inForce.name]);

  const edit = (kind: PathKind, text: string) => {
    setTexts({ ...texts, [kind]: text });
    if (status.kind !== "sending") setStatus({ kind: "idle" });
  };

  const send = async () => {
    setStatus({ kind: "sending" });
    const change = { ...(base.name ? { replaces: base.name } : {}), ...Object.fromEntries(PATH_KINDS.map((k) => [PATH_KEYS[k], draft[k]])) };
    try {
      const r = await postAnswer(endpoints, endpoints.preferences, change, { client: true });
      const body = (await r.json().catch(() => ({}))) as { error?: string } & Partial<ApiPreferenceFile>;
      if (r.status === 201 && body.name && body.file) {
        const paths = pathsOfFile(body.file);
        setBase({ name: body.name, paths });
        setTexts(textsOf(paths));
        setStatus({ kind: "done" });
        p.onSaved("The gate looks where your lists say from the next commit.");
      } else if (r.status === 409) {
        // Someone changed them first, in another tab, or on another device: start again from what's in force now.
        setBase(inForce);
        setTexts(textsOf(inForce.paths));
        setStatus({ kind: "stale" });
      } else {
        setStatus({ kind: "error", message: body.error ?? `the server answered ${r.status}` });
      }
    } catch (e) {
      setStatus(e instanceof NotConfirmed ? { kind: "unconfirmed" } : { kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className="gate-paths" aria-labelledby="gate-paths-h">
      <h5 id="gate-paths-h">What the gate looks for</h5>
      <p className="gate-intro">
        When an agent commits, Baesian's gate reads the change for decisions it can spot on its own, and holds the commit until a card or an acknowledgement covers each one. Some of
        what it looks for is built in; these lists say where else to look, and where never to. Only you change them, here: {hosted ? "anything that makes the gate see less asks for your passkey." : "agents can't."}
      </p>
      <ul className="gate-fixed" aria-label="Always looked for">
        <li>
          Runtime dependencies added to or removed from <code>package.json</code>, <code>pyproject.toml</code> or a requirements file.
        </li>
        <li>
          Linking the repo to the service, or changing its link, in <code>.baesian/config.json</code>.
        </li>
      </ul>
      <p className="gate-how">One pattern a line: <code>**</code> crosses folders, <code>*</code> and <code>?</code> stay within one.</p>
      <div className="gate-lists">
        {LISTS.map(({ kind, name, help }) => {
          const built = BUILT_IN[kind];
          const n = lines(texts[kind]).length;
          return (
            <div className="gate-list" key={kind}>
              <label htmlFor={`gate-${kind}`} className="lbl">
                {name}
              </label>
              <span className="help" id={`gate-${kind}-help`}>
                {help}
              </span>
              <textarea
                id={`gate-${kind}`}
                aria-describedby={`gate-${kind}-help`}
                rows={Math.min(Math.max(n + 1, 2), 9)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                value={texts[kind]}
                onChange={(e) => edit(kind, e.target.value)}
              />
              {built &&
                (sameList(lines(texts[kind]), built) ? (
                  <span className="built">The built-in list.</span>
                ) : (
                  <button type="button" className="link built" onClick={() => edit(kind, built.join("\n"))}>
                    Use the built-in list
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      {changed && less.length > 0 && (
        <p className="gate-less">
          With these lists the gate sees less:{" "}
          {less.map((w, i) => (
            <span key={i}>
              {i ? "; and " : ""}
              {w}
            </span>
          ))}
          . {hosted ? "Using them asks for your passkey." : "That's yours to choose."}
        </p>
      )}
      <div className="row gate-foot">
        <button type="button" className="send" disabled={!changed || status.kind === "sending"} onClick={() => void send()}>
          {status.kind === "sending" ? "Sending…" : "Use these lists"}
        </button>
        <button type="button" className="cancel" disabled={!changed} onClick={() => setTexts(textsOf(base.paths))}>
          Put them back
        </button>
        <span className="small" aria-live="polite">
          {status.kind === "done" && !changed ? "In use." : changed ? "Not in use yet." : ""}
        </span>
      </div>
      {status.kind === "stale" && (
        <p className="problem" role="alert">
          The gate's lists changed while you edited them, so yours weren't used. They're shown as they are now: make your change again.
        </p>
      )}
      {status.kind === "unconfirmed" && (
        <p className="problem" role="alert">
          Your passkey wasn't used, so the gate's lists are as they were.
        </p>
      )}
      {status.kind === "error" && (
        <p className="problem" role="alert">
          That didn't go through: {status.message}.
        </p>
      )}
    </section>
  );
}
