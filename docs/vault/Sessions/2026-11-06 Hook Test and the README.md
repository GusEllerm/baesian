---
type: session
status: active
livedocs: snapshot
summary: "2026-11-06: v0.1.8 deployed; the plugin's hooks tested by hand in the VS Code extension (all three work); the README given the name's story, rewritten around the hosted client, then redesigned from three reviews with media remade from the real client and the details moved to docs/setup.md; the CLI's version set by the release commit."
created: 2026-11-06
tags: [baesian, session]
---

# 2026-11-06: the hook test, and the README

The lead agent with the user, continuing from [[2026-11-05 Merges After the Sweep]], with builder and review agents.

## What was done

- **v0.1.8 deployed** (the drawer and merge cards, the history scan, the checks that send agents back to file cards, seen cards). The plugin is read straight from this checkout, so refreshing it is `claude plugin marketplace update baesian` from a terminal (`/plugin` isn't available in the VS Code extension), then a new conversation.
- **The hooks, tested by hand in the VS Code extension** (B-qrdhh's last open check), by a fresh agent from a prompt the lead wrote. The reminder on a user-facing edit, the question tool refused once and let through on the retry, and the turn's end sending the agent back to file a card all worked; nothing hung. The extension labels a deny's reason "hook error"; the hook returns a normal deny. Found on the way: a missing deck's hint named `baesian deck <id>` without the `--title` it needs (fixed, with a test).
- **The name.** The vault didn't record why it's spelled Baesian; the user chose the dating story for the README. It went through two rewordings in chat before it was confirmed, each a seen card withdrawn and refiled (B-bvyfk, B-xrvqa, then B-3vchs); the user chose to keep withdrawing and refiling rather than revising an open seen card (B-fjbt5).
- **The README, rewritten** around the hosted client (B-k3451), with media remade from the real client by a builder: the demo GIF on today's client, Baesian's own branches as the branches figure, and a phone image. The demo's runs flooded the user's Mac with notifications (each seeded card raised one): the demo now files with `BAESIAN_OS_NOTIFY=0`, and its reviewer is "Robin", not the user's name.
- **The README, redesigned** after the user found it "not very nice to view": three reviewers (the rendered page; its content; about forty admired READMEs, Posting, VHS, uv and tldraw the closest) agreed on a centred wordmark and pitch, the GIF beside the phone, a pre-release note, a four-step "how it works", cropped and framed figures with captions, and setup in numbered steps with side paths folded. The user chose a front page with the details in `docs/setup.md` (B-3fgyc). A second builder made the wordmark (light and dark), a sharper 2x GIF, and framed, cropped figures. The page went from 7.5 screens to about 5 on a desktop.
- **Fixed:** an option's answer to the crux ran under its arrow-key hint on a narrow option (seen in the GIF).
- **The CLI's version:** it said 0.0.0 while the tags said v0.1.8. The release commit now sets `package.json`'s version, and the deploy refuses a tag that doesn't match (B-3femd); it's 0.1.9.

## Decisions

Cards answered: B-b1scf (the hook test's card), B-bvyfk and B-xrvqa (withdrawn), B-3vchs, B-fjbt5 (the alternative), B-k3451, B-3fgyc, B-3femd. Each is in `Decisions/`, and built where there was something to build.

## Worth remembering

- `gh api /markdown` with `mode=gfm` renders like a comment, turning every source newline into a break; a repo's README renders with `mode=markdown`. The renderer used for the reviews is in the session's scratchpad (`render.mjs`): GitHub's HTML in GitHub's stylesheet, at desktop and phone widths. GitHub's note boxes (`> [!NOTE]`) don't render through the API, only on the repo page.
- An open card can't take a revision; only a returned one can (B-fjbt5 kept it so).

## Next steps

Tag `v0.1.9`; the calibration fixes, if carded; real-device checks; then M10.
