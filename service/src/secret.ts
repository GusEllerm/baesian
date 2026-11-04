import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Secrets the service hands out and the hashes it keeps of them (M9c). Every token, code and flow secret is random, and
// only its SHA-256 is stored, so a copy of the database can't sign anyone in. They're all high in entropy, or limited in
// attempts, so a fast hash is enough.

/** A token: 32 random bytes, base64url. */
export const token = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** A secret's SHA-256, hex: what the database keeps. */
export const hashOf = (secret: string): string => createHash("sha256").update(secret).digest("hex");

/** Two hashes or codes compared in time that doesn't depend on where they differ. */
export function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A code typed from an email: six digits. */
export const emailCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Crockford's base32: no I, L, O or U, so a code read aloud or typed is hard to get wrong. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A recovery code to keep (B-jzgy4): 20 characters of Crockford's base32 (100 bits) in four groups, as
 * `XXXXX-XXXXX-XXXXX-XXXXX`. Read back case-insensitively, with or without dashes and spaces.
 */
export function recoveryCode(): string {
  const chars = Array.from({ length: 20 }, () => CROCKFORD[randomInt(CROCKFORD.length)]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

/** A recovery code as typed, in the form it was issued: upper case, dashes where they go, I and L read as 1, O as 0. */
export function normalRecoveryCode(typed: string): string {
  const raw = typed.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  return raw.length === 20 ? [0, 5, 10, 15].map((i) => raw.slice(i, i + 5)).join("-") : raw;
}

/** The code a person types to approve a machine (RFC 8628 section 6.1): eight consonants, `XXXX-XXXX`. */
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXZ";
export function userCode(): string {
  const c = Array.from({ length: 8 }, () => CONSONANTS[randomInt(CONSONANTS.length)]).join("");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** A user code as typed: upper case, the dash where it goes. */
export function normalUserCode(typed: string): string {
  const raw = typed.toUpperCase().replace(/[^A-Z]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/** An ID with a prefix: `acct-…`, `sess-…`, `grant-…`. Not a secret. */
export const idWith = (prefix: string): string => `${prefix}-${randomBytes(9).toString("base64url").replace(/[-_]/g, "x").toLowerCase()}`;
