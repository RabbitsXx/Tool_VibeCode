#!/usr/bin/env node
// PreToolUse hook for Write / Edit / MultiEdit / NotebookEdit:
//   1. blocks edits to files that should never be hand-edited (.env, keys, lockfiles, .git, node_modules)
//   2. blocks content that contains something that looks like a real secret
// Exit 2 = block (stderr is shown to Claude). Fail-open on internal errors.
// Disable by launching Claude Code with VIBE_GUARD_OFF=1.
import { pathToFileURL } from 'node:url';

const ENV_SAFE = /\.(example|sample|template|dist|defaults?)$/i;

const PROTECTED = [
  [(p, base) => /^\.env(\..+)?$/i.test(base) && !ENV_SAFE.test(base),
    'Real .env files hold secrets. Edit .env.example instead and tell the user which variables to set.'],
  [(p, base) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(base),
    'Key/certificate files must not be written by the agent.'],
  [(p) => /(^|\/)\.git\//.test(p), 'Do not edit files inside .git/. Use git commands.'],
  [(p) => /(^|\/)node_modules\//.test(p), 'Do not edit node_modules. Change your own code or patch via the package manager.'],
  [(p, base) => ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'poetry.lock', 'Cargo.lock', 'composer.lock', 'Gemfile.lock', 'uv.lock'].includes(base),
    'Lockfiles are generated. Change dependencies with the package manager (npm/pnpm/uv/...), not by hand.'],
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

/** @returns {string|null} reason to block, or null to allow */
export function evaluate(toolInput) {
  const file = String(toolInput?.file_path ?? toolInput?.notebook_path ?? '');
  if (file) {
    const p = file.replaceAll('\\', '/');
    const base = p.split('/').pop() ?? '';
    for (const [test, reason] of PROTECTED) if (test(p, base)) return `${reason} (${base})`;
  }
  const text = contentsOf(toolInput);
  if (text && !text.includes(ALLOW_MARKER)) {
    const safeFile = ENV_SAFE.test(file);
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(text) && !safeFile) {
        return `Content looks like it contains a real secret (${name}). Read it from an environment variable instead, and put a placeholder in .env.example. If this is a deliberate fixture, add the comment "${ALLOW_MARKER}".`;
      }
    }
  }
  return null;
}

async function main() {
  if (process.env.VIBE_GUARD_OFF === '1') return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const reason = evaluate(input?.tool_input);
  if (reason) {
    process.stderr.write(`[vibe-guard] ${reason}\n(Bypass only with the user's consent: launch Claude Code with VIBE_GUARD_OFF=1.)\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => process.exit(0));
}
