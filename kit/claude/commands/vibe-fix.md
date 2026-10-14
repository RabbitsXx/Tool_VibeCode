---
description: Fix a bug properly - reproduce, find the root cause, minimal fix, regression test
argument-hint: <symptom, error message, or steps>
---

Fix this bug: $ARGUMENTS

1. **Reproduce** - get the failure to happen with a command, test or minimal steps. If you cannot reproduce it, say what you tried and ask for the missing detail (version, input, environment) instead of guessing.
2. **Locate** - read the full error/stack trace; trace from the symptom to the first place the data or state goes wrong. Check recent changes with `git log`/`git diff` when relevant. For a hard or unclear bug, delegate investigation to the `vibe-debugger` subagent.
3. **Explain** - state the root cause in one or two sentences before changing code.
4. **Fix** - the smallest change that removes the cause (not the symptom). No refactoring on the side.
5. **Prove** - add a regression test that fails without the fix and passes with it (if the project has tests); run the wider test suite and the original reproduction.
6. **Report** - root cause, the fix, evidence, and any related risk you noticed but did not change.

If the same approach fails twice, stop and re-derive from the evidence rather than trying variations.
