import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, kitVersion, runCmd, readText, compareVersions } from './util.mjs';

/** Run git inside the kit clone. Returns {ok, out}. */
export function git(args, { cwd = KIT_ROOT, timeout = 20000 } = {}) {
  const r = runCmd('git', args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: `${r.stdout || ''}`.trim(), err: `${r.stderr || ''}`.trim() };
}

export const isGitClone = (dir = KIT_ROOT) => fs.existsSync(path.join(dir, '.git'));

/**
 * Fetch and compare with the upstream branch.
 * @returns {{state: 'not-git'|'no-upstream'|'fetch-failed'|'up-to-date'|'behind'|'ahead'|'diverged', behind?: number, ahead?: number,
 *            current: string, latest?: string, commits?: string[], dirty?: boolean, detail?: string}}
 */
export function inspectUpdate({ cwd = KIT_ROOT, fetch = true } = {}) {
  const current = kitVersion();
  if (!isGitClone(cwd)) return { state: 'not-git', current };
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd });
  if (!upstream.ok) return { state: 'no-upstream', current, detail: upstream.err };
  if (fetch) {
    const f = git(['fetch', '--quiet'], { cwd, timeout: 30000 });
    if (!f.ok) return { state: 'fetch-failed', current, detail: f.err };
  }
  const counts = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], { cwd });
  if (!counts.ok) return { state: 'fetch-failed', current, detail: counts.err };
  const [ahead, behind] = counts.out.split(/\s+/).map(Number);
  const dirty = git(['status', '--porcelain'], { cwd }).out.length > 0;
  let latest = current;
  if (behind > 0) {
    const pkg = git(['show', '@{u}:package.json'], { cwd });
    try {
      latest = JSON.parse(pkg.out).version ?? current;
    } catch { /* keep current */ }
  }
  const commits = behind > 0 ? git(['log', '--oneline', '--no-decorate', '-n', '15', 'HEAD..@{u}'], { cwd }).out.split('\n').filter(Boolean) : [];
  const state = behind > 0 && ahead > 0 ? 'diverged' : behind > 0 ? 'behind' : ahead > 0 ? 'ahead' : 'up-to-date';
  return { state, behind, ahead, current, latest, commits, dirty };
}

/** The changelog text as it will be after the update (read from upstream when behind). */
export function upstreamChangelog({ cwd = KIT_ROOT } = {}) {
  const r = git(['show', '@{u}:CHANGELOG.md'], { cwd });
  return r.ok ? r.out : readText(path.join(cwd, 'CHANGELOG.md')) ?? '';
}

export const isNewer = (a, b) => compareVersions(a, b) > 0;
