// What the hosted service counts of its use (B-7nq85, "Ten kinds of event, fixed values only"; D141, "everyone, with an
// opt-out"). One list, shared: the service records an event only if it passes `usageProblem()` against it, and the
// website's public page (/counts) lists it, so the page and what's kept can't drift apart. Every value is from a fixed
// list, a number or yes/no, so no field can carry text. No imports: the website's build takes this file as it is.

export const USAGE_LEVELS = ["provisional", "blocking", "hard"] as const;
export const USAGE_RESPONSES = ["accept", "alternative", "correction", "reject", "question", "need_context", "see_it_run", "not_my_area", "defer"] as const;
export const USAGE_FACTS = ["schema", "public-api", "dependency", "user-facing", "publishes", "security", "privacy", "money", "data-loss", "infra"] as const;
export const USAGE_REVERSE = ["cheap", "moderate", "one-way"] as const;
/** The service's addresses, by name, for errors: a project's (`/v1/projects/{project}/…`) and the rest of `/v1/`. */
export const USAGE_ROUTES = [
  "log",
  "state",
  "presets",
  "live",
  "pushes",
  "upload",
  "stop-waiting",
  "verdicts",
  "aliases",
  "preferences",
  "presence",
  "proofs",
  "config",
  "signup",
  "signin",
  "recover",
  "account",
  "globus",
  "machines",
  "usage",
  "other",
] as const;

/** What a field may hold. */
export type UsageValue = { type: "one-of"; values: readonly string[] } | { type: "any-of"; values: readonly string[] } | { type: "number" } | { type: "yes-no" };

/** One field of an event: what it holds, and what it is, as the public page says it. */
export interface UsageField {
  value: UsageValue;
  what: string;
}

/** A kind of event: when it's recorded, what it answers, its fields, and whether it carries the IDs. */
export interface UsageKind {
  when: string;
  why: string;
  fields: Record<string, UsageField>;
  /** False for an error, which carries neither the usage ID nor the project key. */
  ids: boolean;
}

const oneOf = (values: readonly string[]): UsageValue => ({ type: "one-of", values });
const NUMBER: UsageValue = { type: "number" };
const YES_NO: UsageValue = { type: "yes-no" };

