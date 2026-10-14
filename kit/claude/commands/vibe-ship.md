---
description: Pre-release checklist - tests, build, secrets, docs, changelog, commit (never pushes on its own)
argument-hint: [target: version or environment]
---

Prepare to ship: $ARGUMENTS

Run these in order and report each as PASS / FAIL / SKIPPED (with the reason) - never mark something PASS that you did not run:
1. **Working tree** - `git status`: unexpected files, debug leftovers, large files, stray `.env`.
2. **Quality gates** - the project's lint, typecheck, tests and production build. Fix failures at the root cause.
3. **Secrets** - scan the diff and tracked files for keys/tokens; confirm `.env.example` is current and no real values are committed.
4. **Dependencies** - audit command for the ecosystem if available; lockfile committed and in sync.
5. **Smoke test** - run the built artifact or start the app and exercise the main flow from `docs/SPEC.md`.
6. **Docs** - README run/deploy instructions are accurate; `CHANGELOG.md` has an entry; `docs/TASKS.md` reflects reality.
7. **Commit** - propose a clear commit message (and tag name if a version was given).

Stop and summarize. Do NOT push, tag remotely, publish, deploy or create releases unless the user explicitly says to in this conversation - list the exact commands you would run and ask.
