-- Several reviewers per project (P20, stage 1). A project has members: the accounts that may read it and answer its cards
-- (B-r51ts: a card is every member's), some of them owners, who alone add and remove members and change its settings
-- and rules (B-rxbss). `projects.owner` stays what it was: the account that made the project and holds it, whose deletion
-- deletes it (B-b46z3). That account is always an owner, and can't leave or be removed.
CREATE TABLE members (
  project TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined TEXT NOT NULL,
  -- The owner whose link they joined by; null for the account that made the project.
  added_by TEXT,
  PRIMARY KEY (project, account)
);
CREATE INDEX members_account ON members (account);

-- Every project's owner is its first member, an owner, from the day the project was made.
INSERT INTO members (project, account, role, joined) SELECT id, owner, 'owner', created FROM projects;

-- A link an owner makes to add one person (B-jsady, "A link the owner sends"): good once, for seven days. Only the
-- SHA-256 of its secret is kept, as with every secret here, and no address: the owner sends the link however they like.
CREATE TABLE invites (
  hash TEXT PRIMARY KEY,
  project TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created TEXT NOT NULL,
  expires TEXT NOT NULL,
  used_by TEXT,
  used TEXT
);
CREATE INDEX invites_project ON invites (project);
