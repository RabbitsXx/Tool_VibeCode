import path from 'node:path';
import { claudeDir, readJson, compareVersions, runCmd } from './util.mjs';
import { status } from './installer.mjs';

const IS_WIN = process.platform === 'win32';

/** Run `cmd args` and return stdout (trimmed) or null when missing/failing. */
function run(cmd, args = ['--version']) {
  try {
    const r = runCmd(cmd, args, { timeout: 8000 });
    if (r.error || r.status !== 0) return null;
    return `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/)[0];
  } catch {
    return null;
  }
}

const version = (s) => s?.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null;

/** [id, label, level, command, args, minVersion, install hint] */
const TOOLS = [
  ['node', 'Node.js', 'required', 'node', ['--version'], '20.0.0', 'winget install OpenJS.NodeJS.LTS  |  brew install node'],
  ['git', 'Git', 'required', 'git', ['--version'], '2.30.0', 'winget install Git.Git  |  brew install git'],
  ['claude', 'Claude Code CLI', 'required', 'claude', ['--version'], null, 'npm install -g @anthropic-ai/claude-code'],
  ['gh', 'GitHub CLI', 'recommended', 'gh', ['--version'], '2.40.0', 'winget install GitHub.cli  |  brew install gh'],
  ['rg', 'ripgrep (fast search)', 'recommended', 'rg', ['--version'], null, 'winget install BurntSushi.ripgrep.MSVC  |  brew install ripgrep'],
  ['python', 'Python', 'recommended', IS_WIN ? 'python' : 'python3', ['--version'], '3.9.0', 'winget install Python.Python.3.13  |  brew install python'],
  ['jq', 'jq (JSON in shell)', 'optional', 'jq', ['--version'], null, 'winget install jqlang.jq  |  brew install jq'],
  ['code', 'VS Code', 'optional', 'code', ['--version'], null, 'winget install Microsoft.VisualStudioCode'],
];

export function checkTools() {
  return TOOLS.map(([id, label, level, cmd, args, min, hint]) => {
    const out = run(cmd, args);
    const v = version(out);
    let state = out ? 'ok' : 'missing';
    if (out && min && v && compareVersions(v, min) < 0) state = 'old';
    return { id, label, level, state, version: v, min, hint };
  });
}

export function checkGit() {
  const name = run('git', ['config', '--global', 'user.name']);
  const email = run('git', ['config', '--global', 'user.email']);
  return [
    { id: 'git-identity', label: 'git user.name / user.email', level: 'required',
      state: name && email ? 'ok' : 'missing',
      hint: 'git config --global user.name "Your Name"; git config --global user.email you@example.com' },
  ];
}

export function checkGh() {
  if (!run('gh')) return [];
  const ok = runCmd('gh', ['auth', 'status'], { timeout: 8000 }).status === 0;
  return [{ id: 'gh-auth', label: 'GitHub CLI logged in', level: 'recommended', state: ok ? 'ok' : 'missing', hint: 'gh auth login' }];
}

export function checkKit(dir) {
  const target = claudeDir(dir);
  const out = [];
  const s = status({ dir: target });
  if (!s.installed) {
    out.push({ id: 'kit', label: `Kit installed in ${target}`, level: 'required', state: 'missing', hint: 'node bin/vibe.mjs install' });
    return out;
  }
  const changed = s.files.filter((f) => f.state !== 'ok');
  out.push({ id: 'kit', label: `Kit v${s.installedVersion} installed`, level: 'required', state: 'ok' });
  if (s.installedVersion !== s.kitVersion) {
    out.push({ id: 'kit-version', label: `Kit update available (${s.installedVersion} -> ${s.kitVersion})`, level: 'recommended', state: 'old', hint: 'node bin/vibe.mjs update' });
  }
  if (changed.length) {
    out.push({ id: 'kit-files', label: `${changed.length} kit file(s) modified or missing`, level: 'recommended', state: 'old',
      hint: changed.slice(0, 3).map((f) => `${f.path} (${f.state})`).join(', ') + ' - run `vibe install --force` to restore' });
  }
  out.push({ id: 'kit-hooks', label: 'Guard hooks registered in settings.json', level: 'required', state: s.hooksRegistered ? 'ok' : 'missing', hint: 'node bin/vibe.mjs install' });
  out.push({ id: 'kit-memory', label: 'Managed block present in CLAUDE.md', level: 'recommended', state: s.claudeMdBlock ? 'ok' : 'missing', hint: 'node bin/vibe.mjs install' });
  try {
    readJson(path.join(target, 'settings.json'), {});
    out.push({ id: 'settings-json', label: 'settings.json is valid JSON', level: 'required', state: 'ok' });
  } catch (e) {
    out.push({ id: 'settings-json', label: 'settings.json is valid JSON', level: 'required', state: 'missing', hint: e.message });
  }
  return out;
}

export function doctor({ dir, network = true } = {}) {
  const checks = [...checkTools(), ...checkGit(), ...(network ? checkGh() : []), ...checkKit(dir)];
  const failing = checks.filter((c) => c.level === 'required' && c.state !== 'ok');
  return { ok: failing.length === 0, checks };
}

export function formatDoctor(report) {
  const mark = { ok: '[ OK ]', missing: '[MISS]', old: '[OLD ]' };
  const lines = [];
  for (const c of report.checks) {
    const v = c.version ? ` ${c.version}` : '';
    const tag = c.state === 'ok' ? '' : ` (${c.level})`;
    lines.push(`${mark[c.state]} ${c.label}${v}${tag}`);
    if (c.state !== 'ok' && c.hint) lines.push(`        -> ${c.hint}`);
  }
  const missing = report.checks.filter((c) => c.state !== 'ok');
  lines.push('', report.ok
    ? `Ready. ${missing.length ? `${missing.length} optional/recommended item(s) above can improve your setup.` : 'Everything checks out.'}`
    : 'Not ready: fix the required items above (run setup/bootstrap to install missing tools).');
  return lines.join('\n');
}
