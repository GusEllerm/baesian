import { NEVER_COUNTED, USAGE_KINDS, USAGE_RAW_DAYS, type UsageValue } from "../../../src/usage-fields";
import { Sheet, Shell, To } from "./Page";

// What the service counts (M9e step 2, D141, B-7nq85): the public page that lists every field, read from the same list
// the service checks every event against (src/usage-fields.ts), so the page and what's kept can't differ. Anyone may
// open it, signed in or not.

/** What a field may hold, in words. */
function values(v: UsageValue) {
  if (v.type === "number") return <>a whole number</>;
  if (v.type === "yes-no") return <>yes or no</>;
  const list = v.values.map((x, i) => (
    <span key={x}>
      {i > 0 && ", "}
      <code>{x}</code>
    </span>
  ));
  return v.type === "one-of" ? <>one of {list}</> : <>any of {list}</>;
}

export function Counts({ who }: { who?: string | undefined }) {
  return (
    <Shell who={who} wide>
      <Sheet
        title="What the service counts"
        lead="Baesian's hosted service counts how it's used, to know whether it works and what it costs: counts and timings, never what your cards say. Every account is counted unless it opts out. This is the whole list."
      >
        <p>
          Each event also carries a random usage ID for your account, made from nothing about you, a random key for the project it's about, and the hour it happened, in UTC, never the minute. A server error carries none of these.
        </p>
      </Sheet>

      <Sheet title="Every event, and every field" sub label="Every event">
        <ul className="counts">
          {Object.entries(USAGE_KINDS).map(([name, k]) => (
            <li key={name} className="count-kind">
              <h3>
                <code>{name}</code>
              </h3>
              <p>
                When {k.when}. It tells us {k.why}.
              </p>
              {Object.keys(k.fields).length ? (
                <dl>
                  {Object.entries(k.fields).map(([f, spec]) => (
                    <div key={f}>
                      <dt>
                        <code>{f}</code>
                      </dt>
                      <dd>
                        {spec.what}: {values(spec.value)}.
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="small">No fields: only that it happened.</p>
              )}
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet title="Never counted" sub label="Never counted">
        <ul className="counts-never">
          {NEVER_COUNTED.map((n) => (
            <li key={n}>{n[0]!.toUpperCase() + n.slice(1)}.</li>
          ))}
        </ul>
      </Sheet>

      <Sheet title="How long it's kept, and how to stop it" sub label="How long, and stopping it">
        <p>
          Each event is kept for {USAGE_RAW_DAYS} days. After that, only daily counts of each value are kept, with no usage ID, project key or hour.
        </p>
        <p>
          To stop it, untick “Count my use of the service” on <To to="/account">your account page</To>. Nothing more is counted, what was kept for your account is deleted at once, and if you turn it on again you get a new usage ID, so nothing before is linked to anything after. Daily counts made before then stay: they say nothing about who.
        </p>
        <p>
          Everything else the service keeps, and why, is in <To to="/privacy">the privacy policy</To>.
        </p>
      </Sheet>
    </Shell>
  );
}
