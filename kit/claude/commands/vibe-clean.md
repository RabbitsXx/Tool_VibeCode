---
description: Simplify and tidy code without changing behavior (dead code, duplication, naming)
argument-hint: <file, folder or area>
---

Clean up: $ARGUMENTS

Rules: behavior must not change; every step is verified; do it in small commits.

1. Make sure tests exist for the area, or characterize current behavior first (run it, record outputs). If neither is possible, say so and keep changes trivially safe.
2. Find: dead code and unused exports/imports, duplicated logic that has a clear shared shape (three similar cases, not two), needlessly complex conditionals, unclear names, oversized functions that mix concerns, stale comments.
3. Apply the simplest improvements that clearly help a future reader. Do not introduce new abstractions or patterns for their own sake, change public APIs, or reformat untouched code.
4. After each change run the tests/lint/typecheck. If anything changes behavior, revert that step.
5. Report what was simplified, what you deliberately left alone, and any larger refactor worth proposing separately.
