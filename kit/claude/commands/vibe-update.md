---
description: Update the Tool_VibeCode kit (commands, agents, guards) to the latest version and show what changed
argument-hint: [--check | --dry-run]
---

Update the user's Tool_VibeCode kit. Options from the user (may be empty): $ARGUMENTS

The kit's launcher lives in the Claude config directory (`~/.claude`, or `$CLAUDE_CONFIG_DIR` when that is set). Run exactly one of these, in the shell tool that matches your session:

- `--check` or `--dry-run` given: `node ~/.claude/vibe/launch.mjs update $ARGUMENTS`
- otherwise: `node ~/.claude/vibe/launch.mjs update`

If the launcher file does not exist, the kit is not installed from a clone on this machine: tell the user to run `node bin/vibe.mjs install` from their Tool_VibeCode folder and stop.

After it finishes:
1. Report the result in the user's language: old version -> new version, and the "what's new" entries it printed. Do not invent changes that were not printed.
2. If it says files were skipped because the user modified them, list them and explain `--force` (it overwrites after making a backup) - do not run `--force` yourself.
3. If the update changed anything, tell the user to restart Claude Code so new commands, agents and hooks load.
4. If it failed (offline, local changes in the kit folder, diverged history), show the exact error and the one command the user should run to fix it. Do not try to repair the kit folder's git state yourself.

Do not edit any file under `~/.claude/vibe/` by hand.
