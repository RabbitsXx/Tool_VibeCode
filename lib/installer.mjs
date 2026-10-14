import fs from 'node:fs';
import path from 'node:path';
import {
  KIT_ROOT, kitVersion, sha256, claudeDir, readText, readJson, writeAtomic, walk,
  removeEmptyDirs, timestamp, toPosix,
} from './util.mjs';
import { mergeSettings, unmergeSettings, renderFragment, hasVibeHooks } from './settings.mjs';
import { upsertBlock, removeBlock, hasBlock } from './claudemd.mjs';

export const COMPONENTS = ['commands', 'agents', 'skills', 'hooks', 'settings', 'memory'];
const KIT_CLAUDE = path.join(KIT_ROOT, 'kit', 'claude');
const KEEP_BACKUPS = 10;

/** kit component -> [source dir, destination dir relative to the Claude config dir] */
const FILE_COMPONENTS = {
  commands: ['commands', 'commands'],
  agents: ['agents', 'agents'],
  skills: ['skills', 'skills'],
  hooks: ['hooks', 'vibe/hooks'],
};

export const manifestPath = (dir) => path.join(dir, 'vibe', 'manifest.json');

function kitFiles(skip) {
  const files = [];
  for (const [component, [srcDir, destDir]] of Object.entries(FILE_COMPONENTS)) {
    if (skip.has(component)) continue;
    for (const rel of walk(path.join(KIT_CLAUDE, srcDir))) {
      files.push({ component, src: path.join(KIT_CLAUDE, srcDir, rel), rel: `${destDir}/${rel}` });
    }
  }
  return files;
}

function makeBackup(dir, state) {
  state.backupDir ??= path.join(dir, 'backups', `vibe-${timestamp()}`);
  return (relOrAbs) => {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(dir, relOrAbs);
    if (!fs.existsSync(abs)) return;
    const dest = path.join(state.backupDir, path.relative(dir, abs));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
  };
}

function pruneBackups(dir) {
  const root = path.join(dir, 'backups');
  if (!fs.existsSync(root)) return;
  const old = fs.readdirSync(root).filter((n) => n.startsWith('vibe-')).sort().slice(0, -KEEP_BACKUPS);
  for (const name of old) fs.rmSync(path.join(root, name), { recursive: true, force: true });
}

/**
 * Install or upgrade the kit into a Claude config directory.
 * Idempotent: re-running with an unchanged kit changes nothing.
 * @returns {{actions: {status: string, path: string, note?: string}[], backupDir: string|null}}
 */
export function install({ dir, dryRun = false, force = false, skip = [] } = {}) {
  const target = claudeDir(dir);
  const skipSet = new Set(skip);
  const actions = [];
  const act = (status, p, note) => actions.push({ status, path: p, ...(note ? { note } : {}) });
  const state = {};
  const backup = makeBackup(target, state);

  const manifest = readJson(manifestPath(target), { files: {}, settings: {} });
  const nextFiles = {};

  // 1) Files: commands, agents, skills, hooks
  const wanted = kitFiles(skipSet);
  for (const { src, rel } of wanted) {
    const dest = path.join(target, rel);
    const data = fs.readFileSync(src);
    const srcHash = sha256(data);
    const tracked = manifest.files?.[rel];
    const exists = fs.existsSync(dest);
    const destHash = exists ? sha256(fs.readFileSync(dest)) : null;

    if (!exists) {
      act('add', rel);
    } else if (destHash === srcHash) {
      act('unchanged', rel);
      nextFiles[rel] = srcHash;
      continue;
    } else if (tracked && tracked === destHash) {
      act('update', rel);
    } else if (force) {
      act('overwrite', rel, tracked ? 'locally modified' : 'existing file not owned by the kit');
    } else {
      act('skip', rel, tracked ? 'locally modified (use --force to overwrite)' : 'existing file not owned by the kit (use --force to overwrite)');
      if (tracked) nextFiles[rel] = tracked;
      continue;
    }
    nextFiles[rel] = srcHash;
    if (!dryRun) {
      if (exists) backup(rel);
      writeAtomic(dest, data);
    }
  }

  // 2) Stale files the kit used to ship but no longer does
  const shipped = new Set(kitFiles(new Set()).map((w) => w.rel));
  for (const [rel, hash] of Object.entries(manifest.files ?? {})) {
    if (shipped.has(rel)) {
      if (nextFiles[rel] === undefined) nextFiles[rel] = hash; // component skipped this run: keep tracking it
      continue;
    }
    const abs = path.join(target, rel);
    if (!fs.existsSync(abs)) continue;
    if (sha256(fs.readFileSync(abs)) === hash) {
      act('remove', rel, 'no longer part of the kit');
      if (!dryRun) {
        backup(rel);
        fs.rmSync(abs);
        removeEmptyDirs(path.dirname(abs), target);
      }
    } else {
      act('keep', rel, 'no longer part of the kit but locally modified');
      nextFiles[rel] = hash;
    }
  }

  // 3) Managed block in CLAUDE.md
  let claudeMdManaged = Boolean(manifest.claudeMd);
  if (!skipSet.has('memory')) {
    const mdPath = path.join(target, 'CLAUDE.md');
    const current = readText(mdPath);
    const body = fs.readFileSync(path.join(KIT_CLAUDE, 'CLAUDE.md'), 'utf8');
    const next = upsertBlock(current, body);
    if (next === current) act('unchanged', 'CLAUDE.md', 'managed block');
    else {
      act(current == null ? 'add' : 'update', 'CLAUDE.md', 'managed block');
      if (!dryRun) {
        backup(mdPath);
        writeAtomic(mdPath, next);
      }
    }
    claudeMdManaged = true;
  }

  // 4) settings.json (permissions + hooks)
  let settingsAdded = manifest.settings?.added ?? { allow: [], ask: [], deny: [] };
  if (!skipSet.has('settings')) {
    const settingsPath = path.join(target, 'settings.json');
    const current = readJson(settingsPath, {});
    const fragment = renderFragment(
      JSON.parse(fs.readFileSync(path.join(KIT_CLAUDE, 'settings.fragment.json'), 'utf8')),
      toPosix(path.join(target, 'vibe', 'hooks')),
    );
    const { settings, added, skipped } = mergeSettings(current, fragment, { withHooks: !skipSet.has('hooks') });
    const merged = {
      allow: [...new Set([...(settingsAdded.allow ?? []), ...added.allow])],
      ask: [...new Set([...(settingsAdded.ask ?? []), ...added.ask])],
      deny: [...new Set([...(settingsAdded.deny ?? []), ...added.deny])],
    };
    const nextText = JSON.stringify(settings, null, 2) + '\n';
    const currentText = readText(settingsPath);
    if (currentText !== null && JSON.stringify(readJson(settingsPath, {})) === JSON.stringify(settings)) {
      act('unchanged', 'settings.json');
    } else {
      const n = added.allow.length + added.ask.length + added.deny.length;
      act(currentText == null ? 'add' : 'update', 'settings.json', `${n} new permission rule(s), hooks refreshed`);
      if (!dryRun) {
        backup(settingsPath);
        writeAtomic(settingsPath, nextText);
      }
    }
    for (const s of skipped) act('info', 'settings.json', s);
    settingsAdded = merged;
  }

  // 5) Manifest
  const nextManifest = {
    kit: 'Tool_VibeCode',
    version: kitVersion(),
    installedAt: new Date().toISOString(),
    claudeMd: claudeMdManaged,
    files: nextFiles,
    settings: { added: settingsAdded },
  };
  if (!dryRun) {
    writeAtomic(manifestPath(target), JSON.stringify(nextManifest, null, 2) + '\n');
    pruneBackups(target);
  }
  return { dir: target, actions, backupDir: dryRun ? null : (state.backupDir && fs.existsSync(state.backupDir) ? state.backupDir : null) };
}

