import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { install, uninstall, status, manifestPath } from '../lib/installer.mjs';
import { mergeSettings, unmergeSettings, renderFragment, hasVibeHooks } from '../lib/settings.mjs';
import { upsertBlock, removeBlock, hasBlock } from '../lib/claudemd.mjs';
import { walk, KIT_ROOT } from '../lib/util.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-test-'));
}
const read = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8');
const readJ = (d, rel) => JSON.parse(read(d, rel));
const snapshot = (d) => Object.fromEntries(walk(d).filter((f) => !f.startsWith('backups/')).map((f) => [f, read(d, f)]));

const USER_SETTINGS = {
  model: 'sonnet',
  modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } },
  permissions: { allow: ['Bash(git push *)', 'Bash(my-tool *)'] },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk-rewrite' }] }],
  },
};
const USER_CLAUDE_MD = '@RTK.md\n\n# My own notes\nKeep answers short.\n';

function seed(dir) {
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(USER_SETTINGS, null, 2));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), USER_CLAUDE_MD);
}

test('install adds the kit and preserves everything the user already had', () => {
  const dir = tmpDir();
  seed(dir);
  const r = install({ dir });
  assert.ok(r.actions.some((a) => a.status === 'add' && a.path.startsWith('commands/vibe-')));

  const s = readJ(dir, 'settings.json');
  assert.equal(s.model, 'sonnet');
  assert.deepEqual(s.modelSettings, USER_SETTINGS.modelSettings);
  assert.ok(s.permissions.allow.includes('Bash(my-tool *)'));
  assert.ok(s.permissions.allow.includes('Bash(git status *)'));
  // user's own hook is still first and untouched
  assert.equal(s.hooks.PreToolUse[0].hooks[0].command, 'rtk-rewrite');
  assert.ok(hasVibeHooks(s));
  assert.ok(s.hooks.SessionStart);

  const md = read(dir, 'CLAUDE.md');
  assert.ok(md.startsWith('@RTK.md\n\n# My own notes\nKeep answers short.\n'));
  assert.ok(hasBlock(md));
  assert.ok(fs.existsSync(path.join(dir, 'vibe', 'hooks', 'guard-bash.mjs')));
  assert.ok(fs.existsSync(path.join(dir, 'agents', 'vibe-reviewer.md')));
  assert.ok(fs.existsSync(path.join(dir, 'skills', 'vibe-workflow', 'SKILL.md')));
  assert.ok(fs.existsSync(manifestPath(dir)));
});

test('user allow of "git push" is not reversed by the kit ask rule', () => {
  const dir = tmpDir();
  seed(dir);
  install({ dir });
  const s = readJ(dir, 'settings.json');
  assert.ok(!(s.permissions.ask ?? []).includes('Bash(git push *)'));
});

test('install is idempotent: second run changes nothing', () => {
  const dir = tmpDir();
  seed(dir);
  install({ dir });
  const before = snapshot(dir);
  const second = install({ dir });
  const changed = second.actions.filter((a) => !['unchanged', 'info'].includes(a.status));
  assert.deepEqual(changed, []);
  const after = snapshot(dir);
  // installedAt in the manifest is the only thing allowed to move
  delete before['vibe/manifest.json'];
  delete after['vibe/manifest.json'];
  assert.deepEqual(after, before);
});

test('dry run writes nothing', () => {
  const dir = tmpDir();
  seed(dir);
  const before = snapshot(dir);
  const r = install({ dir, dryRun: true });
  assert.ok(r.actions.length > 10);
  assert.deepEqual(snapshot(dir), before);
});

test('locally modified kit files are kept unless --force, and backed up when overwritten', () => {
  const dir = tmpDir();
  install({ dir });
  const file = path.join(dir, 'commands', 'vibe-fix.md');
  fs.writeFileSync(file, 'my custom version\n');

  const r1 = install({ dir });
  assert.equal(r1.actions.find((a) => a.path === 'commands/vibe-fix.md').status, 'skip');
  assert.equal(fs.readFileSync(file, 'utf8'), 'my custom version\n');

  const r2 = install({ dir, force: true });
  assert.equal(r2.actions.find((a) => a.path === 'commands/vibe-fix.md').status, 'overwrite');
  assert.notEqual(fs.readFileSync(file, 'utf8'), 'my custom version\n');
  const backed = walk(path.join(dir, 'backups')).filter((f) => f.endsWith('commands/vibe-fix.md'));
  assert.equal(backed.length, 1);
});

test('a pre-existing file with the same name that the kit does not own is not overwritten', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'commands'));
  fs.writeFileSync(path.join(dir, 'commands', 'vibe-plan.md'), 'someone elses\n');
  const r = install({ dir });
  assert.equal(r.actions.find((a) => a.path === 'commands/vibe-plan.md').status, 'skip');
  assert.equal(read(dir, 'commands/vibe-plan.md'), 'someone elses\n');
});

test('--skip leaves components out', () => {
  const dir = tmpDir();
  install({ dir, skip: ['hooks', 'settings', 'memory'] });
  assert.ok(!fs.existsSync(path.join(dir, 'vibe', 'hooks')));
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(dir, 'commands', 'vibe-plan.md')));
  // a later full install must not treat skipped files as stale or lose anything
  install({ dir });
  assert.ok(fs.existsSync(path.join(dir, 'vibe', 'hooks', 'guard-bash.mjs')));
});

