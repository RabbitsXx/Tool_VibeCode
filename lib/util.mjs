import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function kitVersion() {
  return JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8')).version;
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function claudeDir(override) {
  return path.resolve(override || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
}

export const toPosix = (p) => p.split(path.sep).join('/');

export function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export function readJson(p, fallback = null) {
  const text = readText(p);
  if (text == null) return fallback;
  if (text.trim() === '') return fallback;
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`Invalid JSON in ${p}: ${e.message}`);
  }
}

/** Write via temp file + rename so a crash never leaves a half-written config. */
export function writeAtomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.vibe-tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}

/** Relative posix paths of every file under dir, sorted. Missing dir -> []. */
export function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(toPosix(path.relative(base, full)));
  }
  return out.sort();
}

export function removeEmptyDirs(dir, stopAt) {
  let cur = dir;
  while (cur.startsWith(stopAt) && cur !== stopAt) {
    try {
      if (fs.readdirSync(cur).length) return;
      fs.rmdirSync(cur);
    } catch {
      return;
    }
    cur = path.dirname(cur);
  }
}

/**
 * spawnSync that also finds Windows .cmd shims (npm, claude, code) without Node's
 * "args with shell:true" deprecation: on win32 the command line is built as one quoted string.
 */
export function runCmd(cmd, args = [], opts = {}) {
  const base = { encoding: 'utf8', windowsHide: true, ...opts };
  if (process.platform !== 'win32') return spawnSync(cmd, args, base);
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a);
  return spawnSync([cmd, ...args].map(quote).join(' '), { ...base, shell: true });
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Compare dotted versions. Returns -1, 0, 1. Non-numeric parts are ignored. */
export function compareVersions(a, b) {
  const pa = String(a).match(/\d+/g)?.map(Number) ?? [];
  const pb = String(b).match(/\d+/g)?.map(Number) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
