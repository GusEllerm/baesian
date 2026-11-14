import type { ReactNode } from "react";
import { Sheet, Shell, To } from "./Page";

// The privacy policy (M9f), as docs/vault/Design/Privacy Policy.md drafts it and its cards decided: run by Gus Ellerm
// as an individual (B-mkryw), written to at privacy@baesian.dev (B-8xxrc), with retention as B-9jqt4, B-ec3kj and
// B-dsqyd set it and deleting an account as B-b46z3 did; projects with members (P20) as B-hr2g2's background drafted
// them, with a leaver's practice answers as B-wfw7a decided. Anyone may open it, signed in or not. Every statement is one the
// service's code bears out; the note says where each comes from, and what still needs a lawyer's eye.

/** When the policy last changed, as the page says it. */
export const POLICY_CHANGED = "2026-11-14";

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
  ["A commit's ID, time and branch, for the card it cites", "As long as that card's text: removed with it."],
  ["A merge: its two branches, its time, the IDs of its commit, of the branch's commit that landed and of the commits citing cards it brought, and the cards it brought", "Until the text of every card it brought is removed. One that brought commits citing cards: until the text of every card they cite is removed too, which the service can tell only for the commits it was told cite cards. One whose commits the service was never told cite cards (they were made where Baesian isn't signed in to the project), or that brought only a branch's deck: while the project exists, since nothing ties it to a card's text."],
  ["Your repository's default branch: its name", "While the project exists."],
  ["Your decks, each a branch's or a piece of work's, with its name", "While the project exists."],
  ["Your rules, topic merges and gate settings", "While the project exists."],
  ["Your answers on practice cards, and your marks in the blind test", "While the project exists and you're a member of it. They name a card only by its ID, so they keep none of its text."],
  ["A project's members: who they are, their roles, when they joined, and by whose link", "Until they leave or are removed, or the project is deleted."],
  ["A link to join a project", "Until a day after it's used or expires, or until an owner cancels it."],
  ["Whom a card was sent to", "As long as that card's text: removed with it."],
  ["A member's latest heartbeat at the desk", "A day."],
  ["Which member was told of which card", "Until no one is still to be told of it."],
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
          <li>In a project you share, its other members see your handle and what you answer in it, as you see theirs.</li>
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
          <li>Who a project's members are: each one's account, whether they're an owner, when they joined, and which owner's link they joined by.</li>
          <li>A link to join a project: only a one-way hash of its code, who made it, when, when it expires, and who used it and when. No address is kept: an owner sends the link however they like.</li>
          <li>
            Each machine you approve with <code>baesian login</code>: the name it gave (its hostname, unless you chose another), its project, and when it was approved and last used.
          </li>
          <li>What your agents file: each card's full text and its revisions, withdrawals, attachments and decks, the agent that filed it and the model it ran on, the machine it came from, the name of the branch it was filed on, and when. The branch name is kept with the card's text, and deleted with it; a branch's deck, which is named for the branch, is kept while the project is.</li>
          <li>What Baesian's command line finds in your repository's history, to show your decisions by branch: for each commit that cites a card, its ID, when it was made, its branch and the card; for each merge of a branch with cards, or with commits citing them, into another, the two branches, when, the ID of the merge's commit and of the branch's commit that landed, the cards it brought, and the IDs of the commits citing cards it brought; and the name of your repository's default branch, to show it as the trunk. A commit's subject and message, and what it changed, never reach the service.</li>
          <li>What you answer: your choice and anything you wrote, your handle, whether you answered on a phone or a desktop, and, on a hard card, your passkey's signature over the answer. Also your rules, topic merges and gate settings.</li>
          <li>
            Your answers on practice cards: past cards brought back with the other option shown as the agent's pick, to see how often you come round to a pick an agent didn't make. For each, the card it was rebuilt from, when you answered that card, which option you chose before seeing the pick shown and which after, or that you answered another way, your handle, whether you answered on a phone or a desktop, and when. In the blind test that comes first, also whether you thought each card you answered was rebuilt, and when you started it. Never what you wrote on a practice card. They're kept apart from your cards: no machine or agent is ever sent them.
          </li>
          <li>While a project's page is open, that you're there: the time of its latest heartbeat, and whether it's a phone or a desktop, so waiting agents know. While an agent waits for a card, that it's waiting. Either counts for 90 seconds after its latest heartbeat.</li>
          <li>Each member's latest heartbeat at the desk, kept a day, so each is told of their own cards only while they're away.</li>
          <li>Whom each card was sent to, and who passed one on.</li>
        </List>
        <h3 className="site-sub">Notifications, if you turn them on</h3>
        <p>For each browser: the address its push service gives for it, the keys a notification is encrypted to, and the browser's name. A notification says how many cards are waiting, at which levels, in which project. Never what a card says. Also which member was told of which card, until no one is still to be told of it.</p>
        <h3 className="site-sub">Usage counts</h3>
        <p>
          Counts and timings of how the service is used, such as how many cards are answered and how long they waited. Never what a card says, nor anyone's name. <To to="/counts">Every field is listed</To>. Every account is counted unless it turns this off on the account page.
        </p>
        <h3 className="site-sub">What it doesn't keep</h3>
        <List>
          <li>Your network address, which is used in passing to limit how often sign-in can be tried and to check for bots, then forgotten.</li>
          <li>Passwords: there are none.</li>
          <li>Your repository: its code, file paths and name never reach the service, nor any commit's subject or message. Only what an agent writes in a card does, with the name of the branch it was filed on; for the commits that cite cards and the merges that bring them, their IDs, times and branches; and the name of its default branch.</li>
        </List>
        <h3 className="site-sub">In your browser</h3>
        <List>
          <li>The sign-in cookie while you're signed in, and a second cookie for ten minutes during a Globus sign-in. No other cookies.</li>
          <li>On a project's page, which cards you've seen and how long you spent on each, to show what's new. That stays in your browser.</li>
          <li>While you sign up or sign in from a link to join a project, the link's code is kept in that tab until you join, choose not to, or close the tab.</li>
        </List>
      </Sheet>

      <Sheet title="Projects you share" sub>
        <p>An owner of a project can add people to it, each by a link that works once, for seven days. Everything above about a project is then about all its members.</p>
        <List>
          <li>What the other members see of you: your handle, whether you're an owner, and when you joined; every answer you give on its cards, with what you chose before seeing the agent's pick, anything you wrote, and whether you answered on a phone or a desktop; which cards were sent to you; and that someone is at the desk, not who. Never your email address, or your practice answers.</li>
          <li>Their machines are sent the project's cards and answers, with the name of the machine that uploaded each, and keep them in their repository's record, as yours do.</li>
          <li>Its owners also see the links to join it that haven't been used, with who made each.</li>
          <li>An owner can remove you, and you can leave. What's yours alone in the project then goes at once: your practice answers and blind-test marks, your latest heartbeat, and which cards you were told of. The cards sent to you are its owners' from then. Your answers on its cards stay, with your handle, until each card's text goes, as everyone's do.</li>
          <li>The account that made a project holds it, and can't leave it. Deleting that account deletes the project for every member.</li>
        </List>
      </Sheet>

      <Sheet title="Why it's allowed to" sub>
        <List>
          <li>
            <b>To provide the service you signed up for:</b> your account, signing in, passing cards and answers, showing what you do in a project you share to its other members, and the notifications you turn on. This is necessary to perform the contract with you (GDPR Article 6(1)(b)).
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
        <p>Nobody else, beyond the members of a project you share. Your data isn't sold, shared for advertising, or used to train models.</p>
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
        <p>Deleting it, on your account page, asks for your passkey and your handle. The account is closed at once: every sign-in and machine is signed out, nothing more is relayed or counted, the projects you made are closed for every member of them, and a notice is emailed to you.</p>
        <p>For 14 days, signing in with your passkey can restore it as it was. Then everything goes for good: your account, email addresses, passkeys, recovery code, Globus link, sign-ins, machines, notifications and raw usage events, the links to join you made, and every project you made, for every member of it, with all its cards and answers on the service, practice answers included. In a project you only joined, what's yours alone goes, as when you leave it, and your answers on its cards stay, with your handle, until each card's text goes. Daily usage totals, which name no one, stay. Your repositories keep their own record.</p>
      </Sheet>

      <Sheet title="Security" sub>
        <List>
          <li>Every connection is encrypted, and Cloudflare encrypts what it stores.</li>
          <li>Sign-in tokens, emailed codes and recovery codes are kept only as hashes.</li>
          <li>Signing in takes a passkey, and adding a way in, approving a machine or deleting the account asks for it again.</li>
          <li>Baesian's command line refuses to send a card that looks like it holds a password or key, unless the agent gives a reason.</li>
          <li>The service can read what cards say, so its operator technically could. The operator doesn't look at a project's cards unless one of its owners asks for help with them, or to deal with abuse or a security problem.</li>
        </List>
      </Sheet>

      <Sheet title="Changes" sub>
        <p>When this policy changes, the date at the top changes. If a change affects what's kept or why, account holders are emailed before it takes effect.</p>
      </Sheet>
    </Shell>
  );
}
