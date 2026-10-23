import { parse, stringify } from "yaml";

export interface Doc {
  meta: Record<string, unknown>;
  body: string;
}

const FENCED = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

/** Split a Markdown file into its YAML frontmatter and body. Frontmatter must be flat (vault convention). */
export function parseDoc(text: string): Doc {
  const m = FENCED.exec(text);
  if (!m) throw new Error("missing frontmatter: the file must start with a --- block");
  const meta: unknown = parse(m[1] ?? "") ?? {};
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    throw new Error("frontmatter must be a mapping of keys to values");
  }
  for (const [key, value] of Object.entries(meta)) {
    const nested = Array.isArray(value)
      ? value.some((item) => typeof item === "object" && item !== null)
      : typeof value === "object" && value !== null;
    if (nested) throw new Error(`frontmatter must be flat: "${key}" holds a nested object`);
  }
  return { meta: meta as Record<string, unknown>, body: m[2] ?? "" };
}

/** Render frontmatter and body back into a Markdown file. Undefined values and empty lists are left out. */
export function renderDoc(meta: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );
  const yaml = stringify(clean, { lineWidth: 0 }).trimEnd();
  const text = body.replace(/^\n+/, "");
  return `---\n${yaml}\n---\n\n${text}${text.endsWith("\n") ? "" : "\n"}`;
}

/** The text under a `## Heading` in a Markdown body, up to the next heading of the same or higher level. */
export function section(body: string, heading: string): string | undefined {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.replace(/\s+$/, "") === `## ${heading}`);
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}
