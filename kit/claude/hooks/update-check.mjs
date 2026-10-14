#!/usr/bin/env node
// SessionStart hook (new sessions only): tells Claude - and through it, you - when a newer Tool_VibeCode is available.
//
// At most one network call per 24h (`git fetch` in the kit clone, 5s timeout, retried after 1h on failure); in between
// it answers from a small cache file. Silent when up to date, offline, or the kit is not a git clone.
// Opt out: set VIBE_NO_UPDATE_CHECK=1 in the environment. Always exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function gitDefault(args, cwd, timeout) {
  try {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }; // never hang waiting for credentials
    return { ok: true, out: execFileSync('git', args, { cwd, encoding: 'utf8', timeout, env, stdio: ['ignore', 'pipe', 'ignore'] }).trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

// The remote repository controls these strings and they go straight into the model's context: accept only plain versions.
const SAFE_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function message(current, latest, behind) {
  if (!SAFE_VERSION.test(String(latest))) latest = 'a newer version';
  else latest = `v${latest}`;
  behind = Number.isSafeInteger(behind) && behind > 0 ? behind : 1;
  return `Tool_VibeCode (the user's Claude Code kit) has an update available: v${current} -> ${latest} (${behind} new commit${behind === 1 ? '' : 's'}). The user can install it with /vibe-update. Set VIBE_NO_UPDATE_CHECK=1 to stop these checks.`;
}

/**
 * @param {{manifestPath: string, cachePath: string, now?: number, git?: Function}} o
 * @returns {string} text to add to the session context ('' = nothing to say)
 */
export function checkForUpdate({ manifestPath, cachePath, now = Date.now(), git = gitDefault }) {
  const manifest = readJson(manifestPath);
  const kitPath = manifest?.kitPath;
  if (!kitPath || !fs.existsSync(path.join(kitPath, '.git'))) return '';
  const current = manifest.version;

  const cache = readJson(cachePath);
  if (cache && cache.current === current && now < cache.nextCheckAt) {
    return cache.behind > 0 ? message(current, cache.latest ?? current, cache.behind) : '';
  }

  const save = (data) => {
    try {
      fs.writeFileSync(cachePath, JSON.stringify({ current, ...data }));
    } catch { /* cache is optional */ }
  };

  if (!git(['fetch', '--quiet'], kitPath, 5000).ok) {
    save({ behind: 0, nextCheckAt: now + HOUR });
    return '';
  }
  const counts = git(['rev-list', '--count', 'HEAD..@{u}'], kitPath, 3000);
  const behind = counts.ok ? Number(counts.out) || 0 : 0;
  let latest = current;
  if (behind > 0) {
    try {
      latest = JSON.parse(git(['show', '@{u}:package.json'], kitPath, 3000).out).version ?? current;
    } catch { /* keep current */ }
  }
  save({ behind, latest, nextCheckAt: now + DAY });
  return behind > 0 ? message(current, latest, behind) : '';
}

async function main() {
  if (process.env.VIBE_NO_UPDATE_CHECK === '1' || process.env.VIBE_GUARD_OFF === '1') return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    // Only on a brand-new session, not on resume/clear/compact (those would nag repeatedly).
    const source = JSON.parse(raw)?.source;
    if (source && source !== 'startup') return;
  } catch { /* no/invalid stdin: carry on */ }
  const vibeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = checkForUpdate({ manifestPath: path.join(vibeDir, 'manifest.json'), cachePath: path.join(vibeDir, 'update-check.json') });
  if (out) process.stdout.write(out + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {}).finally(() => process.exit(0));
}
