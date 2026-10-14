---
description: Add or repair tests for a feature or file, and run the suite
argument-hint: <feature, file or function>
---

Testing target: $ARGUMENTS

1. Detect the project's test framework and conventions (config files, existing tests, how they are run). Follow them; do not introduce a second framework. If there is no test setup, propose the lightest standard one for the stack and ask before installing.
2. Read the code under test. List the behaviors that matter: happy path, boundary values, invalid input, error paths, and any past bug.
3. Write focused tests that assert behavior, not implementation details. Prefer real objects over mocks; mock only at process boundaries (network, clock, filesystem when needed). Each test should fail for exactly one reason. For a large area, delegate drafting to the `vibe-test-writer` subagent.
4. Run the new tests, then the full suite. Make sure a new test actually fails when the behavior is broken (temporarily break the code or reason through it explicitly).
5. Never delete or loosen an existing test just to pass. If a test is wrong, explain why and fix it deliberately.
6. Report: tests added, commands run, results, and coverage gaps you left.
