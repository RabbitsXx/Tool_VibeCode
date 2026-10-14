---
description: Kick off a new project from a rough idea - brief, spec, stack choice and scaffold
argument-hint: <what you want to build>
---

Start a new project. The idea: $ARGUMENTS

1. If the idea is empty, ask for it in one sentence and stop.
2. Inspect the current directory. If it already holds a project, do not scaffold over it - say so and suggest `/vibe-resume` or `/vibe-spec` instead.
3. Write a short brief in chat: who it is for, the single main outcome, must-haves (3-7), out of scope, constraints. Ask at most 3 questions, and only the ones whose answer changes the result; for everything else choose a sensible default and list it under "Assumptions".
4. Pick the simplest stack that fits the brief and tools already installed on this machine (check versions with the shell, do not guess). Justify in two lines.
5. Create the project skeleton: `AGENTS.md` and `CLAUDE.md` (CLAUDE.md contains `@AGENTS.md`), `docs/SPEC.md`, `docs/PLAN.md`, `docs/TASKS.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md`, `.gitignore`, `.env.example`. If the `vibe` CLI from Tool_VibeCode is available, `vibe new <dir>` generates these; otherwise create them directly.
6. Fill `docs/SPEC.md` (with checkable acceptance criteria) and `docs/TASKS.md`. Write every task as `- [ ] <verb> <result> - done when <observable check>`, as thin vertical slices, riskiest first, so `/vibe-build` can verify each one. Also fill the Commands section of `AGENTS.md` with the real run/test commands; leave no `TODO` there.
7. `git init` if needed and make the first commit. Do not push or create remote repositories without asking.
8. Finish with: assumptions, the first task, and the exact command to run the project. Then wait for the user to say go (or continue with `/vibe-build`).
