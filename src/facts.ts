import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { parse as parseToml } from "smol-toml";
import { matcher } from "./globs.js";
import { onlyBaesianBlock } from "./hookblock.js";

// The gate's detectors (D25): decision types found mechanically in a diff. Each finding is a fact
// with an ID the agent can cite in a `Baesian-Ack:` trailer (D52).

export type FactKind = "dep" | "schema" | "infra" | "api";

export interface DetectedFact {
  /** `dep:httpx`, `schema:migrations/0003_runs.sql`, `infra:.github/workflows/ci.yml`. */
  id: string;
  kind: FactKind;
  path: string;
  detail: string;
}

export interface Change {
  status: string;
  path: string;
  oldPath?: string;
}

/** One finding from `livedocs signatures --json` (livedocs 0.2.1). */
export interface ApiChange {
  path: string;
  qualname: string;
  kind: "signature" | "added" | "removed";
  was: string | null;
  now: string | null;
}

export interface ApiResult {
  changes: ApiChange[];
  /** Set when the API couldn't be checked; the gate prints it, and doesn't block on it. */
  warning?: string;
}

/** Two versions of a tree, and the paths that differ between them. */
export interface Snapshot {
  changes(): Change[];
  before(path: string): string | undefined;
  after(path: string): string | undefined;
  /** Exported-signature changes between the two trees. Only called when `gate_api` is set. */
  apiChanges?(): ApiResult;
}

/**
 * Ask livedocs for exported-signature changes (D56). Baesian doesn't parse code itself: livedocs
 * already has tested Python and TypeScript parsers. Without livedocs, the detector warns and is off.
 */
export function livedocsSignatures(cwd: string, args: string[]): ApiResult {
  try {
    const out = execFileSync("livedocs", ["signatures", ...args, "--json", "--repo", cwd], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 << 20,
    });
    return { changes: JSON.parse(out) as ApiChange[] };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      return { changes: [], warning: "gate_api is set, but livedocs isn't installed, so API changes weren't checked (uv tool install livedocs)" };
    }
    const why = (err.stderr ?? err.message ?? "").toString().trim().split("\n").at(-1);
    return { changes: [], warning: `livedocs signatures failed, so API changes weren't checked: ${why}` };
  }
}

/** git's empty tree: the "before" side of a repository's first commit. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function gitRaw(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
}

function show(cwd: string, spec: string): string | undefined {
  try {
    return gitRaw(cwd, ["show", spec]);
  } catch {
    return undefined;
  }
}

function hasRev(cwd: string, rev: string): boolean {
  try {
    gitRaw(cwd, ["rev-parse", "--verify", "-q", `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function parseNameStatus(z: string): Change[] {
  const parts = z.split("\0").filter((p) => p !== "");
  const out: Change[] = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++]!;
    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = parts[i++]!;
      out.push({ status: status[0]!, path: parts[i++]!, oldPath });
    } else {
      out.push({ status: status[0]!, path: parts[i++]! });
    }
  }
  return out;
}

/** What `git commit` is about to record: the index against HEAD (or the empty tree). */
export function stagedSnapshot(cwd: string): Snapshot {
  const head = hasRev(cwd, "HEAD");
  const base = head ? "HEAD" : EMPTY_TREE;
  return {
    changes: () => parseNameStatus(gitRaw(cwd, ["diff", "--cached", "--name-status", "-M", "-z", base])),
    before: (path) => (head ? show(cwd, `HEAD:${path}`) : undefined),
    after: (path) => show(cwd, `:${path}`),
    apiChanges: () => livedocsSignatures(cwd, ["--cached"]),
  };
}

/** One commit against its first parent, for CI (M3b). */
export function commitSnapshot(cwd: string, commit: string): Snapshot {
  const parent = hasRev(cwd, `${commit}^`) ? `${commit}^` : undefined;
  return {
    changes: () =>
      parseNameStatus(gitRaw(cwd, ["diff", "--name-status", "-M", "-z", parent ?? EMPTY_TREE, commit])),
    before: (path) => (parent ? show(cwd, `${parent}:${path}`) : undefined),
    after: (path) => show(cwd, `${commit}:${path}`),
    apiChanges: () => livedocsSignatures(cwd, ["--rev", commit]),
  };
}

