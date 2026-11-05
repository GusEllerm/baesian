import type { ReactNode } from "react";
import { Sheet, Shell, To } from "./Page";

// The privacy policy (M9f), as docs/vault/Design/Privacy Policy.md drafts it and its cards decided: run by Gus Ellerm
// as an individual (B-mkryw), written to at privacy@baesian.dev (B-8xxrc), with retention as B-9jqt4, B-ec3kj and
// B-dsqyd set it and deleting an account as B-b46z3 did. Anyone may open it, signed in or not. Every statement is one the
// service's code bears out; the note says where each comes from, and what still needs a lawyer's eye.

/** When the policy last changed, as the page says it. */
export const POLICY_CHANGED = "2026-11-04";

/** Where people write about their data (B-8xxrc): an address on the domain, forwarded to the operator. */
export const PRIVACY_CONTACT = "privacy@baesian.dev";

/** Who runs the service (B-mkryw). */
export const OPERATOR = "Gus Ellerm";

const Mail = () => (
  <a className="link" href={`mailto:${PRIVACY_CONTACT}`}>
    {PRIVACY_CONTACT}
  </a>
);

function List({ children }: { children: ReactNode }) {
  return <ul className="site-list">{children}</ul>;
}

/** How long each thing is kept, as a row: what, and how long. */
const KEPT: [string, string][] = [
  ["A card's text, once answered or withdrawn", "30 days after every machine signed in to the project has the answer or the withdrawal. Then only its ID, times, sizes and level stay."],
  ["A card's text, held back by your settings and never answered", "90 days after it arrived. Then only its ID, times, sizes and level stay."],
  ["A card's text, waiting for you", "Until it's answered or withdrawn."],
  ["Your rules, topic merges and gate settings", "While the project exists."],
  ["Usage events", "90 days, then only daily totals, with no ID."],
  ["A sign-in", "Until you sign out, or 30 days unused, or 90 days in all."],
  ["A machine", "Until you sign it out, or 30 days unused."],
  ["An emailed code", "15 minutes."],
  ["Your account, and everything listed under it", "Until you delete it, and 14 days after, while it can still be restored."],
];

