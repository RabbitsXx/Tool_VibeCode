#!/usr/bin/env node
// PreToolUse hook for Write / Edit / MultiEdit / NotebookEdit.
//
//   deny - files that must never be hand-edited by the agent (real .env, keys, credentials, .git/, node_modules,
//          lockfiles, the kit's own guard hooks) and content that looks like a real secret.
//   ask  - config that can change what the agent is allowed to do or what runs in CI
//          (.claude/settings*.json, .mcp.json, .github/workflows, git-hook managers): the user gets a prompt.
//
// Exit 2 = deny (stderr shown to Claude). "ask" is returned as JSON. Fail-open on internal errors.
// Disable by launching Claude Code with VIBE_GUARD_OFF=1.
import { pathToFileURL } from 'node:url';

const ENV_SAFE = /\.(example|sample|template|dist|defaults?)$/i;
const hit = (action, reason) => ({ action, reason });

const RULES = [
  // [test(path, base), action, reason]
  [(p, b) => /^\.env(\..+)?$/i.test(b) && !ENV_SAFE.test(b), 'deny',
    'Real .env files hold secrets. Edit .env.example instead and tell the user which variables to set.'],
  [(p, b) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(b) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(b), 'deny',
    'Key/certificate files must not be written by the agent.'],
  [(p, b) => ['.netrc', '_netrc', '.git-credentials', '.pypirc', 'credentials'].includes(b.toLowerCase()) || /(^|\/)\.(ssh|aws|gnupg)\//.test(p), 'deny',
    'Credential files must not be written by the agent.'],
  [(p) => /(^|\/)\.git\//.test(p), 'deny', 'Do not edit files inside .git/. Use git commands.'],
  [(p) => /(^|\/)node_modules\//.test(p), 'deny', 'Do not edit node_modules. Change your own code or patch via the package manager.'],
  [(p, b) => ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'poetry.lock', 'cargo.lock', 'composer.lock', 'gemfile.lock', 'uv.lock']
    .includes(b.toLowerCase()), 'deny',
  'Lockfiles are generated. Change dependencies with the package manager (npm/pnpm/uv/...), not by hand.'],
  [(p) => /(^|\/)\.claude\/vibe\//.test(p), 'deny',
    'These are the Tool_VibeCode guard files. Change them in the kit repository and re-run `vibe install`.'],
  [(p, b) => /(^|\/)\.claude\/settings(\.local)?\.json$/.test(p) || b === '.mcp.json', 'ask',
    'Changes Claude Code permissions / hooks / MCP servers, which control what the agent may do.'],
  [(p) => /(^|\/)\.github\/workflows\//.test(p) || /(^|\/)\.husky\//.test(p) || /(^|\/)(lefthook|\.pre-commit-config)\.ya?ml$/.test(p), 'ask',
    'Changes CI / git-hook automation, which runs with the project\'s credentials.'],
];

const SECRET_PATTERNS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}/],
  ['Stripe live key', /\b[sr]k_live_[0-9A-Za-z]{20,}/],
  ['Discord bot token', /\b[MNO][A-Za-z\d_-]{23,25}\.[\w-]{6}\.[\w-]{27,}\b/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
];

const ALLOW_MARKER = 'vibe-allow-secret';

function contentsOf(toolInput = {}) {
  const parts = [];
  for (const k of ['content', 'new_string', 'new_source']) if (typeof toolInput[k] === 'string') parts.push(toolInput[k]);
  for (const e of toolInput.edits ?? []) if (typeof e?.new_string === 'string') parts.push(e.new_string);
  return parts.join('\n');
}

/** @returns {{action: 'deny'|'ask', reason: string}|null} */
export function evaluate(toolInput) {
  const file = String(toolInput?.file_path ?? toolInput?.notebook_path ?? '');
  let ask = null;
  if (file) {
    const p = file.replaceAll('\\', '/');
    const base = p.split('/').pop() ?? '';
    for (const [test, action, reason] of RULES) {
      if (!test(p, base)) continue;
      if (action === 'deny') return hit('deny', `${reason} (${base})`);
      ask ??= hit('ask', `${reason} (${base})`);
    }
  }
  const text = contentsOf(toolInput);
  // Example files are NOT exempt: a real key pasted into .env.example gets committed, which is exactly the leak
  // we want to stop (found by the A/B test). Deliberate fixtures use the marker comment.
  if (text && !text.includes(ALLOW_MARKER)) {
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(text)) {
        return hit('deny', `Content looks like it contains a real secret (${name}). Read it from an environment variable instead, and put a placeholder in .env.example. If this is a deliberate fixture, add the comment "${ALLOW_MARKER}".`);
      }
    }
  }
  return ask;
}

async function main() {
  if (process.env.VIBE_GUARD_OFF === '1') return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const result = evaluate(input?.tool_input);
  if (!result) return;
  if (result.action === 'ask') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `[vibe-guard] ${result.reason}`,
      },
    }));
    return;
  }
  process.stderr.write(`[vibe-guard] ${result.reason}\n(If the user really wants this, they can do it themselves, or relaunch Claude Code with VIBE_GUARD_OFF=1.)\n`);
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => process.exit(0));
}