export const DEFAULT_SCHEMA = [
  "**/migrations/**",
  "**/*.sql",
  "**/schema.prisma",
  "**/*.schema.json",
  "**/schema.graphql",
];

export const DEFAULT_INFRA = [
  ".github/workflows/**",
  // Git hooks that are committed run on everyone's machine: changing one is an infra decision (D135).
  ".githooks/**",
  ".husky/**",
  ".gitlab-ci.yml",
  "**/Dockerfile",
  "**/Dockerfile.*",
  "**/docker-compose*.yml",
  "**/docker-compose*.yaml",
  "**/compose.yml",
  "**/compose.yaml",
  "**/*.tf",
  "**/wrangler.toml",
  "**/wrangler.json",
  "**/wrangler.jsonc",
  "**/fly.toml",
  "**/vercel.json",
  "**/netlify.toml",
];

export const DEFAULT_IGNORE = ["**/node_modules/**", ".baesian/**", "**/vendor/**", "**/__fixtures__/**"];

export interface DetectOptions {
  schema?: readonly string[];
  infra?: readonly string[];
  /** The public modules; the `api:` detector runs only when this is non-empty (D59). */
  api?: readonly string[];
  /** Added to `DEFAULT_IGNORE`. */
  ignore?: readonly string[];
}

/** Breaking changes only (D58): a new export is additive, so it's a two-way door. */
const BREAKING = new Set<ApiChange["kind"]>(["signature", "removed"]);

function shorten(text: string, max = 90): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

export interface Detection {
  facts: DetectedFact[];
  /** Manifests that couldn't be parsed: the gate can't see their dependencies. */
  warnings: string[];
}

// ---------------------------------------------------------------- dependencies (D55)

/** PEP 503 normalisation, so `Pydantic_Core` and `pydantic-core` are the same package. */
export function normalisePython(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** The name at the start of a PEP 508 requirement: `httpx[http2]>=0.27; python_version>"3.8"` → `httpx`. */
export function requirementName(req: string): string | undefined {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(req);
  return m ? normalisePython(m[1]!) : undefined;
}

const NODE_RUNTIME = ["dependencies", "peerDependencies", "optionalDependencies"] as const;

function nodeDeps(text: string): Set<string> {
  const pkg = JSON.parse(text) as Record<string, unknown>;
  const names = new Set<string>();
  for (const section of NODE_RUNTIME) {
    const deps = pkg[section];
    if (deps && typeof deps === "object") for (const n of Object.keys(deps)) names.add(n);
  }
  return names;
}

function pythonProjectDeps(text: string): Set<string> {
  const doc = parseToml(text) as Record<string, any>;
  const names = new Set<string>();
  const add = (req: unknown) => {
    const n = typeof req === "string" ? requirementName(req) : undefined;
    if (n) names.add(n);
  };
  const project = doc.project ?? {};
  for (const req of project.dependencies ?? []) add(req);
  for (const extra of Object.values(project["optional-dependencies"] ?? {})) {
    for (const req of (extra as unknown[]) ?? []) add(req);
  }
  // Poetry's main group is runtime; its other groups (and PEP 735 dependency-groups) are dev (D55).
  for (const name of Object.keys(doc.tool?.poetry?.dependencies ?? {})) {
    if (name.toLowerCase() !== "python") names.add(normalisePython(name));
  }
  return names;
}

function requirementsDeps(text: string): Set<string> {
  const names = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line || line.startsWith("-")) continue; // options, -r includes, -e editables
    const n = requirementName(line);
    if (n) names.add(n);
  }
  return names;
}

type ManifestParser = (text: string) => Set<string>;

