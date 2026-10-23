import { randomInt } from "node:crypto";

/** Crockford base32, lowercase: no i, l, o or u, so IDs read aloud without ambiguity (D51). */
export const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

const SUFFIX = "[0-9a-hjkmnp-tv-z]";
export const CARD_ID = new RegExp(`^B-${SUFFIX}{5}$`);
export const RULE_ID = new RegExp(`^R-${SUFFIX}{5}$`);

export function randomSuffix(length = 5): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/**
 * A fresh ID with `prefix`, retried until `taken` reports it free (D51). Random IDs let parallel
 * agents file without coordinating; the retry rules out collisions within one clone.
 */
export function newId(prefix: "B" | "R", taken: (id: string) => boolean, attempts = 20): string {
  for (let i = 0; i < attempts; i++) {
    const id = `${prefix}-${randomSuffix()}`;
    if (!taken(id)) return id;
  }
  throw new Error(`could not find a free ${prefix}- id after ${attempts} attempts`);
}
