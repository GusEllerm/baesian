---
type: session
status: active
livedocs: snapshot
summary: "2026-11-10: M10's service steps 3, 4 and 6 built by a builder agent on its worktree branch: numbered migrations as a project's object wakes (B-866d2); formats and hook blocks rolled out a release late, the CLI's release on every request and the relay refusing one too old (B-4p43b, B-4kj4d, B-amxkp); a spare service key published at /v1/keys and pinned by baesian ci, with the script the user runs to make it (B-x47ek). Not merged into v1/next."
created: 2026-11-10
tags: [baesian, session]
---

# 2026-11-10: M10's service steps 3, 4 and 6

A builder agent, sent by the lead, on `worktree-agent-acca78dbafad9f1af`: v1/next fast-forwarded in, then the practice cards' branch, then v1/next again once the practice cards had merged there (with the blind test's guess as an entry of its own, B-9prve). Nothing merged into v1/next or pushed.

## What was done

- **Step 3, B-866d2 ("Numbered migrations, on wake"):** `migrateObject()` and `OBJECT_MIGRATIONS` in `service/src/object-migrations.ts`; the schema version in each project's meta table (`schema`); migration 1 is every table 0.1.x made, as it made them, and the practice table. A test wakes a project made with 0.1.10's own statements and checks every row comes through. Found on the way: after an erase, a request that read the version before the relay brought the tables back failed; `ProjectRelay.run` now asks for the relay first.
- **Step 4, B-4p43b ("Old one for a release"), with B-4kj4d and B-h0vyy:** `LaterFormat`, `writtenFormat()`, `asWritten()` and `minimumRelease()` in src/schema.ts, every writer through `asWritten()`; `VERSION` in src/version.ts, set by `npm version` (scripts/set-version.mjs); the header `baesian-version` on every request to the service; `tooOld()` in the relay, 426 naming the release to install. Tested with a made-up kind.
- **B-amxkp ("The old block for a release"):** `CHANGED_BLOCKS` and `writtenBlock()` in src/hookblock.ts, which `baesian init` writes; tested with a made-up block.
- **Step 6, B-x47ek ("Pin a spare key now"):** `service/scripts/spare-key.mjs`; `spareKey()` and `keysReply()`, `GET /v1/keys`; `spareKeys()` and `ciPin()` in the CLI; the relay trusting earlier keys after a switch (`Relay.root`). A rehearsal signs with the spare and verifies. The key itself isn't made: the user makes it.
- **Notes:** [[service]], [[src-sync]], [[src-gate]], [[File Formats]], [[Release v1]], the [[Decision Log]].

## Decisions

The agent's, two-way doors, in the [[Decision Log]] (2026-11-10, "M10's service steps 3, 4 and 6, as built"): the header's name and 426; the minimum computed, never before 1.0.0, so 0.1.x CLIs are refused from 1.0.0's deploy; the release in src/version.ts; the schema key; a newer schema refused; the spare at `/v1/keys`, not in projects' `trust/`, with the relay trusting earlier keys. No card filed.

## Next

- The user makes the spare key (`node service/scripts/spare-key.mjs ~/baesian-spare-key.pem`), keeps the private file offline, and puts the three variables it prints in `service/wrangler.jsonc`'s `vars`.
- The lead merges this branch into v1/next. On 1.0.0's deploy every 0.1.x CLI is told to install 1.0.0: upgrade the CLI on each machine right after the hand publish.
- Revoking an old service key isn't built: the relay writes no revocation file.