function manifestParser(path: string): ManifestParser | undefined {
  const name = basename(path);
  if (name === "package.json") return nodeDeps;
  if (name === "pyproject.toml") return pythonProjectDeps;
  if (/^requirements.*\.txt$/.test(name) && !/(dev|test|lint|doc)/i.test(name)) return requirementsDeps;
  return undefined;
}

function dependencyFacts(snap: Snapshot, change: Change, warnings: string[]): DetectedFact[] {
  const parse = manifestParser(change.path);
  if (!parse) return [];
  const read = (text: string | undefined, side: string): Set<string> | undefined => {
    if (text === undefined) return new Set();
    try {
      return parse(text);
    } catch {
      warnings.push(`couldn't parse the ${side} version of ${change.path}; its dependencies weren't checked`);
      return undefined;
    }
  };
  const before = read(change.status === "A" ? undefined : snap.before(change.oldPath ?? change.path), "old");
  const after = read(change.status === "D" ? undefined : snap.after(change.path), "new");
  if (!before || !after) return [];
  const facts: DetectedFact[] = [];
  for (const n of after) {
    if (!before.has(n)) facts.push({ id: `dep:${n}`, kind: "dep", path: change.path, detail: `added to ${change.path}` });
  }
  for (const n of before) {
    if (!after.has(n)) facts.push({ id: `dep:${n}`, kind: "dep", path: change.path, detail: `removed from ${change.path}` });
  }
  return facts;
}

// ---------------------------------------------------------------- detection

const VERB: Record<string, string> = { A: "added", M: "changed", D: "deleted", R: "renamed", C: "copied", T: "changed" };

export function detectFacts(snap: Snapshot, opts: DetectOptions = {}): Detection {
  const ignored = matcher([...DEFAULT_IGNORE, ...(opts.ignore ?? [])]);
  const isSchema = matcher(opts.schema ?? DEFAULT_SCHEMA);
  const isInfra = matcher(opts.infra ?? DEFAULT_INFRA);
  const warnings: string[] = [];
  const facts = new Map<string, DetectedFact>();
  const add = (f: DetectedFact) => {
    if (!facts.has(f.id)) facts.set(f.id, f);
  };
  for (const change of snap.changes()) {
    if (ignored(change.path)) continue;
    const verb = VERB[change.status] ?? "changed";
    const what = change.oldPath ? `${verb} ${change.oldPath} → ${change.path}` : `${verb} ${change.path}`;
    // A rename counts if either end is in scope: moving a migration out of migrations/ is a decision too.
    const either = (test: (p: string) => boolean) => test(change.path) || (change.oldPath !== undefined && test(change.oldPath));
    for (const f of dependencyFacts(snap, change, warnings)) add(f);
    if (either(isSchema)) add({ id: `schema:${change.path}`, kind: "schema", path: change.path, detail: what });
    // Baesian's own block, as `baesian init` writes it, isn't a decision anyone made (B-g6ywj); any other hook change is.
    const ownBlock = (change.status === "A" || change.status === "M") && onlyBaesianBlock(change.path, snap.before(change.path), snap.after(change.path));
    if (either(isInfra) && !ownBlock) add({ id: `infra:${change.path}`, kind: "infra", path: change.path, detail: what });
  }
  if (opts.api?.length && snap.apiChanges) {
    const isApi = matcher(opts.api);
    const result = snap.apiChanges();
    if (result.warning) warnings.push(result.warning);
    for (const c of result.changes) {
      if (!BREAKING.has(c.kind) || !isApi(c.path) || ignored(c.path)) continue;
      const detail =
        c.kind === "removed"
          ? `removed from ${c.path}`
          : `signature changed in ${c.path}${c.now ? `: ${shorten(c.now)}` : ""}`;
      add({ id: `api:${c.qualname}`, kind: "api", path: c.path, detail });
    }
  }
  return { facts: [...facts.values()].sort((a, b) => a.id.localeCompare(b.id)), warnings };
}
