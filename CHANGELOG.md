# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [2.1.0] - 2026-10-15

### Added
- `scripts/e2e.mjs`: end-to-end test with a real Claude Code and a real model. It builds a small project with the 13 workflow commands (start, plan, build, fix, ui, review, sec, test, explain, brief, handoff, resume, ship), seeds a real bug for `/vibe-fix`, and checks every step from files, tests and git instead of the model's own claims. Costs real usage; not part of `npm test`. Results and method: `docs/E2E.md`.

### Changed
- `/vibe-start` now scaffolds from the kit template (`node ~/.claude/vibe/launch.mjs new . --git`) instead of improvising a structure, requires an `## Assumptions` section in `docs/SPEC.md`, writes tasks as `- [ ] ... - done when ...`, and must fill the `AGENTS.md` placeholders. Found by the E2E run: two of three models had left assumptions out of the spec.
- `/vibe-test` has an explicit rule for production code: untouched by default; only a minimal fix for a real bug a new test exposes, kept as the regression test and disclosed up front in the answer. Found by the E2E run: a model fixed a real `reset()` bug and the command had no policy for that.

## [2.0.0] - 2026-10-14

### Added
- **Update system.** `vibe update` (pull, re-install, show what changed; `--check` and `--dry-run` change nothing) and `/vibe-update` inside Claude Code. A SessionStart hook announces a newer version at most once per 24h (`VIBE_NO_UPDATE_CHECK=1` opts out). After an update the changelog entries since your old version are printed.
- `vibe backups` and `vibe restore [name]` (a restore backs up what it replaces, so it can be undone).
- `vibe doctor --updates` reports whether a newer kit version exists.
- `scripts/release.mjs`: verify, test, bump, move `[Unreleased]` under the new version, commit, tag (pushes only with `--push`).
- Installer records the kit folder and writes `~/.claude/vibe/launch.mjs`, so Claude Code can run the kit CLI from anywhere.
- `vibe status` shows the kit folder and warns when it has moved.

### Changed
- **Guards rewritten around real command structure.** Quotes, `;` `&&` `||` `|`, `$(...)`, backticks, heredocs, `bash -c`, `powershell -Command/-EncodedCommand`, `cmd /c`, `eval` and `sudo/env/nohup/timeout` prefixes are understood, so text that only *mentions* a dangerous command (commit messages, `echo`, heredoc bodies) no longer triggers and quoting tricks no longer hide one (`git push "--force"`, `bash -c "rm -rf /"`).
- **Two tiers.** `deny` for catastrophic actions (rm of root/home/drive, force-push, disk formatting, ...). `ask` for risky-but-sometimes-legitimate ones (pipe a download into a shell, `--no-verify`, DROP/TRUNCATE, edits to `.claude/settings*.json`, `.mcp.json`, CI workflows): you get a permission prompt instead of having to restart with `VIBE_GUARD_OFF=1`.
- `guard-write` also protects credential files (`.netrc`, `~/.ssh`, `~/.aws`) and the kit's own files under `~/.claude/vibe/`.
- Upgrades retire permission rules and files that a previous kit version added and the new version dropped.
- `curl ... | node -e '...'` and similar (data piped into an inline script) are no longer treated as "running a download".

### Fixed
- `sudo -u root ...` / `sudo -E ...` / `env -i ...` option handling in the guard prefix stripping.
- Verified against 627 real commands and 172 real file writes from past sessions: no false denies.

## [1.0.0] - 2026-10-14

### Added
- `vibe` CLI: `doctor`, `install`, `update`, `status`, `uninstall`, `new`, `mcp`, `verify`.
- Safe, idempotent installer: merges `settings.json` (permissions + hooks) and a managed block in `CLAUDE.md`, tracks installed files by SHA-256, never overwrites user-modified files without `--force`, backs up before every change, and uninstalls back to the original bytes.
- 15 slash commands (`/vibe-start`, `-spec`, `-plan`, `-build`, `-fix`, `-ui`, `-review`, `-test`, `-sec`, `-clean`, `-explain`, `-brief`, `-ship`, `-handoff`, `-resume`).
- 7 subagents (`vibe-planner`, `-reviewer`, `-debugger`, `-test-writer`, `-security`, `-ui-reviewer`, `-researcher`) and the `vibe-workflow` skill with a definition of done and anti-patterns.
- Guard hooks: dangerous-command blocker (Bash and PowerShell), protected-file and secret-in-content blocker, SessionStart project-state loader. All fail-open; `VIBE_GUARD_OFF=1` disables.
- Project template (`AGENTS.md`, `CLAUDE.md`, `docs/`, `.gitignore`, `.env.example`, PR template, CI) and Thai prompt library.
- MCP presets (context7, playwright) with Windows `cmd /c` handling.
- Windows (`bootstrap.ps1`) and macOS/Linux (`bootstrap.sh`) machine setup with dry-run.
- 34 automated tests and a `verify` command, both run in CI.
