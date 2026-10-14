#!/usr/bin/env node
// Cut a release: verify + test, bump package.json, move CHANGELOG [Unreleased] under the new version, commit, tag.
// Usage: node scripts/release.mjs <patch|minor|major> [--dry-run] [--push]
// Nothing leaves your machine unless you pass --push.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { KIT_ROOT, kitVersion } from '../lib/util.mjs';
import { bumpVersion, promoteUnreleased } from '../lib/changelog.mjs';

/** Pure planning step (unit-tested): what the new version and changelog will be. */
export function planRelease({ version, changelog, level, date }) {
  const next = bumpVersion(version, level);
  return { next, changelog: promoteUnreleased(changelog, next, date) };
}

function sh(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: KIT_ROOT, encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`);
  return (r.stdout || '').trim();
}

function main() {
  const args = process.argv.slice(2);
  const level = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const push = args.includes('--push');
  if (!level) throw new Error('Usage: node scripts/release.mjs <patch|minor|major> [--dry-run] [--push]');

  if (sh('git', ['status', '--porcelain'])) throw new Error('Working tree is not clean. Commit or stash your changes first.');
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') throw new Error(`Releases are cut from main (you are on "${branch}").`);

  const changelogPath = path.join(KIT_ROOT, 'CHANGELOG.md');
  const pkgPath = path.join(KIT_ROOT, 'package.json');
  const plan = planRelease({
    version: kitVersion(),
    changelog: fs.readFileSync(changelogPath, 'utf8'),
    level,
    date: new Date().toISOString().slice(0, 10),
  });
  console.log(`Release: v${kitVersion()} -> v${plan.next}`);

  console.log('Running verify and tests...');
  sh(process.execPath, ['bin/vibe.mjs', 'verify']);
  sh(process.execPath, ['--test']);
  console.log('  ok');

  if (dryRun) return console.log(`\n(dry run) would commit "release: v${plan.next}" and tag v${plan.next}${push ? ' and push' : ''}`);

  const pkg = fs.readFileSync(pkgPath, 'utf8').replace(/("version":\s*")[^"]+(")/, `$1${plan.next}$2`);
  fs.writeFileSync(pkgPath, pkg);
  fs.writeFileSync(changelogPath, plan.changelog);
  // verify again with the bumped version (package.json and CHANGELOG must agree)
  sh(process.execPath, ['bin/vibe.mjs', 'verify']);
  sh('git', ['add', 'package.json', 'CHANGELOG.md']);
  sh('git', ['commit', '-m', `release: v${plan.next}`]);
  sh('git', ['tag', '-a', `v${plan.next}`, '-m', `v${plan.next}`]);
  console.log(`Committed and tagged v${plan.next}.`);

  if (push) {
    sh('git', ['push', 'origin', 'main']);
    sh('git', ['push', 'origin', `v${plan.next}`]);
    console.log('Pushed main and the tag. Users get it with: vibe update  (or /vibe-update in Claude Code)');
  } else {
    console.log('Review with `git show`, then publish with: git push origin main --follow-tags');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  }
}
