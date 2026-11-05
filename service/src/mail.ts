// The service's emails (M9c): codes for signing up and getting back in, and notices of what changed on an account,
// through Cloudflare's Email Sending (B-pvye0). Locally and in tests the binding is simulated: each message is logged and
// saved to a file, with no account. Tests can also hand the Worker a mailer of their own, to read the codes.

/** One email: who to, and what it says. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** What it's for, for tests and logs: "signup-code", "recovery-code", "recovered", "passkey-added", "already-signed-up". */
  kind: MailKind;
  /** The code it carries, if any. */
  code?: string;
}

export type MailKind = "signup-code" | "already-signed-up" | "recovery-code" | "recovered" | "passkey-added" | "account-closed" | "account-restored";

/** What sends the service's emails. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Email Sending's Workers binding (B-pvye0): plain text, with a simple HTML copy. */
export function bindingMailer(binding: SendEmail, from: string): Mailer {
  return {
    async send(mail) {
      await binding.send({ to: mail.to, from: { email: from, name: "Baesian" }, subject: mail.subject, text: mail.text, html: html(mail.text) });
    },
  };
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const html = (text: string) => `<!doctype html><html><body style="font-family: sans-serif">${text.split("\n\n").map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("")}</body></html>`;

const NOT_YOU = "If this wasn't you, you can ignore this email: nothing happens without the code.";

/** The messages, by kind. */
export const mails = {
  signupCode: (to: string, code: string, origin: string): Mail => ({
    to,
    kind: "signup-code",
    code,
    subject: `Your Baesian sign-up code: ${code}`,
    text: `Your code to finish signing up for Baesian at ${origin} is:\n\n${code}\n\nIt works for 15 minutes.\n\n${NOT_YOU}`,
  }),
  alreadySignedUp: (to: string, origin: string): Mail => ({
    to,
    kind: "already-signed-up",
    subject: "You already have a Baesian account",
    text: `Someone asked to sign up for Baesian at ${origin} with this address, which already has an account.\n\nTo sign in, use your passkey. If you've lost every passkey, use "Get back in" with your recovery code.\n\n${NOT_YOU}`,
  }),
  recoveryCode: (to: string, code: string, origin: string): Mail => ({
    to,
    kind: "recovery-code",
    code,
    subject: `Your Baesian recovery code: ${code}`,
    text: `Your code to get back into your Baesian account at ${origin} is:\n\n${code}\n\nIt works for 15 minutes, together with the recovery code you saved when you signed up.\n\n${NOT_YOU}`,
  }),
  recovered: (to: string, handle: string, origin: string): Mail => ({
    to,
    kind: "recovered",
    subject: "Your Baesian account was recovered",
    text: `Someone got back into the Baesian account ${handle} at ${origin} with an emailed code and the saved recovery code. A new passkey was added, every other sign-in was ended, and a new recovery code was issued.\n\nIf this was you, there's nothing to do. If it wasn't, your email and recovery code are both in someone else's hands: get back in yourself at once, and remove the passkey you don't recognise.`,
  }),
  passkeyAdded: (to: string, handle: string, origin: string): Mail => ({
    to,
    kind: "passkey-added",
    subject: "A passkey was added to your Baesian account",
    text: `A new passkey was added to the Baesian account ${handle} at ${origin}.\n\nIf this was you, the hard cards you answer with it count in CI once its line, on your account page at ${origin}/account, is in your CI's BAESIAN_TRUST. If it wasn't, sign in and remove it.`,
  }),
  accountClosed: (to: string, handle: string, origin: string, deletes: string): Mail => ({
    to,
    kind: "account-closed",
    subject: "Your Baesian account is closed",
    text: `The Baesian account ${handle} at ${origin} was closed, with its passkey. Every sign-in and machine is signed out, and nothing more is relayed or counted.\n\nOn ${deletes} it will be deleted, with every project it owns and all their cards and answers on the service. Your repositories keep their own record.\n\nTo keep it, sign in at ${origin}/sign-in with your passkey before then, and restore it. If this wasn't you, do that now.`,
  }),
  accountRestored: (to: string, handle: string, origin: string): Mail => ({
    to,
    kind: "account-restored",
    subject: "Your Baesian account was restored",
    text: `The Baesian account ${handle} at ${origin} was closed, and has been restored with its passkey: it won't be deleted. Its machines need signing in again with baesian login, and notifications turning on again.\n\nIf this wasn't you, sign in, end the sign-ins you don't recognise, and close it again.`,
  }),
};