test('skipping a component on a later run does not delete its files', () => {
  const dir = tmpDir();
  install({ dir });
  install({ dir, skip: ['hooks'] });
  assert.ok(fs.existsSync(path.join(dir, 'vibe', 'hooks', 'guard-bash.mjs')));
});

test('uninstall restores the original settings and CLAUDE.md and removes kit files', () => {
  const dir = tmpDir();
  seed(dir);
  install({ dir });
  uninstall({ dir });
  assert.deepEqual(readJ(dir, 'settings.json'), USER_SETTINGS);
  assert.equal(read(dir, 'CLAUDE.md'), USER_CLAUDE_MD);
  assert.ok(!fs.existsSync(path.join(dir, 'vibe')));
  assert.ok(!fs.existsSync(path.join(dir, 'commands')));
  assert.ok(!fs.existsSync(path.join(dir, 'agents')));
  assert.ok(!fs.existsSync(path.join(dir, 'skills')));
});

test('uninstall keeps files the user edited', () => {
  const dir = tmpDir();
  install({ dir });
  fs.writeFileSync(path.join(dir, 'commands', 'vibe-fix.md'), 'mine\n');
  const r = uninstall({ dir });
  assert.equal(r.actions.find((a) => a.path === 'commands/vibe-fix.md').status, 'keep');
  assert.equal(read(dir, 'commands/vibe-fix.md'), 'mine\n');
  assert.ok(!fs.existsSync(path.join(dir, 'commands', 'vibe-plan.md')));
});

test('status reports ok, modified and missing', () => {
  const dir = tmpDir();
  assert.equal(status({ dir }).installed, false);
  install({ dir });
  assert.equal(status({ dir }).upToDate, true);
  fs.writeFileSync(path.join(dir, 'commands', 'vibe-fix.md'), 'x');
  fs.rmSync(path.join(dir, 'commands', 'vibe-plan.md'));
  const s = status({ dir });
  assert.equal(s.upToDate, false);
  assert.equal(s.files.find((f) => f.path === 'commands/vibe-fix.md').state, 'modified');
  assert.equal(s.files.find((f) => f.path === 'commands/vibe-plan.md').state, 'missing');
});

test('install refuses to clobber an invalid settings.json', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ not json');
  assert.throws(() => install({ dir }), /Invalid JSON/);
  assert.equal(read(dir, 'settings.json'), '{ not json');
});

test('hook commands use forward slashes and the real hooks directory', () => {
  const dir = tmpDir();
  install({ dir });
  const cmds = Object.values(readJ(dir, 'settings.json').hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.equal(cmds.length, 4);
  for (const c of cmds) {
    assert.ok(!c.includes('\\'), c);
    assert.ok(c.includes('/vibe/hooks/'), c);
    const file = c.match(/"(.+)"/)[1];
    assert.ok(fs.existsSync(file), `hook script exists: ${file}`);
  }
});

test('registered hook commands really run from a config dir with spaces and Thai characters', () => {
  const dir = path.join(tmpDir(), 'โฟลเดอร์ ทดสอบ cfg');
  fs.mkdirSync(dir, { recursive: true });
  install({ dir });
  const settings = readJ(dir, 'settings.json');
  const byEvent = (event, i = 0) => settings.hooks[event][i].hooks[0].command;
  const run = (command, payload) => spawnSync(command, { shell: true, input: JSON.stringify(payload), encoding: 'utf8' });

  const denied = run(byEvent('PreToolUse', 0), { tool_name: 'Bash', tool_input: { command: 'git push --force' } });
  assert.equal(denied.status, 2, denied.stderr);
  assert.match(denied.stderr, /vibe-guard/);
  assert.equal(run(byEvent('PreToolUse', 0), { tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
  assert.equal(run(byEvent('PreToolUse', 1), { tool_name: 'Write', tool_input: { file_path: '/p/.env', content: 'A=1' } }).status, 2);
  for (const i of [0, 1]) {
    const r = run(byEvent('SessionStart', i), { cwd: dir, source: 'startup' });
    assert.equal(r.status, 0, r.stderr);
  }
});

test('mergeSettings / unmergeSettings are inverse on arbitrary user settings', () => {
  const fragment = renderFragment(JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'kit', 'claude', 'settings.fragment.json'), 'utf8')), '/h/vibe/hooks');
  const { settings, added } = mergeSettings(USER_SETTINGS, fragment);
  assert.deepEqual(unmergeSettings(settings, added), USER_SETTINGS);
  const again = mergeSettings(settings, fragment);
  assert.deepEqual(again.settings, settings);
  assert.deepEqual(again.added, { allow: [], ask: [], deny: [] });
});

test('CLAUDE.md block: upsert replaces in place, remove restores, CRLF preserved', () => {
  const once = upsertBlock('# Mine\n', 'body one');
  assert.ok(hasBlock(once));
  const twice = upsertBlock(once, 'body two');
  assert.equal((twice.match(/VIBE-KIT:BEGIN/g) ?? []).length, 1);
  assert.ok(twice.includes('body two') && !twice.includes('body one'));
  assert.equal(removeBlock(twice), '# Mine\n');
  const crlf = upsertBlock('# Mine\r\n', 'line a\nline b');
  assert.ok(!/[^\r]\n/.test(crlf), 'no bare LF in a CRLF file');
  assert.equal(upsertBlock(null, 'x').includes('VIBE-KIT:END'), true);
});
