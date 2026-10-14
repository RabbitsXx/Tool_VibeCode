---
name: vibe-workflow
description: The vibe-coding delivery loop (clarify, spec, plan, build in small slices, verify, hand off). Use when starting a new app/feature, continuing a multi-step build, or when the user asks to "build", "make", "add" or "continue" something non-trivial. Not needed for one-line fixes or pure questions.
---

# Vibe workflow

A repeatable loop that keeps AI-driven building on track and resumable.

## The loop

1. **Clarify** - restate the goal in one or two sentences. Ask a question only if the answer changes the result; otherwise pick a default and say so. Identify the user (who uses it), the single main outcome, and hard constraints (stack, deadline, must-not).
2. **Spec** (`docs/SPEC.md`) - problem, users, must-have features, out of scope, acceptance criteria that can be checked by running something. Keep it to one page.
3. **Plan** (`docs/PLAN.md`, `docs/TASKS.md`) - choose the simplest stack that fits the user's existing tools. Break work into thin vertical slices; each slice produces something runnable. Order by risk: do the riskiest or most uncertain slice early.
4. **Build** - one slice at a time. Read before editing, change the minimum, run it. Commit after each green slice with a clear message.
5. **Verify** - run tests/lint/build, then use the thing the way a user would (open the page, call the endpoint, run the CLI). See `references/definition-of-done.md`.
6. **Hand off** - update `docs/TASKS.md`, write `docs/HANDOFF.md` (done, in progress, next, gotchas, how to run). The next session starts from the file, not from memory.

## Rules of thumb

- A slice that cannot be demonstrated is too big or too abstract. Split it.
- When stuck for more than two attempts, stop and change approach: re-read the error, form a hypothesis, check it with a small experiment. Do not repeat the same fix. See `references/anti-patterns.md`.
- When the context is getting long or the conversation has drifted, write the handoff and suggest a fresh session rather than pushing on.
- Prefer boring, well-known tools over novel ones. Every new dependency needs a reason.
- Record non-obvious choices in `docs/DECISIONS.md` (one short entry: context, decision, why).

## Related commands and agents

Commands: `/vibe-start`, `/vibe-spec`, `/vibe-plan`, `/vibe-build`, `/vibe-fix`, `/vibe-ui`, `/vibe-review`, `/vibe-test`, `/vibe-sec`, `/vibe-clean`, `/vibe-ship`, `/vibe-handoff`, `/vibe-resume`.
Subagents (delegate read-heavy or independent work): `vibe-planner`, `vibe-reviewer`, `vibe-debugger`, `vibe-test-writer`, `vibe-security`, `vibe-ui-reviewer`, `vibe-researcher`.
