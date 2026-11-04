-- Deleting an account (M9f), as card B-b46z3 decided, "Closed for 14 days, then deleted": `closed` is when the account
-- was closed by its owner. While it's set, nothing signs in to it, nothing is relayed or counted for it, and signing in
-- with its passkey offers to restore it; 14 days after it, the service's daily job deletes the account and everything
-- under it (service/src/deletion.ts).
ALTER TABLE accounts ADD COLUMN closed TEXT;
