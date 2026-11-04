-- Web push (M9e step 2, D130, B-nk97q): each browser that turned notifications on, one per account and browser, kept with
-- the accounts (B-ytdt2). `endpoint` is where its push service takes messages for it; `p256dh` and `auth` are the keys a
-- message is encrypted to (RFC 8291). `name` is the browser's, as a sign-in's is ("Safari on an iPhone"), nothing about
-- where it is (B-7bq05). A push service answering 404 or 410 means the subscription is gone, and its row is deleted.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  name TEXT NOT NULL,
  created TEXT NOT NULL,
  last_sent TEXT
);
CREATE INDEX push_subscriptions_account ON push_subscriptions (account);