/** The ten kinds (B-7nq85), with their fields. */
export const USAGE_KINDS: Record<string, UsageKind> = {
  account_created: {
    when: "an account is made",
    why: "how many people sign up, and whether they come through Globus",
    fields: { via: { value: oneOf(["email", "globus"]), what: "how they signed up" } },
    ids: true,
  },
  machine_approved: {
    when: "a machine is approved to sign in to a project",
    why: "how many machines and repos people link",
    fields: { new_project: { value: YES_NO, what: "whether approving it made a new project" } },
    ids: true,
  },
  card_filed: {
    when: "a machine sends a card, or a revision of one, to the service",
    why: "what agents ask about, how often the gate holds cards back, and which harnesses are used",
    fields: {
      revision: { value: NUMBER, what: "which revision of its card it is: 1 for a new card" },
      level: { value: oneOf(USAGE_LEVELS), what: "its level in force" },
      gate: { value: oneOf(["shown", "held", "shadow"]), what: "whether the gate showed it, held it back, or would have in shadow" },
      touches: { value: { type: "any-of", values: USAGE_FACTS }, what: "which of the ten facts it says it touches" },
      reverse: { value: oneOf(USAGE_REVERSE), what: "how costly it says it is to undo" },
      harness: { value: oneOf(["claude-code", "codex", "other"]), what: "which harness filed it; any other agent's name is kept only as other" },
      by_baesian: { value: YES_NO, what: "whether Baesian filed it itself (a proposal from your answers)" },
    },
    ids: true,
  },
  card_answered: {
    when: "you answer a card on the website",
    why: "how often answers overturn the agent's pick or ask for more context, how long cards wait, and whether you answer from a phone",
    fields: {
      response: { value: oneOf(USAGE_RESPONSES), what: "which answer it was" },
      client: { value: oneOf(["desktop", "phone"]), what: "the desktop layout or the phone's" },
      level: { value: oneOf(USAGE_LEVELS), what: "the card's level in force" },
      minutes_waiting: { value: NUMBER, what: "minutes from the card's filing to the answer" },
      blind_match: { value: YES_NO, what: "whether your choice before the agent's pick was shown matched it; left out for a card you'd answered in chat first" },
      switched: { value: YES_NO, what: "whether you changed your choice after seeing the agent's pick" },
      was_held: { value: YES_NO, what: "whether the gate had held the card back" },
      made_rule: { value: YES_NO, what: "whether you asked for a rule from it" },
    },
    ids: true,
  },
  preferences_changed: {
    when: "you change your preferences",
    why: "whether the preference sliders are used",
    fields: {
      mode: { value: oneOf(["shadow", "on"]), what: "whether holding back is in shadow or on" },
      loosening: { value: YES_NO, what: "whether the change lets more cards past you" },
      rows_changed: { value: NUMBER, what: "how many rows changed" },
    },
    ids: true,
  },
  topic_merged: {
    when: "you merge two topics",
    why: "whether merging topics is used",
    fields: {},
    ids: true,
  },
  push_sent: {
    when: "the service sends a notification",
    why: "how often notifications go, and whether they arrive",
    fields: {
      reason: { value: oneOf(["at once", "digest"]), what: "a blocking or hard card at once, or a digest" },
      urgency: { value: oneOf(["high", "normal"]), what: "the urgency the push service was given" },
      cards: { value: NUMBER, what: "how many cards it counted" },
      result: { value: oneOf(["delivered", "gone", "failed"]), what: "what the push services answered" },
    },
    ids: true,
  },
  push_opened: {
    when: "you open a notification",
    why: "how long after a notification you open it",
    fields: { minutes_after: { value: NUMBER, what: "minutes from the notification to opening it" } },
    ids: true,
  },
  visit: {
    when: "you open a project's page, the first time each day on each kind of screen",
    why: "how many people answer each day, and on which kind of screen",
    fields: { client: { value: oneOf(["desktop", "phone"]), what: "the desktop layout or the phone's" } },
    ids: true,
  },
  error: {
    when: "the service fails to answer a request",
    why: "where the service fails",
    fields: {
      route: { value: oneOf(USAGE_ROUTES), what: "which of the service's addresses failed, by name" },
      status: { value: NUMBER, what: "the error's status code" },
    },
    ids: false,
  },
};

export type UsageKindName = keyof typeof USAGE_KINDS;

/** What's never counted, in words, as the public page says it. */
export const NEVER_COUNTED = [
  "what a card says: its title, question, options, crux, body or comments",
  "topics, deck names, project names and repo names or addresses",
  "branch names, file paths and code",
  "handles, email addresses, machine names and agents' own names",
  "card IDs, project IDs and account IDs",
  "network addresses, locations and browsers' names",
  "the exact time anything happened: only its hour",
];

/** Raw events are kept this many days, then only daily counts with no ID, key or hour. */
export const USAGE_RAW_DAYS = 90;

/** The fields an event of a kind may record, checked: undefined if they pass, otherwise why not. Nothing else is kept. */
export function usageProblem(kind: string, fields: Record<string, unknown>): string | undefined {
  const k = Object.hasOwn(USAGE_KINDS, kind) ? USAGE_KINDS[kind] : undefined;
  if (!k) return `${kind} isn't a kind of event the service counts`;
  for (const [name, v] of Object.entries(fields)) {
    const f = Object.hasOwn(k.fields, name) ? k.fields[name] : undefined;
    if (!f) return `${kind} has no field ${name}`;
    const spec = f.value;
    if (spec.type === "number" && !(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000)) return `${kind}.${name} is a whole number`;
    if (spec.type === "yes-no" && typeof v !== "boolean") return `${kind}.${name} is yes or no`;
    if (spec.type === "one-of" && !(typeof v === "string" && spec.values.includes(v))) return `${kind}.${name} is one of ${spec.values.join(", ")}`;
    if (spec.type === "any-of" && !(Array.isArray(v) && v.every((x) => typeof x === "string" && spec.values.includes(x)) && new Set(v).size === v.length)) return `${kind}.${name} is a list from ${spec.values.join(", ")}`;
  }
  return undefined;
}