export function Privacy({ who }: { who?: string | undefined }) {
  const changed = new Date(`${POLICY_CHANGED}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Shell who={who}>
      <Sheet
        title="Privacy"
        lead="Baesian's hosted service, at baesian.dev, passes your coding agents' design decisions to you as cards, and your answers back to them. This page says what it keeps about you and your projects, why, for how long, who else handles it, and how to have it corrected or deleted."
      >
        <p className="small">Last changed {changed}.</p>
      </Sheet>

      <Sheet title="Who runs it" sub>
        <p>
          {OPERATOR} runs the service, as an individual, and decides what it keeps, which makes {OPERATOR} the controller of your data under data protection law. It isn't a service of the University of Chicago or of Globus, though you can sign in through Globus. To write about your data, use <Mail />.
        </p>
      </Sheet>

      <Sheet title="In short" sub>
        <List>
          <li>The service keeps what it needs to sign you in and to pass cards and answers between your machines and you.</li>
          <li>It can read what your cards say, so it can show them to you and hold some back under your settings. It deletes that text on a schedule, below. Your repository keeps its own record, which the service never sees.</li>
          <li>There are no passwords, no advertising, no selling of data, and no tracking across other sites. The service never stores your network address or where you are.</li>
          <li>It counts how the service is used, never what a card says, unless you turn that off.</li>
          <li>Your account page shows what's kept about your account, and you can delete the account there.</li>
        </List>
      </Sheet>

      <Sheet title="What it keeps, and why" sub>
        <h3 className="site-sub">Your account, to sign you in and to tell you about changes to it</h3>
        <List>
          <li>Your handle, and your email address. One that Globus gave is marked as not checked by us.</li>
          <li>Your passkeys: each one's public key, its name, and when it was added and last used. The private key never leaves your device.</li>
          <li>Your recovery code, kept only as a one-way hash, so it can be checked but not read.</li>
          <li>If you link Globus, the identifier Globus gives for you, and when you linked it.</li>
          <li>Where you're signed in: each browser's name, such as “Firefox on a Mac”, and when it signed in and was last used. Not its network address or location.</li>
        </List>
        <h3 className="site-sub">Your projects, to pass cards and answers between your machines and you</h3>
        <List>
          <li>Each project's name, as you typed it, and its random ID.</li>
          <li>
            Each machine you approve with <code>baesian login</code>: the name it gave (its hostname, unless you chose another), its project, and when it was approved and last used.
          </li>
          <li>What your agents file: each card's full text and its revisions, withdrawals, attachments and decks, the agent that filed it, the machine it came from, and when.</li>
          <li>What you answer: your choice and anything you wrote, your handle, whether you answered on a phone or a desktop, and, on a hard card, your passkey's signature over the answer. Also your rules, topic merges and gate settings.</li>
          <li>While a project's page is open, that you're there: the time of its latest heartbeat, and whether it's a phone or a desktop, so waiting agents know. While an agent waits for a card, that it's waiting. Either counts for 90 seconds after its latest heartbeat.</li>
        </List>
        <h3 className="site-sub">Notifications, if you turn them on</h3>
        <p>For each browser: the address its push service gives for it, the keys a notification is encrypted to, and the browser's name. A notification says how many cards are waiting, at which levels, in which project. Never what a card says.</p>
        <h3 className="site-sub">Usage counts</h3>
        <p>
          Counts and timings of how the service is used, such as how many cards are answered and how long they waited. Never what a card says, nor anyone's name. <To to="/counts">Every field is listed</To>. Every account is counted unless it turns this off on the account page.
        </p>
        <h3 className="site-sub">What it doesn't keep</h3>
        <List>
          <li>Your network address, which is used in passing to limit how often sign-in can be tried and to check for bots, then forgotten.</li>
          <li>Passwords: there are none.</li>
          <li>Your repository: its code, branches, file paths and name never reach the service. Only what an agent writes in a card does.</li>
        </List>
        <h3 className="site-sub">In your browser</h3>
        <List>
          <li>The sign-in cookie while you're signed in, and a second cookie for ten minutes during a Globus sign-in. No other cookies.</li>
          <li>On a project's page, which cards you've seen and how long you spent on each, to show what's new. That stays in your browser.</li>
        </List>
      </Sheet>

      <Sheet title="Why it's allowed to" sub>
        <List>
          <li>
            <b>To provide the service you signed up for:</b> your account, signing in, passing cards and answers, and the notifications you turn on. This is necessary to perform the contract with you (GDPR Article 6(1)(b)).
          </li>
          <li>
            <b>To keep it safe and to know how it's used:</b> the limits on sign-in, the bot check at sign-up, and the usage counts. These are legitimate interests (Article 6(1)(f)): the interest in a service that works and can be paid for, weighed against yours, with the counts limited to fixed values and a way to turn them off.
          </li>
        </List>
      </Sheet>

      <Sheet title="How long it's kept" sub>
        <ul className="site-rows">
          {KEPT.map(([what, how]) => (
            <li key={what} className="site-row">
              <span className="nm">{what}</span>
              <span className="st">{how}</span>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet title="Who else handles it" sub>
        <List>
          <li>
            <b>Cloudflare, Inc.</b> runs the service: everything above is stored on its platform, it sends the service's emails, and it runs the bot check at sign-up (Turnstile). It carries every request, so it sees your network address. For the bot check it also uses what it sees to improve its own bot detection, for its own purposes.
          </li>
          <li>
            <b>Globus</b>, run by the University of Chicago, if you sign in through it: you sign in at Globus, which tells the service your Globus identifier and email address. Globus's own privacy policy covers your Globus account.
          </li>
          <li>
            <b>Your browser's push service</b> (Google's, Mozilla's, Apple's or Microsoft's), if you turn on notifications: it carries each one to your browser, encrypted so it can't read it.
          </li>
        </List>
        <p>Nobody else. Your data isn't sold, shared for advertising, or used to train models.</p>
      </Sheet>

      <Sheet title="Where it's kept" sub>
        <p>On Cloudflare's platform, in its default locations; the accounts database is in eastern North America. If you're in the EU or the UK, your data goes to the United States under Cloudflare's data processing terms.</p>
      </Sheet>

      <Sheet title="Your rights" sub>
        <p>You can ask to see what the service keeps about you, to have it corrected or deleted, to have a copy you can take elsewhere, and to restrict or object to how it's used. You can also complain to your data protection authority.</p>
        <p>
          Much of it you can do yourself, on <To to="/account">your account page</To>: see your account, passkeys, sign-ins and machines; sign any of them out; turn off usage counts; and delete your account. For anything else, write to <Mail />. You'll have an answer within a month.
        </p>
      </Sheet>

      <Sheet title="Deleting your account" sub>
        <p>Deleting it, on your account page, asks for your passkey and your handle. The account is closed at once: every sign-in and machine is signed out, nothing more is relayed or counted, and a notice is emailed to you.</p>
        <p>For 14 days, signing in with your passkey can restore it as it was. Then everything goes for good: your account, email addresses, passkeys, recovery code, Globus link, sign-ins, machines, notifications and raw usage events, and every project you own, with all its cards and answers on the service. Daily usage totals, which name no one, stay. Your repositories keep their own record.</p>
      </Sheet>

      <Sheet title="Security" sub>
        <List>
          <li>Every connection is encrypted, and Cloudflare encrypts what it stores.</li>
          <li>Sign-in tokens, emailed codes and recovery codes are kept only as hashes.</li>
          <li>Signing in takes a passkey, and adding a way in, approving a machine or deleting the account asks for it again.</li>
          <li>Baesian's command line refuses to send a card that looks like it holds a password or key, unless the agent gives a reason.</li>
          <li>The service can read what cards say, so its operator technically could. The operator doesn't look at a project's cards unless its owner asks for help with them, or to deal with abuse or a security problem.</li>
        </List>
      </Sheet>

      <Sheet title="Changes" sub>
        <p>When this policy changes, the date at the top changes. If a change affects what's kept or why, account holders are emailed before it takes effect.</p>
      </Sheet>
    </Shell>
  );
}
