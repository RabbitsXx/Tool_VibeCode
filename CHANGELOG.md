# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

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
