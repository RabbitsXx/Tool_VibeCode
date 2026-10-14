---
description: Turn the spec into an architecture note and an ordered, checkable task list of thin slices
argument-hint: [focus or constraint]
---

Plan the work described in `docs/SPEC.md`. Extra focus: $ARGUMENTS

1. Read `docs/SPEC.md`, `AGENTS.md`, `docs/DECISIONS.md` and the existing code layout. For read-heavy exploration of a large codebase, delegate to the `vibe-planner` subagent.
2. Write `docs/PLAN.md`: chosen approach, main components and how they connect, data model, external services, and the risks/unknowns with how each will be tested early. Keep it short; skip sections that do not apply.
3. Write `docs/TASKS.md` as a checklist of **thin vertical slices**. Each task: `- [ ] <verb> <result> - done when <observable check>`. Order by risk (most uncertain first), and make the first task something that runs end to end, however small.
4. Record any non-obvious technical choice in `docs/DECISIONS.md` (context, decision, why).
5. Do not implement anything. End with the first three tasks and ask whether to proceed with `/vibe-build`.
