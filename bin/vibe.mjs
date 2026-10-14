#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, kitVersion, claudeDir, readText, runCmd } from '../lib/util.mjs';
import { install, uninstall, status, listBackups, restoreBackup, COMPONENTS } from '../lib/installer.mjs';
import { doctor, formatDoctor } from '../lib/doctor.mjs';
import { scaffold } from '../lib/scaffold.mjs';
import { loadPresets, buildAddArgs, applyPreset, render } from '../lib/mcp.mjs';
import { verifyKit } from '../lib/verify.mjs';
import { inspectUpdate, upstreamChangelog } from '../lib/update.mjs';
import { entriesSince, formatEntries } from '../lib/changelog.mjs';

const HELP = `vibe ${kitVersion()} - Tool_VibeCode: essential setup for vibe coding with Claude Code

Usage: node bin/vibe.mjs <command> [options]

Setup
  doctor [--json] [--updates]  Check your machine and the kit install (tools, git identity, hooks)
  install [options]            Install/upgrade the kit into your Claude config (safe, idempotent, backs up first)
  update [--check] [--dry-run] Pull the latest kit from git, re-install, and show what changed
  status [--json]              Installed version, modified files, update state of the install
  uninstall [--dry-run]        Remove everything the kit installed (your own files are never touched)
  backups                      List the automatic backups
  restore [name] [--dry-run]   Put files from a backup back (default: latest); the current files are backed up first

Projects
  new <dir> [--git] [--name <n>]   Create a project from the template (AGENTS.md, docs/, .gitignore, CI ...)
  mcp [name] [--apply]         List MCP presets, show or run the "claude mcp add" command

Kit
  verify                       Check the kit's own files for integrity (used by tests and CI)

Install options
  --dry-run                    Show what would change; write nothing
  --force                      Overwrite kit files you modified (a backup is kept)
  --skip <list>                Comma list of: ${COMPONENTS.join(', ')}
  --claude-dir <path>          Target config dir (default: $CLAUDE_CONFIG_DIR or ~/.claude)

Inside Claude Code: /vibe-update runs "update" for you.
Global: --help, --version
`;

function parse(argv) {
  const flags = {};
  const positional = [];
  const valued = new Set(['skip', 'claude-dir', 'name', 'since']);
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
  const order = { add: 0, update: 1, restore: 1, overwrite: 2, remove: 3, skip: 4, keep: 5, info: 6, unchanged: 7, noop: 8 };
  const interesting = result.actions.filter((a) => a.status !== 'unchanged');
  const unchanged = result.actions.length - interesting.length;
  for (const a of interesting.sort((x, y) => order[x.status] - order[y.status])) {
    console.log(`  ${a.status.padEnd(9)} ${a.path}${a.note ? `  (${a.note})` : ''}`);
  }
  if (unchanged) console.log(`  ${unchanged} item(s) already up to date`);
  if (result.backupDir) console.log(`  backup of replaced files: ${result.backupDir}`);
  if (dryRun) console.log('  (dry run - nothing was written)');
}

function printWhatsNew(since, upTo) {
  const text = upTo ? upstreamChangelog() : readText(path.join(KIT_ROOT, 'CHANGELOG.md')) ?? '';
  const entries = entriesSince(text, since, upTo);
  if (entries.length) console.log(`\nWhat's new since v${since}:\n\n${formatEntries(entries)}`);
}

