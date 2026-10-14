---
description: Turn an idea or feature request into a one-page spec with checkable acceptance criteria
argument-hint: <idea or feature>
---

Write or refine `docs/SPEC.md` for: $ARGUMENTS

First read the existing `docs/SPEC.md`, `AGENTS.md`, and the code areas the request touches, so the spec fits what exists. If the argument is empty, refine the current spec instead.

The spec must be one page and contain:
- **Problem and user** - who, what pain, one sentence each.
- **Outcome** - the single most important thing that must work.
- **Must-have** (3-7) and **Nice-to-have**; **Out of scope** (explicit).
- **Acceptance criteria** - numbered, each checkable by running or observing something (e.g. "POST /login with a wrong password returns 401 and no session cookie"). Avoid vague words like "nice", "fast", "intuitive" unless given a measure.
- **Constraints** - stack, performance, privacy, deadlines.
- **Assumptions** - every decision you made that the user did not state.
- **Open questions** - at most 3, ordered by risk.

Do not write code. When done, summarize assumptions and open questions in chat and suggest `/vibe-plan`.
