---
description: Kick off a new project from a rough idea - brief, spec, stack choice and scaffold
argument-hint: <what you want to build>
---

Start a new project. The idea: $ARGUMENTS

1. If the idea is empty, ask for it in one sentence and stop.
2. Inspect the current directory. If it already holds a project, do not scaffold over it - say so and suggest `/vibe-resume` or `/vibe-spec` instead.
3. Write a short brief in chat: who it is for, the single main outcome, must-haves (3-7), out of scope, constraints. Ask at most 3 questions, and only the ones whose answer changes the result; for everything else choose a sensible default and list it under "Assumptions".
4. Pick the simplest stack that fits the brief and tools already installed on this machine (check versions with the shell, do not guess). Justify in two lines.
5. Create the project skeleton from the kit's template: run `node ~/.claude/vibe/launch.mjs new . --git` (use `$CLAUDE_CONFIG_DIR/vibe/launch.mjs` when that variable is set). It adds `AGENTS.md`, `CLAUDE.md` (imports `@AGENTS.md`), `docs/{SPEC,PLAN,TASKS,DECISIONS,HANDOFF}.md`, `.gitignore`, `.env.example`, a PR template and CI, and never overwrites an existing file. Only if that launcher does not exist, create those files yourself with the same names.
6. Fill in the template files instead of inventing a different structure:
   - `docs/SPEC.md`: keep its headings. Put checkable acceptance criteria under "Acceptance criteria" and **every default you chose on the user's behalf under "Assumptions"** (the user reads that section first).
   - `docs/TASKS.md`: write every task as `- [ ] <verb> <result> - done when <observable check>`, as thin vertical slices, riskiest first, so `/vibe-build` can verify each one.
   - `AGENTS.md`: replace the `TODO` placeholders in "What this project is", "Commands" and "Where things are" with the real run/test commands and paths; leave no `TODO` there.
   - `docs/DECISIONS.md`: record the stack choice and why.
7. `git init` if needed and make the first commit. Do not push or create remote repositories without asking.
8. Finish with: assumptions, the first task, and the exact command to run the project. Then wait for the user to say go (or continue with `/vibe-build`).
