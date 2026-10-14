---
description: Review the current changes (or a given branch/PR/path) for bugs, risks and scope creep
argument-hint: [branch, PR number, or path - default = uncommitted + unpushed changes]
---

Review: $ARGUMENTS (if empty, the working tree diff plus commits not yet on the upstream branch).

Gather the diff with git (`git diff`, `git diff --staged`, `git log @{u}..` or `gh pr diff <n>` as appropriate). For a large diff, delegate to the `vibe-reviewer` subagent and consolidate its findings.

Check, in priority order:
1. **Correctness** - logic errors, off-by-one, null/undefined, async/race issues, wrong error handling, broken edge cases.
2. **Security** - injection, missing authorization, secrets, unsafe deserialization, path traversal, XSS/CSRF, sensitive data in logs.
3. **Data safety** - destructive operations, migrations, irreversible changes.
4. **Tests** - are new behaviors and fixed bugs covered; were any tests weakened or deleted?
5. **Scope** - changes unrelated to the stated goal, new dependencies, leftover debug code.
6. **Maintainability** - only issues that will realistically cause problems; skip style nitpicks the linter handles.

Output a list ordered by severity. For each finding: file and line, what is wrong, a concrete failing scenario, and the suggested fix. Read the surrounding code before claiming a bug; mark anything you could not confirm as "unconfirmed". If nothing is wrong, say what you checked. Do not modify files unless the user asks you to apply fixes.
