import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, walk } from './util.mjs';
import { loadPresets } from './mcp.mjs';

const read = (...p) => fs.readFileSync(path.join(KIT_ROOT, ...p), 'utf8');

/** Minimal frontmatter reader: returns {key: value} for the leading --- block, or null. */
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** Integrity checks over the kit's own files. Returns a list of problems (empty = healthy). */
export function verifyKit() {
  const problems = [];
  const bad = (msg) => problems.push(msg);

  for (const rel of walk(path.join(KIT_ROOT, 'kit', 'claude', 'commands'))) {
    const fm = frontmatter(read('kit', 'claude', 'commands', rel));
    if (!rel.startsWith('vibe-')) bad(`commands/${rel}: file name must start with "vibe-"`);
    if (!fm?.description) bad(`commands/${rel}: missing description in frontmatter`);
  }
  for (const rel of walk(path.join(KIT_ROOT, 'kit', 'claude', 'agents'))) {
    const fm = frontmatter(read('kit', 'claude', 'agents', rel));
    const expected = rel.replace(/\.md$/, '');
    if (!fm?.name || !fm?.description) bad(`agents/${rel}: needs name and description`);
    else if (fm.name !== expected) bad(`agents/${rel}: name "${fm.name}" must equal file name "${expected}"`);
    if (!expected.startsWith('vibe-')) bad(`agents/${rel}: file name must start with "vibe-"`);
  }
  const skill = frontmatter(read('kit', 'claude', 'skills', 'vibe-workflow', 'SKILL.md'));
  if (!skill?.name || !skill?.description) bad('skills/vibe-workflow/SKILL.md: needs name and description');

  let fragment;
  try {
    fragment = JSON.parse(read('kit', 'claude', 'settings.fragment.json'));
  } catch (e) {
    bad(`settings.fragment.json: ${e.message}`);
  }
  if (fragment) {
    const hookFiles = new Set(walk(path.join(KIT_ROOT, 'kit', 'claude', 'hooks')));
    for (const groups of Object.values(fragment.hooks ?? {})) {
      for (const g of groups) for (const h of g.hooks ?? []) {
        const m = String(h.command).match(/\{\{HOOKS_DIR\}\}\/([\w.-]+)/);
        if (!m) bad(`settings.fragment.json: hook command must use {{HOOKS_DIR}}: ${h.command}`);
        else if (!hookFiles.has(m[1])) bad(`settings.fragment.json: hook script not found: ${m[1]}`);
      }
    }
    const all = ['allow', 'ask', 'deny'].flatMap((k) => fragment.permissions?.[k] ?? []);
    if (new Set(all).size !== all.length) bad('settings.fragment.json: duplicate permission rule across lists');
  }

  for (const rel of walk(path.join(KIT_ROOT, 'kit', 'claude', 'hooks'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(KIT_ROOT, 'kit', 'claude', 'hooks', rel)], { encoding: 'utf8' });
    if (r.status !== 0) bad(`hooks/${rel}: syntax error: ${r.stderr.trim().split('\n')[0]}`);
  }

  for (const f of ['AGENTS.md', 'CLAUDE.md', 'gitignore.template', '.env.example', 'docs/SPEC.md', 'docs/PLAN.md', 'docs/TASKS.md', 'docs/DECISIONS.md', 'docs/HANDOFF.md']) {
    if (!fs.existsSync(path.join(KIT_ROOT, 'kit', 'project-template', f))) bad(`project-template/${f} missing`);
  }
  try {
    for (const p of loadPresets()) if (!p.name || !Array.isArray(p.command)) bad(`mcp preset invalid: ${JSON.stringify(p)}`);
  } catch (e) {
    bad(`mcp/presets.json: ${e.message}`);
  }

  // PowerShell 5.1 misreads UTF-8 without BOM: scripts must stay ASCII.
  for (const rel of walk(path.join(KIT_ROOT, 'setup'))) {
    if (rel.endsWith('.ps1') && /[^\x00-\x7F]/.test(read('setup', rel))) bad(`setup/${rel}: PowerShell scripts must be ASCII-only`);
  }

  // Never ship anything that looks like a real secret.
  const secretRe = /\b(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  for (const rel of walk(KIT_ROOT)) {
    if (/^(\.git|node_modules)\//.test(rel) || rel.startsWith('tests/')) continue;
    if (/\.(png|jpg|gif|ico|zip)$/.test(rel)) continue;
    if (secretRe.test(read(rel))) bad(`${rel}: contains something that looks like a secret`);
  }
  return problems;
}
