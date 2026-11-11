import { createContext, useContext } from "react";
import type { ApiCard } from "../../src/api";

// Several reviewers per project (P20), on the website's desk. A card is every member's (B-r51ts), and it's sent to one
// (B-2n7s4, B-tzdjn): the state says whom, as `ApiCard.sent_to`. The desk leads with the cards sent to you, then shows
// the rest, each marked with whom it was sent to. A card a member passed on ("it's outside my expertise") still waits for
// everyone else. These are the rules, as the relay has them (service/src/notify.ts, `waitsFor()` and `sentTo()`), so the
// desk's queue and the projects page's count agree. With `baesian serve` there's no team: one person answers, as before.

/** The project's members, as the desk needs them: who you are in it, and each member's handle. */
export interface Team {
  /** Your account. */
  me: string;
  role: "owner" | "member";
  /** Each member's handle, by account, yours included. */
  handles: ReadonlyMap<string, string>;
}

export const TeamContext = createContext<Team | undefined>(undefined);
export const useTeam = () => useContext(TeamContext);

/** Whether a card is one only the project's owners answer (B-rxbss): a rule's draft, a pattern to make a rule of, or a proposed move of a setting. */
export const ownersOnly = (card: ApiCard): boolean => card.meta.rule !== undefined || card.meta.convention !== undefined || card.meta.pref_row !== undefined;

/**
 * The accounts that passed a card on: those whose latest answer on its latest revision is "it's outside my expertise".
 * None when one of those answers names no account (it's from before linking): the card then waits for nobody, as it did
 * before there were members.
 */
export function passedBy(card: ApiCard): string[] {
  const latest = new Map<string | undefined, string>();
  for (const v of card.verdicts) if (v.revision === card.meta.revision) latest.set(v.account, v.response);
  const passing = [...latest].filter(([, response]) => response === "not_my_area").map(([account]) => account);
  return passing.every((a): a is string => a !== undefined) ? passing : [];
}

/**
 * Whether a card waits for you. With no team, an open card does, as ever. In a team: an open card, and one someone
 * passed on unless you passed it too; never one only owners answer, when you aren't one.
 */
export function waitsForMe(card: ApiCard, team: Team | undefined): boolean {
  if (!team) return card.status === "open";
  if (ownersOnly(card) && team.role !== "owner") return false;
  if (card.status === "open") return true;
  if (card.status !== "rerouted") return false;
  const passed = passedBy(card);
  return passed.length > 0 && !passed.includes(team.me);
}

/** Whether a card was sent to you (B-tzdjn): to your account, or to nobody in particular when you're one of the owners. */
export const sentToMe = (card: ApiCard, team: Team): boolean => card.sent_to === team.me || (card.sent_to === undefined && team.role === "owner");

/** A member, as the desk names them: their handle, or that they've left the project. */
const named = (account: string, team: Team): string => team.handles.get(account) ?? "someone who has left";

/**
 * What a card says of whom it was sent to, when that isn't simply you: "sent to ana", "sent to the owners", or, once
 * someone has passed it on, "passed on by ana". Nothing in a project of one, where every card is yours.
 */
export function sentWords(card: ApiCard, team: Team | undefined): string | undefined {
  if (!team || team.handles.size < 2) return undefined;
  const passed = passedBy(card).filter((a) => a !== team.me);
  if (card.status === "rerouted" && passed.length) {
    // Whoever it was sent to comes first; else whoever passed it.
    const by = card.sent_to !== undefined && passed.includes(card.sent_to) ? card.sent_to : passed[0]!;
    return `passed on by ${named(by, team)}`;
  }
  if (sentToMe(card, team)) return undefined;
  return card.sent_to === undefined ? "sent to the owners" : `sent to ${named(card.sent_to, team)}`;
}

/** How long ago, in a few words: "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function ago(thenMs: number, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - thenMs) / 60_000);
  if (minutes < 1) return "just now";
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (minutes < 60) return say(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? say(hours, "hour") : say(Math.floor(hours / 24), "day");
}

/**
 * The card someone else decided while it was yours to answer, if `card` is one: who decided it. A card you answered
 * yourself, or one that left the queue any other way (withdrawn, revised), is none.
 */
export function decidedByAnother(card: ApiCard | undefined, team: Team | undefined): string | undefined {
  if (!team || !card || card.status !== "resolved") return undefined;
  const last = card.verdicts.filter((v) => v.revision === card.meta.revision).at(-1);
  if (!last || last.account === undefined || last.account === team.me) return undefined;
  return team.handles.get(last.account) ?? last.reviewer;
}