/** Remove everything the kit installed; locally modified files are left in place. */
export function uninstall({ dir, dryRun = false } = {}) {
  const target = claudeDir(dir);
  const actions = [];
  const act = (status, p, note) => actions.push({ status, path: p, ...(note ? { note } : {}) });
  const state = {};
  const backup = makeBackup(target, state);
  const manifest = readJson(manifestPath(target), null);
  if (!manifest) return { dir: target, actions: [{ status: 'noop', path: 'manifest', note: 'kit is not installed here' }], backupDir: null };

  for (const [rel, hash] of Object.entries(manifest.files ?? {})) {
    const abs = path.join(target, rel);
    if (!fs.existsSync(abs)) continue;
    if (sha256(fs.readFileSync(abs)) !== hash) {
      act('keep', rel, 'locally modified');
      continue;
    }
    act('remove', rel);
    if (!dryRun) {
      fs.rmSync(abs);
      removeEmptyDirs(path.dirname(abs), target);
    }
  }

  const mdPath = path.join(target, 'CLAUDE.md');
  const md = readText(mdPath);
  if (hasBlock(md)) {
    act('update', 'CLAUDE.md', 'managed block removed');
    if (!dryRun) {
      backup(mdPath);
      const next = removeBlock(md);
      if (next.trim()) writeAtomic(mdPath, next);
      else fs.rmSync(mdPath);
    }
  }

  const settingsPath = path.join(target, 'settings.json');
  const settings = readJson(settingsPath, null);
  if (settings) {
    const next = unmergeSettings(settings, manifest.settings?.added);
    if (JSON.stringify(next) !== JSON.stringify(settings)) {
      act('update', 'settings.json', 'kit permissions and hooks removed');
      if (!dryRun) {
        backup(settingsPath);
        writeAtomic(settingsPath, JSON.stringify(next, null, 2) + '\n');
      }
    }
  }

  act('remove', 'vibe/manifest.json');
  if (!dryRun) {
    fs.rmSync(manifestPath(target), { force: true });
    removeEmptyDirs(path.join(target, 'vibe'), target);
  }
  return { dir: target, actions, backupDir: dryRun ? null : (state.backupDir && fs.existsSync(state.backupDir) ? state.backupDir : null) };
}

/** Compare what is on disk with what the manifest says was installed. */
export function status({ dir } = {}) {
  const target = claudeDir(dir);
  const manifest = readJson(manifestPath(target), null);
  if (!manifest) return { dir: target, installed: false, files: [] };
  const files = Object.entries(manifest.files ?? {}).map(([rel, hash]) => {
    const abs = path.join(target, rel);
    const state = !fs.existsSync(abs) ? 'missing' : sha256(fs.readFileSync(abs)) === hash ? 'ok' : 'modified';
    return { path: rel, state };
  });
  const settings = readJson(path.join(target, 'settings.json'), {});
  return {
    dir: target,
    installed: true,
    installedVersion: manifest.version,
    kitVersion: kitVersion(),
    upToDate: manifest.version === kitVersion() && files.every((f) => f.state === 'ok'),
    claudeMdBlock: hasBlock(readText(path.join(target, 'CLAUDE.md'))),
    hooksRegistered: hasVibeHooks(settings),
    files,
  };
}
