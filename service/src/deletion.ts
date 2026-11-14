import type { Account, Accounts } from "./accounts.js";
import { type Mailer, mails } from "./mail.js";

// Deleting an account (M9f), as card B-b46z3 decided, "Closed for 14 days, then deleted": the owner deletes it on the
// account page, with their passkey checked afresh and their handle typed out; it's closed at once (every sign-in and
// machine signed out, nothing more relayed or counted, a notice emailed); for 14 days, signing in with its passkey can
// restore it as it was; then the service's daily job (`housekeeping()` in index.ts) deletes it and everything under it.
// docs/vault/Modules/service.md describes it; the privacy policy (docs/vault/Design/Privacy Policy.md) says the same.

const DAY = 86_400_000;

/** How long a closed account waits before it's deleted for good (B-b46z3). */
export const DELETION = { graceMs: 14 * DAY };

/** When an account closed at `closed` is deleted: 14 days on, at the daily job's first run after. */
export const deletesAt = (closed: string): string => new Date(Date.parse(closed) + DELETION.graceMs).toISOString();

/** A date as the notice says it: "18 November 2026". */
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Close an account (B-b46z3): ended sign-ins, revoked machines, no notifications, nothing counted; a notice to each of
 * its addresses saying when it will be deleted and how to keep it. Returns when it will be deleted.
 */
export async function closeAccount(accounts: Accounts, account: Account, mail: Mailer, origin: string): Promise<{ deletes: string }> {
  await accounts.close(account.id);
  const closed = (await accounts.account(account.id))!.closed!;
  const deletes = deletesAt(closed);
  for (const e of await accounts.emails(account.id)) {
    try {
      await mail.send(mails.accountClosed(e.address, account.handle, origin, dayOf(deletes)));
    } catch (err) {
      console.error(`the notice of closing ${account.id} didn't send: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { deletes };
}

/** Restore a closed account, within its 14 days: open again, and a notice to each of its addresses. */
export async function restoreAccount(accounts: Accounts, account: Account, mail: Mailer, origin: string): Promise<boolean> {
  if (!(await accounts.reopen(account.id))) return false;
  for (const e of await accounts.emails(account.id)) {
    try {
      await mail.send(mails.accountRestored(e.address, account.handle, origin));
    } catch (err) {
      console.error(`the notice of restoring ${account.id} didn't send: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return true;
}

/**
 * Delete every account closed 14 days ago or more (B-b46z3): the relay data of each project it holds first (`erase`, the
 * project's Durable Object emptied), then the account's rows (`Accounts.erase`). Only the projects it holds
 * (`Accounts.projectsHeldBy`): a project it was only a member of stays, without it (P20), and is told it has gone
 * (`gone`, `ProjectRelay.memberGone`), as when a member leaves: the cards sent to it are the project's owners' again,
 * and its practice answers there go. An account whose projects can't all be erased or told is left for the next day.
 * Returns the accounts deleted.
 */
export async function deleteClosed(accounts: Accounts, erase: (project: string) => Promise<void>, now: number = Date.now(), gone?: (project: string, account: string) => Promise<void>): Promise<string[]> {
  const out: string[] = [];
  for (const id of await accounts.closedBefore(new Date(now - DELETION.graceMs).toISOString())) {
    try {
      for (const p of await accounts.projectsHeldBy(id)) await erase(p.id);
      if (gone) for (const project of await accounts.memberOnlyOf(id)) await gone(project, id);
      await accounts.erase(id);
      out.push(id);
    } catch (e) {
      console.error(`deleting account ${id} failed, and is tried again tomorrow: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
