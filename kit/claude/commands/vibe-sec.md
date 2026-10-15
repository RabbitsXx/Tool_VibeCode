---
description: Security pass on the project or the current change - secrets, auth, input, dependencies
argument-hint: [scope: path, feature, or "all"]
---

Security review scope: $ARGUMENTS (default: the current change; "all" = the whole repository).

Delegate the deep read to the `vibe-security` subagent when the scope is large, then verify its top findings yourself.

Checklist:
1. **Secrets** - search tracked files and git history for keys/tokens/passwords (`git log -p -S` on suspicious strings); check `.gitignore` covers `.env*` and key files; `.env.example` holds placeholders only.
2. **AuthN/AuthZ** - every protected route/action checks identity and permission server-side; no trust in client-sent roles/IDs; no cross-user data access (IDOR).
3. **Input handling** - validation at boundaries; parameterized queries; output escaping; file upload and path handling; SSRF on any fetch of user-supplied URLs; command execution built from user input.
4. **Web** - XSS, CSRF protection, CORS not wildcard with credentials, secure/HttpOnly/SameSite cookies, security headers, open redirects.
5. **Dependencies** - run the ecosystem's audit (`npm audit`, `pip-audit`, etc.) if available; flag abandoned or typosquatted packages.
6. **Data and logging** - sensitive data not logged; errors do not leak internals; backups and PII handling.
7. **Config and deploy** - debug mode off in production, least-privilege tokens, no default credentials.

Report findings by severity with file/line, exploit scenario, and fix.

**Never write a secret's value in your report - not in a quote, a code block, a diff or an example.** This includes keys, tokens and passwords, even partly (no "first 8 characters"). Describe it as `<type> at <file>:<line>` (for example "AWS access key at config.js:2") and quote surrounding code only with the value replaced by `<redacted>`. Check your final answer for any secret-looking string before you send it. If a real secret is found, tell the user to rotate it - removing it from the code is not enough. Do not change code unless asked.
