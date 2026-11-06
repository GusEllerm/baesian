---
type: research
status: active
authority: reference
summary: "How to make agents file cards rather than decide silently or ask in chat (B-qrdhh). No product surveyed relies on instructions for what must happen every time: they check at the point of action. Claude Code and Codex can: a Stop hook reads the agent's last message and can send it back; a PreToolUse hook can refuse the question tool. Silent interface decisions have no event of their own: only a reminder on edits, a gate on paths, or a review of the diff sees them."
created: 2026-11-05
tags: [baesian, research]
---

# Holding agents to filing cards

Provenance: two research agents on 2026-11-05, at the user's request on B-qrdhh ("What is best practice for this type of integration"). One read Claude Code's and Codex's documentation; the other surveyed agent frameworks, decision-record practice and the research on instruction-following. Read-only. Claims are theirs, with their sources; where they marked a claim unverified, so does this note.

## The two misses

- **(a) A user-facing decision made silently in code.** The gate sees dependencies, schemas and migrations, CI and deploy files; it doesn't see interface changes.
- **(b) A choice put to the reviewer in chat** when they're in the conversation, so it skips the record, calibration and rules. On 2026-11-05 the user asked twice why a decision didn't go through Baesian, and the lead agent put an option's casing to them in chat (it became B-b0dzp).

## What the field does

