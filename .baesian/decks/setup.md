---
type: deck
format: 1
id: setup
title: Setting up a repo with the hosted service
branch: v1/next
created: 2026-11-05T13:13:19.841Z
---

Linking this repo to baesian.dev on 2026-11-05 took: `baesian login --service https://baesian.dev`, approving the machine on the website, a commit carrying an ack trailer, an edit to `ci.yml`, two JSON lines gathered from two places into `BAESIAN_TRUST`, and a repo variable set before `main`'s next push. These four cards are the steps that need a decision to make easier, and one hole the work turned up in what CI accepts.

Done without cards: `baesian login` now says how many files the first sync sends, and ends with the link's commit ready to run.
