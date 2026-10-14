import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, runCmd } from './util.mjs';

export function loadPresets() {
  return JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'kit', 'mcp', 'presets.json'), 'utf8')).presets;
}

/** Build the argv for `claude mcp add` for a preset. Native Windows needs `cmd /c` around npx. */
export function buildAddArgs(preset, { platform = process.platform, scope = 'user' } = {}) {
  const command = [...preset.command];
  const needsCmd = platform === 'win32' && ['npx', 'npm', 'pnpm', 'yarn'].includes(command[0]);
  const tail = needsCmd ? ['cmd', '/c', ...command] : command;
  return ['mcp', 'add', '--scope', scope, '--transport', 'stdio', preset.name, '--', ...tail];
}

export const render = (args) => ['claude', ...args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(' ');

export function applyPreset(preset, opts) {
  const args = buildAddArgs(preset, opts);
  const r = runCmd('claude', args, { timeout: 60000 });
  return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim(), command: render(args) };
}
