import { uncovered } from "./globs.js";

// What the commit gate looks at (D25, D59), and who changes it (B-qkek1): the globs its schema and infra detectors match,
// the public modules that turn on its api: detector, and the paths it never looks at. The built-in lists are here; a
// repo changes them only in its preference files, which only the client writes, never in the committed config. A change
// that makes the gate see less is loosening (D163), told by comparing the globs (`pathsLoosening()`). Pure, with no
// Node, so the CLI, CI, the relay and the client all read it alike.

export const DEFAULT_SCHEMA = [
  "**/migrations/**",
  "**/*.sql",
  "**/schema.prisma",
  "**/*.schema.json",
  "**/schema.graphql",
  // A TypeScript schema module: Drizzle's and Convex's are named so, as are Zod schemas for files on disk, like Baesian's own.
  "**/schema.ts",
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

/** Never looked at, whatever a repo sets: a repo's own ignores are added to these. */
export const DEFAULT_IGNORE = ["**/node_modules/**", ".baesian/**", "**/vendor/**", "**/__fixtures__/**"];

/**
 * What the gate looks at, as a preference file sets it (B-qkek1). A list left out is the built-in one: `DEFAULT_SCHEMA`,
 * `DEFAULT_INFRA`, no public modules (so no `api:` facts), and no paths ignored beyond `DEFAULT_IGNORE`.
 */
export interface GatePaths {
  /** Globs for the schema detector; they replace `DEFAULT_SCHEMA`. */
  schema?: readonly string[] | undefined;
  /** Globs for the CI, infra and deploy detector; they replace `DEFAULT_INFRA`. */
  infra?: readonly string[] | undefined;
  /** The public modules, as globs; the `api:` detector runs only when there are some (D59). */
  api?: readonly string[] | undefined;
  /** Paths never looked at, added to `DEFAULT_IGNORE`. */
  ignore?: readonly string[] | undefined;
}

export const PATH_KINDS = ["schema", "infra", "api", "ignore"] as const;
export type PathKind = (typeof PATH_KINDS)[number];

/** Each kind's key in a preference file. */
export const PATH_KEYS = { schema: "gate_schema", infra: "gate_infra", api: "gate_api", ignore: "gate_ignore" } as const satisfies Record<PathKind, string>;

/** The built-in list each kind starts from. A repo's ignores are added to `DEFAULT_IGNORE`, which is always applied. */
const BUILT_IN: Record<PathKind, readonly string[]> = { schema: DEFAULT_SCHEMA, infra: DEFAULT_INFRA, api: [], ignore: [] };

/** The list the gate applies for a kind: the setting's, or the built-in one. For `ignore`, the repo's own, beside `DEFAULT_IGNORE`. */
export function pathsOf(paths: GatePaths, kind: PathKind): readonly string[] {
  return paths[kind] ?? BUILT_IN[kind];
}

/**
 * A list as a preference file keeps it (B-qkek1): trimmed, without blanks or repeats; and left out when it's the built-in
 * one, in any order, so a file that keeps the defaults means them, whatever later defaults are. An empty schema or infra
 * list is kept: the gate looks for none.
 */
export function pathSetting(kind: PathKind, list: readonly string[]): string[] | undefined {
  const globs = [...new Set(list.map((g) => g.trim()).filter(Boolean))];
  const built = BUILT_IN[kind];
  if (globs.length === built.length && built.every((g) => globs.includes(g))) return undefined;
  return globs;
}

/**
 * What a change to the gate's paths loosens (D163, B-qkek1): a schema, infra or API list that no longer covers every
 * path the old one did, and paths ignored that weren't before. Told by comparing the globs (`uncovered()`), exactly; a
 * glob it can't tell about counts as loosening. Each makes the gate see less, so in a hosted repo it takes the passkey.
 */
export function pathsLoosening(before: GatePaths, after: GatePaths): string[] {
  const out: string[] = [];
  const list = (globs: readonly string[]) => globs.map((g) => `"${g}"`).join(", ");
  for (const kind of ["schema", "infra", "api"] as const) {
    const lost = uncovered(pathsOf(after, kind), pathsOf(before, kind));
    if (lost.length) out.push(`it narrows ${PATH_KEYS[kind]}, which no longer covers ${list(lost)}`);
  }
  const more = uncovered([...DEFAULT_IGNORE, ...pathsOf(before, "ignore")], pathsOf(after, "ignore"));
  if (more.length) out.push(`it widens ${PATH_KEYS.ignore} to ${list(more)}`);
  return out;
}
