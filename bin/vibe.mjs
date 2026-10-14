#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, kitVersion, claudeDir } from '../lib/util.mjs';
import { install, uninstall, status, COMPONENTS } from '../lib/installer.mjs';
import { doctor, formatDoctor } from '../lib/doctor.mjs';
import { scaffold } from '../lib/scaffold.mjs';
import { loadPresets, buildAddArgs, applyPreset, render } from '../lib/mcp.mjs';
import { verifyKit } from '../lib/verify.mjs';

const HELP = `vibe ${kitVersion()} - Tool_VibeCode: essential setup for vibe coding with Claude Code

Usage: node bin/vibe.mjs <command> [options]

Setup
  doctor [--json]            Check your machine and the kit install (tools, git identity, hooks)
  install [options]          Install/upgrade the kit into your Claude config (safe, idempotent, backs up first)
  update                     git pull (if this is a clone) then install
  status                     Show installed version and whether kit files were modified
  uninstall [--dry-run]      Remove everything the kit installed (your own files are never touched)

Projects
  new <dir> [--git] [--name <n>]   Create a project from the template (AGENTS.md, docs/, .gitignore, CI ...)
  mcp [name] [--apply]       List MCP presets, show or run the "claude mcp add" command

Kit
  verify                     Check the kit's own files for integrity (used by tests and CI)

Install options
  --dry-run                  Show what would change; write nothing
  --force                    Overwrite kit files you modified (a backup is kept)
  --skip <list>              Comma list of: ${COMPONENTS.join(', ')}
  --claude-dir <path>        Target config dir (default: $CLAUDE_CONFIG_DIR or ~/.claude)

Global: --help, --version
`;

function parse(argv) {
  const flags = {};
  const positional = [];
  const valued = new Set(['skip', 'claude-dir', 'name']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      if (valued.has(k)) flags[k] = inline ?? argv[++i];
      else flags[k] = inline ?? true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function printActions(result, { dryRun }) {
  const order = { add: 0, update: 1, overwrite: 2, remove: 3, skip: 4, keep: 5, info: 6, unchanged: 7, noop: 8 };
  const interesting = result.actions.filter((a) => a.status !== 'unchanged');
  const unchanged = result.actions.length - interesting.length;
  for (const a of interesting.sort((x, y) => order[x.status] - order[y.status])) {
    console.log(`  ${a.status.padEnd(9)} ${a.path}${a.note ? `  (${a.note})` : ''}`);
  }
  if (unchanged) console.log(`  ${unchanged} item(s) already up to date`);
  if (result.backupDir) console.log(`  backup of replaced files: ${result.backupDir}`);
  if (dryRun) console.log('  (dry run - nothing was written)');
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parse(rest);
  if (!cmd || cmd === 'help' || flags.help || cmd === '--help') return console.log(HELP);
  if (cmd === '--version' || cmd === 'version') return console.log(kitVersion());

  const dir = flags['claude-dir'];
  const skip = flags.skip ? String(flags.skip).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const unknown = skip.filter((s) => !COMPONENTS.includes(s));
  if (unknown.length) throw new Error(`Unknown component(s) for --skip: ${unknown.join(', ')} (valid: ${COMPONENTS.join(', ')})`);

  switch (cmd) {
    case 'doctor': {
      const report = doctor({ dir });
      console.log(flags.json ? JSON.stringify(report, null, 2) : formatDoctor(report));
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case 'install':
    case 'update': {
      if (cmd === 'update' && fs.existsSync(path.join(KIT_ROOT, '.git'))) {
        console.log('Updating kit from git...');
        const r = spawnSync('git', ['pull', '--ff-only'], { cwd: KIT_ROOT, stdio: 'inherit' });
        if (r.status !== 0) throw new Error('git pull failed; resolve it and run `update` again (nothing was installed).');
        // Re-run with the freshly pulled code so new files are picked up.
        const again = spawnSync(process.execPath, [path.join(KIT_ROOT, 'bin', 'vibe.mjs'), 'install', ...rest], { stdio: 'inherit' });
        process.exitCode = again.status ?? 1;
        return;
      }
      const dryRun = Boolean(flags['dry-run']);
      console.log(`${dryRun ? 'Would install' : 'Installing'} Tool_VibeCode ${kitVersion()} into ${claudeDir(dir)}`);
      const result = install({ dir, dryRun, force: Boolean(flags.force), skip });
      printActions(result, { dryRun });
      if (!dryRun) console.log('\nDone. Restart Claude Code (or start a new session) to load the new commands and hooks. Next: node bin/vibe.mjs doctor');
      return;
    }
    case 'uninstall': {
      const dryRun = Boolean(flags['dry-run']);
      const result = uninstall({ dir, dryRun });
      printActions(result, { dryRun });
      return;
    }
    case 'status': {
      const s = status({ dir });
      if (flags.json) return console.log(JSON.stringify(s, null, 2));
      if (!s.installed) return console.log(`Not installed in ${s.dir}. Run: node bin/vibe.mjs install`);
      console.log(`Installed v${s.installedVersion} in ${s.dir} (kit is v${s.kitVersion}) - ${s.upToDate ? 'up to date' : 'update available or files modified'}`);
      console.log(`  CLAUDE.md block: ${s.claudeMdBlock ? 'yes' : 'no'}   hooks registered: ${s.hooksRegistered ? 'yes' : 'no'}`);
      for (const f of s.files.filter((x) => x.state !== 'ok')) console.log(`  ${f.state.padEnd(9)} ${f.path}`);
      process.exitCode = s.upToDate ? 0 : 1;
      return;
    }
    case 'new': {
      if (!positional[0]) throw new Error('Usage: vibe new <dir> [--git] [--name <name>]');
      const r = scaffold({ dest: positional[0], name: flags.name, git: Boolean(flags.git), dryRun: Boolean(flags['dry-run']) });
      console.log(`Project template -> ${r.dest}`);
      for (const f of r.created) console.log(`  create    ${f}`);
      for (const f of r.skipped) console.log(`  exists    ${f}  (left untouched)`);
      console.log(`  git: ${r.git}`);
      console.log('\nNext: open the folder in Claude Code and run /vibe-start (new idea) or /vibe-spec.');
      return;
    }
    case 'mcp': {
      const presets = loadPresets();
      const [name] = positional;
      if (!name) {
        for (const p of presets) console.log(`${p.name.padEnd(12)} ${p.description}\n${''.padEnd(12)} ${render(buildAddArgs(p))}\n`);
        console.log('Run one:  node bin/vibe.mjs mcp <name> --apply');
        return;
      }
      const preset = presets.find((p) => p.name === name);
      if (!preset) throw new Error(`Unknown preset "${name}". Available: ${presets.map((p) => p.name).join(', ')}`);
      if (!flags.apply) {
        console.log(render(buildAddArgs(preset)));
        console.log(`\n${preset.usage}\n(add --apply to run it)`);
        return;
      }
      const r = applyPreset(preset);
      console.log(r.output || (r.ok ? 'Added.' : 'Failed.'));
      process.exitCode = r.ok ? 0 : 1;
      return;
    }
    case 'verify': {
      const problems = verifyKit();
      if (problems.length) {
        for (const p of problems) console.error(`  x ${p}`);
        console.error(`\n${problems.length} problem(s) found.`);
        process.exitCode = 1;
      } else console.log('Kit files are consistent.');
      return;
    }
    default:
      console.error(`Unknown command "${cmd}".\n`);
      console.error(HELP);
      process.exitCode = 2;
  }
}

try {
  main();
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
}
