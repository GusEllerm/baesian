-- A project's name (B-zqkwk): typed by its owner when approving its first machine, and changed on the website. The
-- service never learns a repo's own name: the CLI sends only the project's random ID and the machine's name. Notifications
-- (M9e step 2) read it from here.
ALTER TABLE projects ADD COLUMN name TEXT;
