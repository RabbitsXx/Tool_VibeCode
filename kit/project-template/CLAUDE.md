@AGENTS.md

## Claude Code specifics
- Slash commands from the Tool_VibeCode kit: `/vibe-spec`, `/vibe-plan`, `/vibe-build`, `/vibe-fix`, `/vibe-review`, `/vibe-ship`, `/vibe-handoff`, `/vibe-resume`.
- Delegate read-heavy investigation to subagents (`vibe-planner`, `vibe-reviewer`, `vibe-debugger`) to keep the main context small.
- Personal overrides go in `CLAUDE.local.md` (git-ignored), not here.
