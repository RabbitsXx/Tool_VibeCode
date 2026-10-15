---
description: Pick up where the last session stopped - read handoff, tasks and git state, then propose the next step
argument-hint: [optional direction]
---

Resume work on this project. Direction from the user (may be empty): $ARGUMENTS

1. Read `docs/HANDOFF.md`, `docs/TASKS.md`, `AGENTS.md`/`CLAUDE.md`, and `docs/SPEC.md` if present. If none exist, say the project has no saved state and suggest `/vibe-start` (new) or `/vibe-explain project` (existing code).
2. Check reality against the notes: `git status`, `git log -5 --oneline`, current branch. Note any mismatch (uncommitted work not mentioned, tasks ticked but code missing).
3. Quickly confirm the project still runs: run the test or build command if it is fast. Report the result.
4. Summarize briefly: goal, where we are, what is broken or risky, and the single best next task. Add a final line "Decisions in force:" repeating every item from the handoff's "Decisions in force" section (and any decision recorded in `docs/DECISIONS.md` or `AGENTS.md` that bears on the next task), so none of them is lost between sessions.
5. Wait for a go-ahead, or continue with `/vibe-build` if the user's direction already says what to do. Do not start large changes without confirmation.
