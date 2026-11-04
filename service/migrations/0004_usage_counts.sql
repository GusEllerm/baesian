-- Usage counts (M9e step 2, D141, B-7nq85): counts and timings only, from every account unless it opts out, never what
-- a card says or anyone's name; src/usage-fields.ts lists every field, and the website's /counts page shows that list.

-- An account's pseudonymous usage ID: random, made at its first counted event, and replaced when it opts out, so nothing
-- before is linked to anything after. `usage_opt_out` is when it opted out; while it's set, nothing is counted.
ALTER TABLE accounts ADD COLUMN usage_id TEXT;
ALTER TABLE accounts ADD COLUMN usage_opt_out TEXT;

-- A project's random usage key, made at its first counted event: events name it, never the project's ID.
ALTER TABLE projects ADD COLUMN usage_key TEXT;

-- The raw events, for 90 days: a kind, its fields as JSON (only those src/usage-fields.ts allows), the hour (UTC, no
-- minutes), and the usage ID and project key, or neither for a server error.
CREATE TABLE usage_events (
  usage_id TEXT,
  project TEXT,
  kind TEXT NOT NULL,
  hour TEXT NOT NULL,
  fields TEXT NOT NULL
);
CREATE INDEX usage_events_id ON usage_events (usage_id);
CREATE INDEX usage_events_hour ON usage_events (hour);

-- After 90 days, only daily counts: per day and kind, how many events (`field` empty), and how many had each value of
-- each field. No usage ID, project key or hour.
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, kind, field, value)
);
