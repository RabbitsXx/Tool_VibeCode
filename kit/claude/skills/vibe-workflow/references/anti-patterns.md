# Anti-patterns that waste vibe-coding sessions

| Pattern | What it looks like | Do this instead |
|---|---|---|
| Fix loop | Same error, slightly different patch, 3+ times | Stop. Read the full error. State a hypothesis, test it with a tiny experiment (log, minimal repro). Change approach. |
| Big bang | One huge change touching many files, nothing runnable until the end | Thin vertical slice that runs after each step. |
| Guess and assert | "This should work" without running it | Run it. Report what actually happened. |
| Scope creep | Refactors, renames, new libraries nobody asked for | Note ideas in `docs/TASKS.md` under "Later"; do only what was asked. |
| Silent assumptions | Chose a stack/behavior without saying so | One line: "Assuming X because Y." The user can correct it early. |
| Test weakening | Editing or deleting a failing test to get green | Fix the code, or explain why the test is wrong and get agreement. |
| Dependency sprawl | Adding a package for 5 lines of code | Write the 5 lines. |
| Context rot | Very long session, contradictions, forgotten decisions | Write `docs/HANDOFF.md`, start a fresh session, `/vibe-resume`. |
| Placeholder shipping | lorem ipsum, TODO, fake data left in | Real content or an explicit, listed gap. |
| Secret leakage | Key pasted into code, chat, or commit | Env var + `.env.example`; rotate anything that leaked. |
| Rubber-stamp review | "Looks good" without reading the diff | Read the diff; run the code; list concrete findings or say none found and what was checked. |
