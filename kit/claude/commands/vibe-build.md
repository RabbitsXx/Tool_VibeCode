---
description: Implement the next task(s) from docs/TASKS.md in small verified slices
argument-hint: [task name or number, default = next open task]
---

Implement: $ARGUMENTS (if empty, the first open `- [ ]` task in `docs/TASKS.md`).

For each task:
1. Read `docs/SPEC.md` acceptance criteria for it and the files you will touch. Search for existing helpers before writing new ones.
2. State the plan in two or three lines.
3. Make the smallest complete change. Match existing style. No unrelated edits, no new dependencies unless required (then say why).
4. Verify: run the project's tests/lint/typecheck/build that exist, then exercise the feature the way a user would. For logic with branches, add or extend tests.
5. If verification fails, find the root cause; do not weaken tests. After two failed attempts at the same problem, stop, explain what you learned, and change approach (see the `vibe-workflow` skill's anti-patterns).
6. Tick the task in `docs/TASKS.md`, and commit with a clear message (do not push).

Stop after the requested task, or after three tasks if none was named. Finish with: what changed, evidence it works (commands and results), anything left, and the suggested next task.
