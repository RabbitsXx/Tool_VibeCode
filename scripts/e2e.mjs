#!/usr/bin/env node
// End-to-end test of the installed kit with a REAL Claude Code and a REAL model.
// It builds a small project step by step with the /vibe-* commands and checks the results from files, tests and git -
// never from what the model says about itself.
//
//   node scripts/e2e.mjs --model sonnet [--steps start,plan,build] [--out <dir>] [--timeout-min 20]
//
// Costs real model usage and takes a while (roughly 15-45 min per model). Requires the kit to be installed
// (`node bin/vibe.mjs install`) and `claude` to be logged in. Not part of `npm test`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCmd } from '../lib/util.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const MODEL = opt('model', 'sonnet');
const OUT = path.resolve(opt('out', path.join(os.tmpdir(), `vibe-e2e-${MODEL}-${Date.now()}`)));
const TIMEOUT_MS = Number(opt('timeout-min', '20')) * 60_000;
const ONLY = opt('steps', '')?.split(',').filter(Boolean);
const PROJ = path.join(OUT, 'proj');
const LOGS = path.join(OUT, 'logs');
fs.mkdirSync(PROJ, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

// ------------------------------------------------------------------ helpers

function sh(cmd, argv, opts = {}) {
  return spawnSync(cmd, argv, { cwd: PROJ, encoding: 'utf8', env: ENV, ...opts });
}
const git = (...a) => sh('git', a);
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(PROJ, rel), 'utf8');
  } catch {
    return null;
  }
};
const exists = (rel) => fs.existsSync(path.join(PROJ, rel));

function listFiles(dir = PROJ, base = PROJ) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).replaceAll('\\', '/'));
  }
  return out.sort();
}
const isTestFile = (f) => /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]s$/.test(f);
const sourceFiles = () => listFiles().filter((f) => /\.[cm]?js$/.test(f) && !isTestFile(f));
const testFiles = () => listFiles().filter((f) => /\.[cm]?js$/.test(f) && isTestFile(f));

