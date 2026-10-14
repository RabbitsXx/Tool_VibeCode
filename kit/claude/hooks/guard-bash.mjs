#!/usr/bin/env node
// PreToolUse hook for Bash / PowerShell: blocks a short list of catastrophic or
// policy-breaking commands. Exit 2 = block (stderr is shown to Claude).
// Fail-open by design: any internal error lets the command through, so a bug here can never brick a session.
// Disable entirely by launching Claude Code with VIBE_GUARD_OFF=1 in the environment.
import { pathToFileURL } from 'node:url';

const DANGEROUS_ROOTS = new Set([
  '/', '/*', '~', '~/', '~/*', '$home', '$home/', '$home/*', '${home}', '*', '.', '..', './', '../', './*', '../*',
  '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/opt', '/proc', '/root', '/sbin', '/sys', '/usr', '/var',
  '/users', '/mnt', '/c', '/d', '/f', '/c/', '/d/', '/f/',
  '$env:userprofile', '$env:systemroot', '$env:windir',
]);

const isDriveRoot = (t) => /^[a-z]:[\\/]*\*?$/i.test(t) || /^[a-z]:[\\/](windows|users|program files.*)[\\/]*$/i.test(t);

function tokenize(segment) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function splitSegments(command) {
  return command.split(/&&|\|\||[;|\n&]/).map((s) => s.trim()).filter(Boolean);
}

function stripPrefixes(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase();
    if (t === 'sudo' || t === 'command' || t === 'nohup' || t === 'time' || t === 'env' || /^[a-z_][a-z0-9_]*=/i.test(tokens[i])) i++;
    else break;
  }
  return tokens.slice(i);
}

function rmIsDangerous(tokens) {
  const [cmd, ...args] = tokens;
  const name = cmd.toLowerCase().replace(/\.exe$/, '').split(/[\\/]/).pop();
  if (!['rm', 'rmdir', 'del', 'erase', 'rd', 'remove-item', 'ri'].includes(name)) return false;
  const flags = args.filter((a) => a.startsWith('-') || (name !== 'rm' && /^\/[a-z]$/i.test(a))).map((a) => a.toLowerCase());
  const recursive = flags.some((f) => /^-[a-z]*r[a-z]*$/.test(f) || f === '--recursive' || f === '-recurse' || f === '/s');
  if (!recursive) return false;
  const paths = args.filter((a) => !a.startsWith('-') && !/^\/[a-z]$/i.test(a));
  return paths.some((p) => {
    const t = p.toLowerCase().replace(/\\/g, '/');
    return DANGEROUS_ROOTS.has(t) || DANGEROUS_ROOTS.has(t.replace(/\/+$/, '')) || isDriveRoot(p);
  });
}

const PATTERNS = [
  [/\bgit\s+(?:-\S+\s+\S+\s+)*push\b[^;&|\n]*\s(?:--force(?!-with-lease)|-f)(?:\s|$)/i,
    'Force-push is blocked. Use --force-with-lease on a feature branch, and only after the user explicitly asks.'],
  [/\bgit\b[^;&|\n]*\b(?:commit|push|merge|rebase|cherry-pick)\b[^;&|\n]*\s--no-verify\b/i,
    'Skipping git hooks (--no-verify) is blocked. Fix the failing check instead.'],
  [/\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/i,
    'Piping a download into a shell is blocked. Download the script, read it, then run it.'],
  [/\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n]*\|\s*(?:iex|invoke-expression)\b/i,
    'Piping a download into Invoke-Expression is blocked. Download the script, read it, then run it.'],
  [/\b(?:iex|invoke-expression)\s*\(\s*(?:iwr|irm|invoke-webrequest|invoke-restmethod|\(new-object)/i,
    'Executing downloaded code directly is blocked. Download the script, read it, then run it.'],
  [/\bdd\b[^\n]*\bof=\/dev\/(?!null|stdout|stderr)/i, 'Writing raw data to a device is blocked.'],
  [/\bmkfs(?:\.\w+)?\b|\bdiskpart\b|\bformat\s+[a-z]:/i, 'Formatting/partitioning disks is blocked.'],
  [/:\(\)\s*\{\s*:\s*\|\s*:&\s*\}\s*;\s*:/, 'Fork bomb blocked.'],
  [/\bchmod\s+-R\s+0?777\s+(?:\/|~|\$HOME)(?:\s|$)/i, 'Recursive chmod 777 on a root/home directory is blocked.'],
  [/\b(?:del|erase)\b[^\n]*\s\/s\b[^\n]*\s[a-z]:\\(?:\s|$|\*)/i, 'Recursive delete of a drive root is blocked.'],
  [/\breg(?:\.exe)?\s+delete\s+hk(?:lm|cr|u)\b/i, 'Deleting registry hives is blocked.'],
];

const SQL_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'mongosh', 'duckdb']);
const DESTRUCTIVE_SQL = /\b(?:drop\s+(?:database|schema)|truncate\s+table)\b/i;

/** @returns {string|null} reason to block, or null to allow */
export function evaluate(command) {
  if (typeof command !== 'string' || !command.trim()) return null;
  for (const [re, reason] of PATTERNS) if (re.test(command)) return reason;
  for (const segment of splitSegments(command)) {
    const tokens = stripPrefixes(tokenize(segment));
    const name = tokens[0]?.toLowerCase().replace(/\.exe$/, '').split(/[\\/]/).pop();
    if (SQL_CLIENTS.has(name) && DESTRUCTIVE_SQL.test(command)) {
      return 'Destructive SQL (DROP DATABASE/SCHEMA, TRUNCATE) is blocked. Ask the user and prefer a migration with a backup.';
    }
    if (tokens.length && rmIsDangerous(tokens)) {
      return 'Recursive delete of a root, home, drive or whole-directory target is blocked. Name the exact subdirectory to delete.';
    }
  }
  return null;
}

async function main() {
  if (process.env.VIBE_GUARD_OFF === '1') return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const reason = evaluate(input?.tool_input?.command);
  if (reason) {
    process.stderr.write(`[vibe-guard] ${reason}\n(Bypass only with the user's consent: launch Claude Code with VIBE_GUARD_OFF=1.)\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => process.exit(0));
}
