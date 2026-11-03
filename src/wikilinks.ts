// Wikilinks, as a deck's context notes name them (P17 §8): how one is read, and what it shows. No Node imports, so the
// state module (src/state.ts) shows them where there's no vault to resolve them in, as on the relay.

/** A wikilink's parts: `[[Folder/Name#Heading|text]]`. A bare name is read as a link's target. */
export function parseWikilink(raw: string): { target: string; heading?: string; text?: string } {
  let s = raw.trim();
  if (s.startsWith("!")) s = s.slice(1);
  if (s.startsWith("[[") && s.endsWith("]]")) s = s.slice(2, -2);
  const bar = s.indexOf("|");
  const text = bar >= 0 ? s.slice(bar + 1).trim() : undefined;
  if (bar >= 0) s = s.slice(0, bar);
  const hash = s.indexOf("#");
  const heading = hash >= 0 ? s.slice(hash + 1).trim() : undefined;
  if (hash >= 0) s = s.slice(0, hash);
  return { target: s.trim(), ...(heading ? { heading } : {}), ...(text ? { text } : {}) };
}

/** What a link shows: its own text, or its note's name and heading. */
export function linkText(raw: string): string {
  const { target, heading, text } = parseWikilink(raw);
  return text ?? [target.split("/").at(-1), heading].filter(Boolean).join(" › ");
}