- **Escalation by mechanism, where it must happen every time.** A developer marks an action, and it always asks: LangGraph's `interrupt()` ([docs](https://docs.langchain.com/oss/python/langgraph/human-in-the-loop)); the OpenAI Agents SDK's `needs_approval` per tool, and guardrails that halt a run ([docs](https://openai.github.io/openai-agents-python/human_in_the_loop)); Magentic-UI's always / maybe / never-irreversible labels, with a model judging the "maybe"s ([paper](https://arxiv.org/html/2507.22358v1)); GitHub Copilot's coding agent, whose pushes run no workflows until someone else approves ([docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/review-copilot-prs)); Cline's read-only plan mode; Cursor's hooks.
- **Escalation by instruction, for judgement.** Devin waits for plan approval "when it is unsure" ([post](https://cognition.com/blog/devin-2-1)). Kiro gates by workflow stage (partly verified).
- **Every mechanism keys on actions, not decisions.** Only plan-time steps catch decisions as such.
- **What vendors say.** Claude Code: instructions are advisory; "If you keep adding emphasis to a `CLAUDE.md` line and Claude still misses it, that's a sign the line belongs in a hook", and keep the enforced set small ([best practices](https://code.claude.com/docs/en/best-practices), [memory](https://code.claude.com/docs/en/memory.md)). Anthropic: approving every action "will create friction without necessarily producing safety benefits"; people accept 93% of permission prompts ([autonomy](https://www.anthropic.com/research/measuring-agent-autonomy), [auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)).
- **Miss (b) is trained behaviour.** In Anthropic's study of 500k sessions, 35% of Claude's own stops are "to present the user with a choice between proposed approaches" ([source](https://www.anthropic.com/research/measuring-agent-autonomy)).

## Decision records

ADRs (Nygard, 2011) and MADR's "considered options" are Baesian's ancestors. About half of GitHub repos using ADRs have only 1–5 ([study](https://research.jku.at/en/publications/using-architecture-decision-records-in-open-source-projects-an-ms/)). PR templates are rare and draw complaints of irrelevant requests ([paper](https://yuyue.github.io/res/paper/template-TSE2022.pdf)). Spotify backfills an ADR when review finds an undocumented decision: an audit after the fact catches the misses ([post](https://engineering.atspotify.com/2020/04/when-should-i-write-an-architecture-decision-record)). Danger.js, OPA/Conftest and fitness functions enforce in CI, as Baesian's gate does. No rigorous study of why the practice decays was found; practitioners blame friction.

## Instructions over a long session

Models use the start and end of a long context best ([lost in the middle](https://arxiv.org/abs/2307.03172)); instructions drift within eight rounds ([paper](https://arxiv.org/abs/2402.10962)); multi-turn conversation costs about 39%, mostly in reliability ([paper](https://arxiv.org/abs/2505.06120)); goal reminders bound the drift ([paper](https://arxiv.org/abs/2510.07777)); adherence falls as instructions multiply ([paper](https://arxiv.org/abs/2507.11538)); agents tend not to ask unless prompted ([paper](https://arxiv.org/abs/2502.13069)); and a rule said in conversation can be lost at compaction (Claude Code's docs). A trigger list read at session start is the weakest place for a rule; a reminder at the moment of the act is the strongest.

## Model judges

Anthropic's auto-mode classifier blocks 0.4% of benign actions and misses 17% of overeager ones; it is deliberately blind to the agent's prose ([source](https://www.anthropic.com/engineering/claude-code-auto-mode)). Judges agree with people about 80% of the time, with position and verbosity bias ([paper](https://arxiv.org/abs/2306.05685)). Models check explicit decisions in code well and implicit ones poorly ([paper](https://arxiv.org/abs/2602.07609)). So "this message asks the person to choose" is a narrow call a judge should get right; "this diff makes a user-facing decision" isn't: flag it, never block on it.

## What the harnesses offer

- **Claude Code** ([hooks](https://code.claude.com/docs/en/hooks.md)):
  - A **Stop** hook gets `last_assistant_message` and can block the turn's end with a reason, which the agent reads as its next instruction; `stop_hook_active` guards against loops, and after eight blocks in a row the turn ends anyway.
  - **Prompt hooks** (`type: "prompt"`) put a model's judgement on Stop, PreToolUse and others, returning `ok` or a reason (and `impossible` to let the turn end); one model call each time, with no published accuracy. A cheap pattern check first keeps the cost down.
  - **PreToolUse** can deny any tool in every permission mode, `AskUserQuestion` included, with a reason the agent reads; or add context without denying. Community reports say hooks on `AskUserQuestion` misbehave in places, the VS Code extension among them (unverified: test in a real session).
  - Plugin hooks fire whether or not the skill was used: "If a rule must hold every time… add it to the plugin as a hook rather than a skill" ([plugins](https://code.claude.com/docs/en/plugins/components.md)).
  - No event fires on a decision in code: a Stop hook can run a check over the turn's diff, or a PreToolUse hook on `Edit|Write` can add a reminder for paths that match.
- **Codex** ([hooks](https://learn.chatgpt.com/docs/hooks)): Stop with `last_assistant_message` and blocking, PreToolUse deny; no prompt hooks, no `ask`, hooks must be trusted before they run, and the docs call them "a useful guardrail, not a complete enforcement boundary".

## The layers, against the two misses

| Layer | (a) silent interface decision | (b) choice asked in chat | Cost |
|---|---|---|---|
| Instructions (AGENTS.md, skill) | weakly, and decays | weakly, against a trained habit | context; fades in long sessions |
| A reminder as the agent acts (PreToolUse on user-facing edits) | yes, as a nudge | — | near none; risk of nagging |
| Turn-end check (Stop: pattern, then a judge) | — | yes | a model call when the pattern fires |
| The question tool refused (PreToolUse on `AskUserQuestion`) | — | yes, for structured questions | none |
| The gate, on user-facing paths | yes, if the paths are declared | no | an ack on every such commit |
| A review of the diff at merge (D11's audit) | yes, as a sample | no | review time; feeds calibration |

## The agents' recommendations, ranked

1. Catch choices in chat where they happen: a Stop hook (pattern, then a judge) and the question tool's hook, sending the agent back once to file a card.
2. Remind at the moment of a user-facing edit, for paths the repo declares; never block.
3. If misses (a) continue, a gate detector for user-facing surfaces (routes, CLI flags and help, copy), cleared by an ack, with rules acking the repeats; its ack rate is its false-positive measure.
4. A merge-time review that sees only the diff and the cards, flagging unfiled decisions for the agent to card or ack; its hits measure how often (a) happens.
5. When the reviewer is in the conversation, the agent says "it's in your deck" rather than listing the options, which would unblind the card. Whether an answer already given in chat may be filed as a card marked not blind is its own question for the user (D32, calibration).

Put to the user as B-qrdhh r2.
