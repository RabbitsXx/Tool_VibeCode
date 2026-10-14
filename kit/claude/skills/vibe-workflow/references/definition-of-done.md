# Definition of done

A task is done only when every applicable line is true and you have seen the evidence yourself.

## Always
- [ ] The requested behavior works when exercised directly (run it, open it, call it).
- [ ] Existing tests/lint/typecheck/build pass; the exact commands and results are reported.
- [ ] New behavior with logic has a test (bug fixes: a test that failed before the fix).
- [ ] No leftover debug output, commented-out code, TODO placeholders or unused files you created.
- [ ] No secrets in code, config or logs; new variables are documented in `.env.example`.
- [ ] Diff reviewed: every changed line is needed for the task.
- [ ] `docs/TASKS.md` updated; anything unfinished is listed honestly.

## Web UI
- [ ] Works at phone (~375px), tablet and desktop widths; no horizontal scroll on mobile.
- [ ] Loading, empty, error and success states exist and look intentional.
- [ ] Keyboard reachable with visible focus; text contrast at least WCAG AA; images have alt text; form fields have labels.
- [ ] Real copy, not lorem ipsum.

## API / backend
- [ ] Success and failure responses checked; inputs validated at the boundary.
- [ ] Authorization checked for protected behavior; no data from one user visible to another.
- [ ] Errors do not leak internals; secrets and PII are not logged.

## Data / migrations
- [ ] Migration is reversible or has a stated rollback; run against a copy first.
- [ ] Destructive steps were confirmed with the user.

## Automation / scripts
- [ ] Ran on a representative input and an edge case; safe to re-run (idempotent) or clearly says it is not.
