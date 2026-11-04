-- Baesian's accounts (M9c), in one D1 database (B-ytdt2). docs/vault/Design/File Formats.md describes each table.
-- Secrets are kept only as SHA-256 hashes: session and machine tokens, emailed codes, recovery codes, flow secrets.
-- No IP address or location is stored anywhere (B-7bq05).

-- An account: Baesian's own stable ID, never a Globus identity (D153, P16 section 7), and its handle.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created TEXT NOT NULL
);

-- An account's email addresses, lowercased. `verified` is when a code sent to it was checked; an address Globus gave
-- (D153) is kept unverified.
CREATE TABLE emails (
  address TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  verified TEXT,
  created TEXT NOT NULL
);
CREATE INDEX emails_account ON emails (account);

-- A passkey (D153, D139): its credential ID, its public key as COSE (what sign-in checks with) and as SPKI with its
-- COSE algorithm (what its key file in each project's trust/ says, D159), and its sign counter.
CREATE TABLE passkeys (
  credential TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  cose TEXT NOT NULL,
  spki TEXT NOT NULL,
  alg INTEGER NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT NOT NULL,
  enrolled TEXT NOT NULL,
  last_used TEXT
);
CREATE INDEX passkeys_account ON passkeys (account);

-- The saved recovery code (B-jzgy4): one per account, replaced each time it's used.
CREATE TABLE recovery_codes (
  account TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  created TEXT NOT NULL
);

-- A Globus identity linked to an account (D153, B-s76hg): the ID token's `sub`, linked only while signed in, never by
-- matching an email address.
CREATE TABLE globus_identities (
  sub TEXT PRIMARY KEY,
  account TEXT NOT NULL UNIQUE REFERENCES accounts (id) ON DELETE CASCADE,
  linked TEXT NOT NULL
);

-- A flow in progress, by the hash of the secret its browser holds: a sign-up or a recovery with its emailed code and
-- the attempts made on it, a passkey ceremony's challenge, or a Globus round trip. Short-lived.
CREATE TABLE flows (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  email TEXT,
  account TEXT,
  handle TEXT,
  code_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  challenge TEXT,
  globus_sub TEXT,
  data TEXT,
  created TEXT NOT NULL,
  expires TEXT NOT NULL
);
CREATE INDEX flows_email ON flows (email, created);

-- A sign-in in a browser (B-vtr1r: until 30 days without use, 90 days in all). A name and its last use, nothing about
-- where it came from (B-7bq05). `verified` is the last time the passkey was checked in it, for what asks for it afresh.
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created TEXT NOT NULL,
  last_used TEXT NOT NULL,
  verified TEXT NOT NULL,
  expires TEXT NOT NULL
);
CREATE INDEX sessions_account ON sessions (account);

-- A project, one repo on the service, and its owner (P15 section 2: one owner per project in v1).
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created TEXT NOT NULL
);
CREATE INDEX projects_owner ON projects (owner);

-- A machine's grant (B-84e0d: one per machine and project), with its current access and refresh tokens' hashes.
CREATE TABLE grants (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  project TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  machine TEXT NOT NULL,
  access_hash TEXT NOT NULL UNIQUE,
  access_expires TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  created TEXT NOT NULL,
  last_used TEXT NOT NULL,
  revoked TEXT
);
CREATE INDEX grants_account ON grants (account);

-- Refresh tokens already used: one presented again revokes its grant (RFC 9700).
CREATE TABLE spent_tokens (
  hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES grants (id) ON DELETE CASCADE,
  spent TEXT NOT NULL
);

-- A machine asking to sign in (RFC 8628): its device code's hash, the code a person types, and the answer.
CREATE TABLE device_codes (
  hash TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  project TEXT NOT NULL,
  machine TEXT NOT NULL,
  created TEXT NOT NULL,
  expires TEXT NOT NULL,
  last_poll TEXT,
  approved_by TEXT REFERENCES accounts (id) ON DELETE CASCADE,
  denied INTEGER NOT NULL DEFAULT 0,
  issued INTEGER NOT NULL DEFAULT 0
);