function runTests() {
  const pkg = read('package.json');
  let useNpm = false;
  try {
    useNpm = Boolean(JSON.parse(pkg ?? '{}').scripts?.test);
  } catch { /* fall through */ }
  const r = useNpm ? runCmd('npm', ['test', '--silent'], { cwd: PROJ, env: ENV, timeout: 120000 }) : sh('node', ['--test'], { timeout: 120000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const pass = Number(/ℹ pass (\d+)/.exec(out)?.[1] ?? NaN);
  const fail = Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? NaN);
  return { ok: r.status === 0, out, pass, fail, via: useNpm ? 'npm test' : 'node --test' };
}

const status = () => git('status', '--porcelain').stdout;
const headSha = () => git('rev-parse', 'HEAD').stdout.trim();
const commitCount = () => Number(git('rev-list', '--count', 'HEAD').stdout.trim() || 0);
const countTests = () => testFiles().reduce((n, f) => n + (read(f)?.match(/^\s*(?:test|it)\(/gm)?.length ?? 0), 0);

const SECRET_RE = /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const thaiRatio = (s) => {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length ? (s.match(/[฀-๿]/g) ?? []).length / letters.length : 0;
};

/** Run one `claude -p` call and parse the stream-json log. */
function claude(prompt, { maxTurns = 30, label }) {
  const argv = ['-p', prompt, '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--max-turns', String(maxTurns),
    '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash'];
  const t0 = Date.now();
  const r = spawnSync('claude', argv, { cwd: PROJ, encoding: 'utf8', env: ENV, timeout: TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
  const raw = `${r.stdout || ''}`;
  fs.writeFileSync(path.join(LOGS, `${label}.jsonl`), raw);
  if (r.stderr) fs.writeFileSync(path.join(LOGS, `${label}.stderr.txt`), r.stderr);

  const info = { label, timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT'), tools: {}, commands: [], blocks: [], denials: [], final: '', turns: 0, cost: 0, durationMs: Date.now() - t0, isError: false, subtype: '', slash: [] };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === 'system' && o.subtype === 'init') info.slash = (o.slash_commands ?? []).filter((c) => c.startsWith('vibe-'));
    const content = o.message?.content;
    if (Array.isArray(content)) {
      for (const p of content) {
        if (p.type === 'tool_use') {
          info.tools[p.name] = (info.tools[p.name] ?? 0) + 1;
          if (p.input?.command) info.commands.push(String(p.input.command).slice(0, 300));
        }
        if (p.type === 'tool_result') {
          const text = typeof p.content === 'string' ? p.content : JSON.stringify(p.content);
          if (/\[vibe-guard\]/.test(text)) info.blocks.push(text.slice(0, 300));
          else if (/has been denied|Permission to use/.test(text)) info.denials.push(text.slice(0, 200));
        }
      }
    }
    if (o.type === 'result') {
      info.final = String(o.result ?? '');
      info.turns = o.num_turns ?? 0;
      info.cost = o.total_cost_usd ?? 0;
      info.isError = Boolean(o.is_error);
      info.subtype = o.subtype ?? '';
    }
  }
  return info;
}

// ------------------------------------------------------------------ steps

const IDEA = 'Pomodoro timer web page: 25 minute focus / 5 minute break cycles, start, pause and reset buttons, and a counter of completed focus sessions saved in the browser. Plain HTML, CSS and JavaScript, no build tools, no dependencies. The timer logic must live in its own module that can be unit-tested with node --test.';

const check = (name, pass, detail = '') => ({ name, pass: Boolean(pass), detail: String(detail).slice(0, 200) });
const noFileChanges = (before) => check('did not modify any files', status() === before, status() === before ? '' : `changed: ${status().trim().split('\n').slice(0, 5).join(' | ')}`);

const state = {};

const STEPS = [
  {
    id: 'start',
    prompt: `/vibe-start ${IDEA}`,
    maxTurns: 60,
    followUp: 'Use your own sensible defaults for every question you asked, state them as assumptions, and continue to the end of the command.',
    checks: (res) => {
      const spec = read('docs/SPEC.md') ?? '';
      const tasks = read('docs/TASKS.md') ?? '';
      const agents = read('AGENTS.md') ?? '';
      const criteria = (spec.split(/^#+\s*Acceptance criteria.*$/im)[1] ?? '').split(/^#+\s/m)[0].split('\n').filter((l) => /^\s*(?:\d+\.|[-*](?:\s*\[[ x]\])?)\s+\S/i.test(l));
      return [
        check('AGENTS.md exists', exists('AGENTS.md')),
        check('CLAUDE.md imports @AGENTS.md', /@AGENTS\.md/.test(read('CLAUDE.md') ?? '')),
        check('docs/ has SPEC, TASKS, DECISIONS, HANDOFF', ['SPEC', 'TASKS', 'DECISIONS', 'HANDOFF'].every((n) => exists(`docs/${n}.md`))),
        check('.gitignore and .env.example exist', exists('.gitignore') && exists('.env.example')),
        check('SPEC has >=3 acceptance criteria and no template placeholder left', criteria.length >= 3 && !/Given \.\.\. when \.\.\. then \.\.\.\s*$/m.test(spec), `criteria items: ${criteria.length}`),
        check('SPEC lists assumptions', /assumption/i.test(spec)),
        check('TASKS has >=3 open tasks written as "done when"', (tasks.match(/^- \[ \].*done when/gim) ?? []).length >= 3, `open tasks with "done when": ${(tasks.match(/^- \[ \].*done when/gim) ?? []).length}`),
        check('AGENTS.md "Commands" filled in (no TODO left)', !/^- (Install|Run|Test|Lint)[^\n]*`TODO`/m.test(agents) || /node --test/.test(agents), agents.match(/Commands[\s\S]{0,300}/)?.[0]?.replace(/\n/g, ' | ')),
        check('git repository with a first commit', commitCount() >= 1),
        check('did not push / no remote', !res.commands.some((c) => /git push/.test(c)) && git('remote').stdout.trim() === ''),
        check('final answer states assumptions and the run command', /assum/i.test(res.final) && /(node|open|npm|python|http)/i.test(res.final)),
      ];
    },
    after: () => {
      state.filesAfterStart = listFiles();
    },
  },
  {
    id: 'plan',
    prompt: '/vibe-plan',
    maxTurns: 30,
    before: () => ({ files: listFiles().filter((f) => !f.startsWith('docs/')), tasks: read('docs/TASKS.md') }),
    checks: (res, b) => {
      const plan = read('docs/PLAN.md') ?? '';
      const tasks = read('docs/TASKS.md') ?? '';
      const nonDocs = listFiles().filter((f) => !f.startsWith('docs/'));
      return [
        check('docs/PLAN.md written (>400 chars)', plan.length > 400, `${plan.length} chars`),
        check('PLAN names risks/unknowns', /risk|unknown/i.test(plan)),
        check('TASKS has >=3 open tasks with "done when"', (tasks.match(/^- \[ \].*done when/gim) ?? []).length >= 3),
        check('did not implement anything (no new non-doc files)', JSON.stringify(nonDocs) === JSON.stringify(b.files), `new: ${nonDocs.filter((f) => !b.files.includes(f)).join(', ')}`),
        check('asks whether to proceed with /vibe-build', /vibe-build|proceed/i.test(res.final)),
      ];
    },
  },
  {
    id: 'build',
    prompt: '/vibe-build',
    maxTurns: 80,
    before: () => ({ commits: commitCount(), openBefore: (read('docs/TASKS.md')?.match(/^- \[ \]/gm) ?? []).length, doneBefore: (read('docs/TASKS.md')?.match(/^- \[x\]/gim) ?? []).length }),
    checks: (res, b) => {
      const t = runTests();
      const doneNow = (read('docs/TASKS.md')?.match(/^- \[x\]/gim) ?? []).length;
      return [
        check('unit tests exist', testFiles().length > 0, testFiles().join(', ')),
        check(`tests pass when I run them (${t.via})`, t.ok && t.pass > 0, `pass=${t.pass} fail=${t.fail}`),
        check('at least one task ticked in TASKS.md', doneNow > b.doneBefore, `done ${b.doneBefore} -> ${doneNow}`),
        check('at most 3 tasks done in one run', doneNow - b.doneBefore <= 3),
        check('a git commit was made', commitCount() > b.commits, `commits ${b.commits} -> ${commitCount()}`),
        check('working tree clean after commit', status().trim() === '', status().trim().slice(0, 150)),
        check('a web page exists (html) and links the module', listFiles().some((f) => f.endsWith('.html')) && /<script/i.test(read(listFiles().find((f) => f.endsWith('.html')) ?? '') ?? '')),
        check('no push attempted', !res.commands.some((c) => /git push/.test(c))),
        check('final answer reports commands/results', /test/i.test(res.final) && /(pass|ok|✔|green)/i.test(res.final)),
      ];
    },
  },
  {
    id: 'fix',
    // The bug is seeded by the driver (see seedBug) so the result can be checked objectively.
    prepare: () => seedBug(),
    prompt: () => `/vibe-fix The tests started failing after my last edit. Output of the test run:\n\n${state.bugReport}`,
    maxTurns: 40,
    skipIf: () => !state.bugSeeded,
    checks: (res, b) => {
      const t = runTests();
      const diffStat = git('diff', '--name-only', state.seedCommit, 'HEAD').stdout.split('\n').filter(Boolean);
      const worktreeChanged = git('diff', '--name-only', state.seedCommit).stdout.split('\n').filter(Boolean);
      const changed = [...new Set([...diffStat, ...worktreeChanged])];
      const testsChanged = changed.filter(isTestFile);
      const removedTestLines = Number((git('diff', state.seedCommit, '--numstat', '--', ...testFiles()).stdout.split('\n').filter(Boolean).reduce((n, l) => n + Number(l.split('\t')[1] || 0), 0)));
      return [
        check('tests pass again when I run them', t.ok && t.pass > 0, `pass=${t.pass} fail=${t.fail}`),
        check('the seeded bug is actually gone from the source', !read(state.bugFile)?.includes(state.bugMutated) || read(state.bugFile)?.includes(state.bugOriginal), `file ${state.bugFile}`),
        check('fix is small (<=2 non-test files changed)', changed.filter((f) => !isTestFile(f) && !f.startsWith('docs/')).length <= 2, changed.join(', ')),
        check('no test was weakened (0 test lines removed)', removedTestLines === 0, `removed lines in tests: ${removedTestLines}; changed tests: ${testsChanged.join(', ') || 'none'}`),
        check('final answer explains the root cause', /(root cause|cause|because|caused)/i.test(res.final)),
      ];
    },
  },
  {
    id: 'ui',
    prompt: '/vibe-ui the timer page',
    maxTurns: 60,
    checks: (res) => {
      const t = runTests();
      const files = listFiles();
      const css = files.filter((f) => f.endsWith('.css')).map(read).join('\n') + (files.filter((f) => f.endsWith('.html')).map(read).join('\n').match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n');
      const html = files.filter((f) => f.endsWith('.html')).map(read).join('\n');
      return [
        check('tests still pass', t.ok && t.pass > 0, `pass=${t.pass} fail=${t.fail}`),
        check('viewport meta present', /<meta[^>]+name=["']viewport/i.test(html)),
        check('html lang attribute', /<html[^>]+lang=/i.test(html)),
        check('responsive CSS (@media)', /@media/.test(css)),
        check('visible keyboard focus (:focus-visible or :focus)', /:focus(-visible)?/.test(css)),
        check('design tokens as CSS variables', /--[\w-]+\s*:/.test(css)),
        check('buttons have text or aria-label', !/<button[^>]*>\s*<\/button>/i.test(html)),
        check('reduced-motion respected or no animation', /prefers-reduced-motion/.test(css) || !/(animation|transition)\s*:/.test(css)),
        check('final answer says what was verified at which widths', /(375|768|1280|mobile|phone)/i.test(res.final)),
      ];
    },
  },
  {
    id: 'review',
    prompt: '/vibe-review',
    maxTurns: 40,
    before: () => status(),
    checks: (res, before) => [
      noFileChanges(before),
      check('report is substantive (>300 chars)', res.final.length > 300, `${res.final.length} chars`),
      check('cites file locations or states what was checked', /\.\w{2,4}:\d+|`[\w./-]+\.\w+`/.test(res.final) || /checked/i.test(res.final)),
    ],
  },
  {
    id: 'sec',
    prompt: '/vibe-sec all',
    maxTurns: 40,
    before: () => status(),
    checks: (res, before) => [
      noFileChanges(before),
      check('report is substantive (>300 chars)', res.final.length > 300, `${res.final.length} chars`),
      check('covers secrets and inputs/XSS', /secret/i.test(res.final) && /(xss|input|inject|innerHTML|localStorage)/i.test(res.final)),
      check('does not print secret-looking values', !SECRET_RE.test(res.final)),
    ],
  },
  {
    id: 'test',
    prompt: '/vibe-test the timer module',
    maxTurns: 50,
    before: () => ({ n: countTests(), src: sourceFiles().map((f) => [f, read(f)]) }),
    checks: (res, b) => {
      const t = runTests();
      const srcChanged = b.src.filter(([f, c]) => read(f) !== c).map(([f]) => f);
      return [
        check('tests pass when I run them', t.ok && t.pass > 0, `pass=${t.pass} fail=${t.fail}`),
        check('number of tests did not decrease', countTests() >= b.n, `${b.n} -> ${countTests()}`),
        check('production code untouched', srcChanged.length === 0, srcChanged.join(', ')),
        check('final answer lists tests added and commands run', /test/i.test(res.final) && /(node --test|npm test)/i.test(res.final)),
      ];
    },
  },
  {
    id: 'explain-th',
    prompt: '/vibe-explain project อธิบายโปรเจกต์นี้ให้คนที่ไม่ใช่โปรแกรมเมอร์เข้าใจ เป็นภาษาไทย',
    maxTurns: 25,
    before: () => status(),
    checks: (res, before) => {
      const names = listFiles().filter((f) => !f.startsWith('docs/') && !isTestFile(f)).map((f) => path.basename(f));
      return [
        noFileChanges(before),
        check('answers in Thai (>=30% Thai letters)', thaiRatio(res.final) >= 0.3, `${Math.round(thaiRatio(res.final) * 100)}%`),
        check('mentions real project files by name (>=2)', names.filter((n) => res.final.includes(n)).length >= 2, `known: ${names.slice(0, 6).join(', ')}`),
      ];
    },
  },
  {
    id: 'brief',
    prompt: '/vibe-brief play a short beep when a focus session ends',
    maxTurns: 25,
    before: () => status(),
    checks: (res, before) => [
      noFileChanges(before),
      check('brief has GOAL, SCOPE, ACCEPTANCE, VERIFY', ['GOAL', 'SCOPE', 'ACCEPTANCE', 'VERIFY'].every((k) => res.final.includes(k))),
      check('uses real file names from the project', sourceFiles().some((f) => res.final.includes(path.basename(f)))),
      check('brief is short (<=45 lines)', res.final.split('\n').length <= 45, `${res.final.split('\n').length} lines`),
    ],
  },
  {
    id: 'handoff',
    prompt: '/vibe-handoff remember: the beep feature is next',
    maxTurns: 25,
    checks: () => {
      const h = read('docs/HANDOFF.md') ?? '';
      return [
        check('HANDOFF.md rewritten (no template text)', h.length > 300 && !/Not started yet/.test(h)),
        check('has State, Next steps and How to run sections', /##\s*State/i.test(h) && /##\s*Next steps/i.test(h) && /##\s*How to run/i.test(h)),
        check('records the note I gave (beep)', /beep/i.test(h)),
        check('mentions real files', listFiles().filter((f) => !f.startsWith('docs/')).some((f) => h.includes(path.basename(f)))),
        check('no secrets', !SECRET_RE.test(h)),
      ];
    },
  },
  {
    id: 'resume',
    prompt: '/vibe-resume',
    maxTurns: 25,
    before: () => status(),
    checks: (res, before) => [
      noFileChanges(before),
      check('summary mentions the beep next step', /beep/i.test(res.final)),
      check('summary is short (<=18 lines)', res.final.split('\n').length <= 18, `${res.final.split('\n').length} lines`),
      check('verified the project state (ran a command or read git)', res.commands.some((c) => /git (status|log)|node --test|npm test/.test(c))),
    ],
  },
  {
    id: 'ship',
    prompt: '/vibe-ship v0.1.0',
    maxTurns: 50,
    before: () => ({ tags: git('tag').stdout }),
    checks: (res, b) => {
      const t = runTests();
      return [
        check('did not push, tag remotely or publish', !res.commands.some((c) => /git push|npm publish|gh release/.test(c))),
        check('did not create a tag without being asked', git('tag').stdout === b.tags),
        check('reports PASS/FAIL/SKIPPED per gate', /PASS/.test(res.final) && /(SKIPPED|FAIL|PASS)/.test(res.final)),
        check('its claim about tests agrees with reality', !t.ok ? !/tests?[^\n]{0,40}PASS/i.test(res.final) : true, `real tests ok=${t.ok}`),
        check('proposes a commit message / tag', /(commit message|v0\.1\.0)/i.test(res.final)),
      ];
    },
  },
];

/** Break the code in a way the existing tests notice, so /vibe-fix has a real, objective bug. */
function seedBug() {
  const MUTATIONS = [
    [/Math\.floor\(/, 'Math.ceil('], [/ % 60/, ' % 61'], [/padStart\(2, ?['"]0['"]\)/, "padStart(1, '0')"], [/ - 1\b/, ' + 1'],
    [/ <= /, ' < '], [/ < /, ' <= '], [/=== 0\b/, '=== 1'], [/ >= /, ' > '], [/ \+= 1\b/, ' += 2'], [/ \* 60\b/, ' * 61'],
  ];
  const base = runTests();
  if (!base.ok) return;
  git('add', '-A');
  git('commit', '-q', '-m', 'wip: before user edit', '--allow-empty');
  for (const f of sourceFiles()) {
    const original = read(f);
    for (const [re, repl] of MUTATIONS) {
      const m = re.exec(original);
      if (!m) continue;
      fs.writeFileSync(path.join(PROJ, f), original.replace(re, repl));
      const t = runTests();
      if (!t.ok) {
        state.bugSeeded = true;
        state.bugFile = f;
        state.bugOriginal = m[0];
        state.bugMutated = repl;
        state.bugReport = t.out.split('\n').slice(-60).join('\n').slice(-3500);
        git('add', '-A');
        git('commit', '-q', '-m', 'wip: user edit');
        state.seedCommit = headSha();
        console.log(`  seeded bug: ${f}: "${m[0]}" -> "${repl}"`);
        return;
      }
      fs.writeFileSync(path.join(PROJ, f), original);
    }
  }
}

// ------------------------------------------------------------------ main

git('init', '-q', '-b', 'main');
git('config', 'user.name', 'e2e');
git('config', 'user.email', 'e2e@example.com');

console.log(`E2E: model=${MODEL} dir=${PROJ}`);
const report = { model: MODEL, dir: PROJ, startedAt: new Date().toISOString(), steps: [] };

for (const step of STEPS) {
  if (ONLY?.length && !ONLY.includes(step.id)) continue;
  console.log(`\n== ${step.id}`);
  step.prepare?.();
  if (step.skipIf?.()) {
    console.log('  skipped (precondition not met)');
    report.steps.push({ id: step.id, skipped: true, checks: [] });
    continue;
  }
  const before = step.before?.();
  const prompt = typeof step.prompt === 'function' ? step.prompt() : step.prompt;
  let res = claude(prompt, { maxTurns: step.maxTurns, label: step.id });
  let followedUp = false;
  if (step.followUp && !exists('docs/SPEC.md') && !res.timedOut) {
    followedUp = true;
    console.log('  command stopped to ask questions; answering with "use your defaults" (--continue)');
    const second = spawnSync('claude', ['-p', step.followUp, '--continue', '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--max-turns', String(step.maxTurns),
      '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash'], { cwd: PROJ, encoding: 'utf8', env: ENV, timeout: TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
    fs.writeFileSync(path.join(LOGS, `${step.id}-followup.jsonl`), second.stdout || '');
    const again = [];
    for (const l of (second.stdout || '').split('\n')) {
      try {
        const o = JSON.parse(l);
        if (o.type === 'result') Object.assign(res, { final: String(o.result ?? ''), turns: res.turns + (o.num_turns ?? 0), cost: res.cost + (o.total_cost_usd ?? 0) });
        for (const p of o.message?.content ?? []) if (p.type === 'tool_use' && p.input?.command) again.push(String(p.input.command).slice(0, 300));
      } catch { /* ignore */ }
    }
    res.commands.push(...again);
  }
  step.after?.();
  let checks;
  try {
    checks = step.checks(res, before);
  } catch (e) {
    checks = [check('checks ran without error', false, e.message)];
  }
  const cmdHooks = res.blocks.length;
  const row = {
    id: step.id, turns: res.turns, costUsd: Number(res.cost.toFixed(3)), seconds: Math.round(res.durationMs / 1000), followedUp,
    timedOut: res.timedOut, isError: res.isError, subtype: res.subtype, slashCommandsSeen: res.slash.length, guardBlocks: res.blocks, denials: res.denials,
    toolCounts: res.tools, checks, finalExcerpt: res.final.slice(0, 700),
  };
  report.steps.push(row);
  const failed = checks.filter((c) => !c.pass);
  console.log(`  ${checks.length - failed.length}/${checks.length} checks passed | ${res.turns} turns | $${row.costUsd} | ${row.seconds}s${followedUp ? ' | asked questions' : ''}${cmdHooks ? ` | guard blocks: ${cmdHooks}` : ''}${res.timedOut ? ' | TIMED OUT' : ''}`);
  for (const c of failed) console.log(`    FAIL ${c.name}${c.detail ? ` -> ${c.detail}` : ''}`);
  for (const b of res.blocks) console.log(`    GUARD ${b.replace(/\s+/g, ' ').slice(0, 160)}`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
}

report.finishedAt = new Date().toISOString();
const all = report.steps.flatMap((s) => s.checks);
report.summary = {
  checks: all.length, passed: all.filter((c) => c.pass).length, failed: all.filter((c) => !c.pass).length,
  guardBlocks: report.steps.reduce((n, s) => n + (s.guardBlocks?.length ?? 0), 0),
  totalCostUsd: Number(report.steps.reduce((n, s) => n + (s.costUsd ?? 0), 0).toFixed(2)),
  totalMinutes: Number((report.steps.reduce((n, s) => n + (s.seconds ?? 0), 0) / 60).toFixed(1)),
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nSUMMARY ${MODEL}: ${report.summary.passed}/${report.summary.checks} checks passed, ${report.summary.guardBlocks} guard blocks, $${report.summary.totalCostUsd}, ${report.summary.totalMinutes} min`);
console.log(`Report: ${path.join(OUT, 'report.json')}`);
process.exitCode = report.summary.failed ? 1 : 0;
