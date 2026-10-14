---
description: Turn a rough request into a precise one-shot brief (outcome, scope, acceptance, verification)
argument-hint: <rough request>
---

Rewrite this rough request as a brief that an AI agent can execute in one pass: $ARGUMENTS

Inspect the project first (stack, conventions, related files) so the brief uses real names and paths. Then output, ready to copy:

```
GOAL: <one sentence outcome, in terms of what the user will see or be able to do>
CONTEXT: <relevant files, existing patterns to follow, stack and versions>
SCOPE: <what to change> / OUT OF SCOPE: <what not to touch>
CONSTRAINTS: <must / must not; compatibility, performance, style, no new deps...>
ACCEPTANCE: <numbered, each checkable by running or observing something>
VERIFY: <exact commands and manual checks to run before claiming done>
ASSUMPTIONS: <decisions made on the user's behalf, to be confirmed>
```

Rules: keep it under ~25 lines; replace every vague word ("nice", "fast", "clean") with something measurable or drop it; ask at most 2 questions, only if the answer changes the work. If the user wanted the prompt only, stop after the brief; if they want it done, ask "run this brief now?".
