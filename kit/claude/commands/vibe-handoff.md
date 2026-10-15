---
description: Save the current state to docs/HANDOFF.md so the next session can resume without re-explaining
argument-hint: [anything specific to remember]
---

Write `docs/HANDOFF.md` (create `docs/` if needed), replacing the previous content. Extra notes to include: $ARGUMENTS

Base it on facts from this session and the repository (`git status`, `git log -5`, `docs/TASKS.md`), not on memory. Use exactly these sections, kept brief:

```
# Handoff - <date>
## Goal
<what we are building, one or two sentences>
## State
<what works now; branch; uncommitted changes>
## Done this session
## In progress
<exact point where work stopped, file names, what remains>
## Next steps
1. ... (ordered, concrete)
## Decisions in force
<every decision or constraint the user stated that must keep being honored, one line each, with the reason if given - e.g. "no npm packages", "case-insensitive", "key name freq">
## Gotchas
<traps, flaky tests, env quirks>
## How to run
<commands to install, run, test>
```

The "Decisions in force" section is the most important one: scan this whole conversation for choices, constraints and preferences the user stated (even in passing) and list all of them. A future session that does not know them will break them.

Also update `docs/TASKS.md` so checkboxes match reality. Do not include secrets. Finish by telling the user to start a fresh session and run `/vibe-resume`.
