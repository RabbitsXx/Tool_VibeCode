import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, walk, writeAtomic, runCmd } from './util.mjs';

const TEMPLATE = path.join(KIT_ROOT, 'kit', 'project-template');
/** Files stored under another name inside the kit so they do not act on the kit repo itself. */
const RENAMES = { 'gitignore.template': '.gitignore' };

export function projectName(dest) {
  return path.basename(path.resolve(dest)).replace(/[^\w .-]/g, '') || 'my-project';
}

/**
 * Copy the project template into dest. Never overwrites an existing file.
 * @returns {{dest: string, created: string[], skipped: string[], git: string}}
 */
export function scaffold({ dest, name, git = false, dryRun = false }) {
  const target = path.resolve(dest);
  const projectLabel = name || projectName(target);
  const date = new Date().toISOString().slice(0, 10);
  const created = [];
  const skipped = [];

  for (const rel of walk(TEMPLATE)) {
    const outRel = RENAMES[rel] ?? rel;
    const out = path.join(target, outRel);
    if (fs.existsSync(out)) {
      skipped.push(outRel);
      continue;
    }
    created.push(outRel);
    if (dryRun) continue;
    const text = fs.readFileSync(path.join(TEMPLATE, rel), 'utf8')
      .replaceAll('{{PROJECT_NAME}}', projectLabel)
      .replaceAll('{{DATE}}', date);
    writeAtomic(out, text);
  }

  let gitResult = 'not requested';
  if (git && !dryRun) {
    if (fs.existsSync(path.join(target, '.git'))) gitResult = 'already a repository';
    else {
      const r = runCmd('git', ['init', '-b', 'main'], { cwd: target });
      gitResult = r.status === 0 ? 'initialized (branch main)' : `failed: ${(r.stderr || '').trim()}`;
    }
  }
  return { dest: target, created, skipped, git: gitResult };
}
