#!/usr/bin/env node
// SessionStart hook: if the project follows the vibe layout, give Claude the current state
// (branch, uncommitted changes, last handoff, open tasks) so a fresh session can resume without re-explaining.
// Prints nothing for projects without those files. Plain stdout is added to context. Always exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAX_HANDOFF = 3000;
const MAX_TASKS = 25;

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Pure: build the context text for a project directory ('' when nothing relevant exists). */
export function buildContext(cwd) {
  const handoff = read(path.join(cwd, 'docs', 'HANDOFF.md'));
  const tasks = read(path.join(cwd, 'docs', 'TASKS.md'));
  if (!handoff && !tasks) return '';
  const hasHandoff = Boolean(handoff?.trim()) && !/^Not started yet\.?\s*$/m.test(handoff);
  const openTasks = (tasks ?? '').split(/\r?\n/).filter((l) => /^\s*[-*]\s+\[ \]/.test(l));
  if (!hasHandoff && !openTasks.length) return '';

  const lines = ['Project state at session start (read from the repository, may be stale):'];
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch) {
    const dirty = (git(cwd, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean).length;
    lines.push(`- Git branch: ${branch}; uncommitted changes: ${dirty} file(s).`);
  }
  // The untouched template says "Not started yet." - that is noise, not state.
  if (hasHandoff) lines.push('', '## docs/HANDOFF.md', handoff.trim().slice(0, MAX_HANDOFF));
  if (openTasks.length) {
    lines.push('', `## Open tasks in docs/TASKS.md (${openTasks.length})`, ...openTasks.slice(0, MAX_TASKS));
    if (openTasks.length > MAX_TASKS) lines.push(`... and ${openTasks.length - MAX_TASKS} more`);
  }
  return lines.join('\n');
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let cwd = process.cwd();
  try {
    cwd = JSON.parse(raw)?.cwd || cwd;
  } catch { /* use process.cwd() */ }
  const out = buildContext(cwd);
  if (out) process.stdout.write(out + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {}).finally(() => process.exit(0));
}
