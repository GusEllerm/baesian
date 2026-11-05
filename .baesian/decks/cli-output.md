---
type: deck
format: 1
id: cli-output
title: What the command line prints
branch: v1/next
created: 2026-11-05T19:51:58.485Z
---

A UX pass over what the command line prints, asked for by the user on 2026-11-05. An audit ran every command in a scratch repo (59 captures) and proposed a small output system. These cards are the choices it raises.

Who reads the output shapes every card: agents run most commands through a pipe, and the text goes into their context; people run `init`, `login`, `ci`, `check`, `verify`, `list` and see the hooks at commit time. `--json` stays the machines' interface throughout.

Today's worst problems, from the audit: about 33 citations of Baesian's own decisions ("(B-4rwyz)", "(D42; … D144)") in output read outside this repo; next steps buried or missing (`init` never says what to commit; the duplicate error writes `attach <id>` without filling in the ID it knows); 59 lines over 120 characters; nothing at a glance tells success from failure; a wrong flag prints 68 lines of help; an unfilled card prints 25 lines of the validation library's messages.