function runUpdate(flags, rest) {
  const info = inspectUpdate();
  const json = Boolean(flags.json);
  if (['not-git', 'no-upstream', 'fetch-failed'].includes(info.state)) {
    const why = {
      'not-git': 'This copy of Tool_VibeCode is not a git clone, so it cannot update itself. Clone https://github.com/RabbitsXx/Tool_VibeCode.git (or download the latest release) and run `node bin/vibe.mjs install` from there.',
      'no-upstream': `This clone has no upstream branch to compare with (${info.detail}). Run: git branch --set-upstream-to=origin/main main`,
      'fetch-failed': `Could not reach the remote: ${info.detail}. Check your connection and try again.`,
    }[info.state];
    if (json) console.log(JSON.stringify({ ...info, error: why }));
    else console.error(why);
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(JSON.stringify(info));
    return;
  }
  const label = { 'up-to-date': 'up to date', behind: `${info.behind} new commit(s) available (v${info.current} -> v${info.latest})`, ahead: `${info.ahead} local commit(s) not pushed`, diverged: 'diverged from upstream' }[info.state];
  console.log(`Tool_VibeCode v${info.current}: ${label}`);

  if (info.state === 'diverged') {
    console.error(`Your clone has ${info.ahead} local commit(s) and the remote has ${info.behind} new one(s). Update it yourself so nothing is lost: git pull --rebase`);
    process.exitCode = 1;
    return;
  }
  if (info.state === 'behind') {
    for (const c of info.commits) console.log(`  ${c}`);
    printWhatsNew(info.current, info.latest);
  }
  if (flags.check) return;
  if (flags['dry-run']) {
    console.log('\n(dry run - nothing was pulled or installed)');
    return;
  }

  if (info.state === 'behind') {
    if (info.dirty) console.log('\nNote: this clone has uncommitted changes; git will refuse to update if they overlap with incoming files.');
    const pull = runCmd('git', ['pull', '--ff-only'], { cwd: KIT_ROOT, stdio: 'inherit', timeout: 120000 });
    if (pull.status !== 0) {
      console.error('\ngit pull failed, nothing was installed. Resolve it (git status) and run `update` again.');
      process.exitCode = 1;
      return;
    }
  }
  // Re-run in a fresh process so the freshly pulled code does the install.
  const args = [path.join(KIT_ROOT, 'bin', 'vibe.mjs'), 'install', ...rest.filter((a) => a !== '--check')];
  if (info.state === 'behind') args.push('--since', info.current);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
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
      const report = doctor({ dir, updates: Boolean(flags.updates) });
      console.log(flags.json ? JSON.stringify(report, null, 2) : formatDoctor(report));
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case 'update':
      return runUpdate(flags, rest);
    case 'install': {
      const dryRun = Boolean(flags['dry-run']);
      console.log(`${dryRun ? 'Would install' : 'Installing'} Tool_VibeCode ${kitVersion()} into ${claudeDir(dir)}`);
      const result = install({ dir, dryRun, force: Boolean(flags.force), skip });
      printActions(result, { dryRun });
      if (flags.since && !dryRun) printWhatsNew(String(flags.since));
      if (!dryRun) console.log('\nDone. Restart Claude Code (or start a new session) to load new commands, agents and hooks. Next: node bin/vibe.mjs doctor');
      return;
    }
    case 'uninstall': {
      const dryRun = Boolean(flags['dry-run']);
      printActions(uninstall({ dir, dryRun }), { dryRun });
      return;
    }
    case 'status': {
      const s = status({ dir });
      if (flags.json) return console.log(JSON.stringify(s, null, 2));
      if (!s.installed) return console.log(`Not installed in ${s.dir}. Run: node bin/vibe.mjs install`);
      console.log(`Installed v${s.installedVersion} in ${s.dir} (kit clone is v${s.kitVersion}) - ${s.upToDate ? 'up to date' : 'update available or files modified'}`);
      console.log(`  kit folder: ${s.kitPath}${s.kitPathExists ? '' : '  (MISSING - re-run install from the new location)'}`);
      console.log(`  CLAUDE.md block: ${s.claudeMdBlock ? 'yes' : 'no'}   hooks registered: ${s.hooksRegistered ? 'yes' : 'no'}`);
      for (const f of s.files.filter((x) => x.state !== 'ok')) console.log(`  ${f.state.padEnd(9)} ${f.path}`);
      process.exitCode = s.upToDate ? 0 : 1;
      return;
    }
    case 'backups': {
      const list = listBackups({ dir });
      if (!list.length) return console.log('No backups yet (they are created when install changes an existing file).');
      for (const b of list) console.log(`${b.name}  ${b.files.length} file(s): ${b.files.slice(0, 4).join(', ')}${b.files.length > 4 ? ', ...' : ''}`);
      console.log('\nRestore with: node bin/vibe.mjs restore <name>   (or "restore" for the latest)');
      return;
    }
    case 'restore': {
      const dryRun = Boolean(flags['dry-run']);
      const r = restoreBackup({ dir, which: positional[0] ?? 'latest', dryRun });
      console.log(`Restoring from ${r.from}`);
      printActions(r, { dryRun });
      if (!dryRun) console.log('\nNote: restored files may differ from the kit; `vibe install` re-applies the kit (it will skip files you changed unless --force).');
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
