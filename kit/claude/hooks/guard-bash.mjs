#!/usr/bin/env node
// PreToolUse hook for Bash / PowerShell.
//
//   deny  - catastrophic or policy-breaking commands: exit 2, stderr is shown to Claude.
//   ask   - risky but sometimes legitimate commands: the user gets a permission prompt with the reason.
//
// It understands command structure (quotes, ; && || | separators, $(...) and `...` substitutions, heredocs,
// `bash -c`, `powershell -Command/-EncodedCommand`, `cmd /c`, `eval`, sudo/env/nohup/time/timeout prefixes), so
// text that merely *mentions* a dangerous command (commit messages, echo, heredoc file bodies) is not blocked.
//
// Fail-open by design: any internal error lets the command through, so a bug here can never brick a session.
// Disable entirely by launching Claude Code with VIBE_GUARD_OFF=1 in the environment.
import { pathToFileURL } from 'node:url';

const DENY = 'deny';
const ASK = 'ask';
const MAX_DEPTH = 4;

// ---------------------------------------------------------------- path classification

const SYSTEM_DIRS = new Set([
  '/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/opt', '/proc', '/root', '/sbin', '/sys', '/usr', '/var', '/srv',
  '/mnt', '/media', '/home', '/users', '/applications', '/library', '/system', '/private',
]);
const HOME_VARS = new Set([
  '~', '$home', '${home}', '%userprofile%', '%homepath%', '$env:userprofile', '$env:homepath',
  '$env:systemroot', '$env:windir', '$env:systemdrive', '%systemroot%', '%windir%', '%systemdrive%',
]);

/** True for "/", home, drive roots, system dirs, whole user-profile dirs. `broad` also counts *, . and .. */
export function isRootLike(raw, { broad = false } = {}) {
  let p = String(raw).trim().replaceAll('\\', '/').toLowerCase();
  p = p.replace(/\/\*+$/, '/').replace(/\/+$/, '');
  if (p === '') return true; // "/" or "/*"
  if (HOME_VARS.has(p)) return true;
  if (/^~[^/]*$/.test(p)) return true; // ~someuser
  if (/^[a-z]:$/.test(p) || /^\/[a-z]$/.test(p)) return true; // C:\  or msys /c
  if (SYSTEM_DIRS.has(p)) return true;
  if (/^(?:[a-z]:|\/[a-z])?\/(?:users|home)\/[^/]+$/.test(p)) return true; // a whole home directory
  if (/^(?:[a-z]:|\/[a-z])?\/(?:users|home|windows|program files(?: \(x86\))?|programdata)$/.test(p)) return true;
  return broad && (p === '*' || p === '.' || p === '..');
}

// ---------------------------------------------------------------- command scanner

function matchParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Split a command into segments of tokens, honouring quotes. Also collects $(...) and `...` contents.
 * @returns {{segments: {tokens: string[], raw: string, piped: boolean}[], subs: string[], unbalanced: boolean}}
 */
function scan(cmd, { quotes = true, backticks = true } = {}) {
  const segments = [];
  const subs = [];
  let tokens = [];
  let tok = '';
  let hasTok = false;
  let inS = false;
  let inD = false;
  let segStart = 0;
  let piped = false;

  const endTok = () => {
    // Fallback mode (unbalanced quotes, Windows "C:\" paths): quote characters are noise, drop them.
    if (!quotes) tok = tok.replace(/["']/g, '');
    if (hasTok && (tok !== '' || quotes)) tokens.push(tok);
    tok = '';
    hasTok = false;
  };
  const endSeg = (i, nextPiped, opLen) => {
    endTok();
    if (tokens.length) segments.push({ tokens, raw: cmd.slice(segStart, i).trim(), piped });
    tokens = [];
    piped = nextPiped;
    segStart = i + opLen;
  };
  const collectSub = (i) => {
    const c = cmd[i];
    if (c === '$' && cmd[i + 1] === '(') {
      const end = matchParen(cmd, i + 1);
      if (end > 0) subs.push(cmd.slice(i + 2, end));
    } else if (c === '`' && backticks) {
      const end = cmd.indexOf('`', i + 1);
      if (end > 0) subs.push(cmd.slice(i + 1, end));
    }
  };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const n = cmd[i + 1];

    if (quotes && inS) {
      if (c === "'") inS = false;
      else tok += c;
      continue;
    }
    if (quotes && inD) {
      if (c === '\\' && (n === '"' || n === '$' || n === '`')) {
        tok += n;
        i++;
        continue;
      }
      if (c === '"') {
        inD = false;
        continue;
      }
      collectSub(i);
      tok += c;
      continue;
    }

    if (quotes && c === "'") { inS = true; hasTok = true; continue; }
    if (quotes && c === '"') { inD = true; hasTok = true; continue; }
    collectSub(i);

    if (c === '#' && !hasTok && (i === 0 || /\s/.test(cmd[i - 1]))) {
      while (i < cmd.length && cmd[i] !== '\n') i++; // comment to end of line
      i--;
      continue;
    }
    if (c === '\n' || c === ';') { endSeg(i, false, 1); continue; }
    if (c === '&' && n === '&') { endSeg(i, false, 2); i++; continue; }
    if (c === '|' && n === '|') { endSeg(i, false, 2); i++; continue; }
    if (c === '|') {
      const len = n === '&' ? 2 : 1;
      endSeg(i, true, len);
      i += len - 1;
      continue;
    }
    if (c === '&') {
      const prev = cmd[i - 1];
      if (prev === '>' || prev === '<' || n === '>') { tok += c; hasTok = true; continue; } // 2>&1, &>
      endSeg(i, false, 1);
      continue;
    }
    if (/\s/.test(c)) { endTok(); continue; }
    tok += c;
    hasTok = true;
  }
  const unbalanced = inS || inD;
  endSeg(cmd.length, false, 0);
  return { segments, subs, unbalanced };
}

/** Remove heredoc bodies: their text is file/message content, not commands. */
function stripHeredocs(cmd) {
  return cmd.replace(/(<<-?\s*(['"]?)([A-Za-z_][\w-]*)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g, '$1');
}

const baseName = (t) => String(t).toLowerCase().split(/[\\/]/).pop().replace(/\.(?:exe|cmd|bat)$/, '');

/** Drop sudo/env/nohup/time/nice/timeout and VAR=value prefixes. */
function stripPrefixes(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const name = baseName(tokens[i]);
    if (name === 'sudo' || name === 'doas' || name === 'env') {
      i++;
      // skip the wrapper's own options (some take a value: sudo -u root, env -u NAME)
      while (i < tokens.length && tokens[i].startsWith('-') && tokens[i] !== '--') {
        i += ['-u', '-g', '-h', '-p', '-r', '-t', '-C', '-U', '-D'].includes(tokens[i]) ? 2 : 1;
      }
      if (tokens[i] === '--') i++;
      continue;
    }
    if (['command', 'builtin', 'nohup', 'time', 'exec'].includes(name)) { i++; continue; }
    if (name === 'nice' || name === 'timeout' || name === 'stdbuf') {
      i++;
      while (i < tokens.length && /^(?:-\S*|\d+[smhd]?)$/.test(tokens[i])) i++;
      continue;
    }
    if (/^[a-z_][a-z0-9_]*=/i.test(tokens[i])) { i++; continue; }
    break;
  }
  return tokens.slice(i);
}


// ---------------------------------------------------------------- writes through the shell

const ENV_SAFE = /\.(example|sample|template|dist|defaults?)$/i;

/** Files the agent must not create or overwrite from the shell either (mirrors guard-write's hard-deny list). */
function protectedTarget(raw) {
  const p = String(raw).replaceAll('\\', '/');
  const base = (p.split('/').pop() ?? '').toLowerCase();
  if (!base) return null;
  if (/^\.env(\..+)?$/.test(base) && !ENV_SAFE.test(base)) return 'a real .env file (use .env.example and tell the user which variables to set)';
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(base)) return 'a key/certificate file';
  if (['.netrc', '_netrc', '.git-credentials', '.pypirc'].includes(base) || /(^|\/)\.(ssh|aws|gnupg)\//.test(p)) return 'a credentials file';
  if (/(^|\/)\.git\//.test(p)) return 'the .git directory (use git commands)';
  if (/(^|\/)\.claude\/vibe\//.test(p)) return 'the Tool_VibeCode guard files';
  return null;
}

const REDIRECT = /^(?:\d*|&)(>>?|>\|)(.*)$/;

/** Targets of `>`, `>>`, `>|`, `&>`, `tee`, and the destination of cp/mv/install. */
function writeTargets(name, tokens) {
  const targets = [];
  for (let i = 0; i < tokens.length; i++) {
    const m = REDIRECT.exec(tokens[i]);
    if (!m) continue;
    if (m[2]) targets.push(m[2].startsWith('&') ? '' : m[2]);
    else if (tokens[i + 1]) targets.push(tokens[i + 1]);
  }
  const args = tokens.slice(1).filter((a) => !a.startsWith('-') && !REDIRECT.test(a));
  if (name === 'tee') targets.push(...args);
  if (['set-content', 'add-content', 'out-file', 'new-item', 'copy-item', 'move-item'].includes(name)) {
    // PowerShell cmdlets: the target is the value of -Path/-FilePath/-Destination, else the first (or, for copy/move, last) positional
    const i = tokens.findIndex((t) => /^-(?:path|literalpath|filepath|destination|lp|pspath)$/i.test(t));
    const copyLike = name === 'copy-item' || name === 'move-item';
    const fromTemplate = copyLike && args.length > 1 && args.slice(0, -1).every((s) => ENV_SAFE.test(s));
    if (i >= 0 && tokens[i + 1]) targets.push(tokens[i + 1]);
    else if (args.length && !fromTemplate) targets.push(copyLike ? args.at(-1) : args[0]);
  } else if (['cp', 'mv', 'install', 'copy', 'move'].includes(name) && args.length) {
    const sources = args.slice(0, -1);
    // `cp .env.example .env` is the standard setup step and copies only placeholders
    const fromTemplate = ['cp', 'copy'].includes(name) && sources.length > 0 && sources.every((s) => ENV_SAFE.test(s));
    if (!fromTemplate) targets.push(args.at(-1));
  }
  return targets.filter(Boolean);
}

// ---------------------------------------------------------------- rules

const hit = (action, reason) => ({ action, reason });

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'ash']);
const POWERSHELLS = new Set(['powershell', 'pwsh']);
const INTERPRETERS = new Set([...SHELLS, ...POWERSHELLS, 'python', 'python3', 'python2', 'node', 'perl', 'ruby', 'php', 'iex', 'invoke-expression']);
const DOWNLOADER_RE = /(?:^|[\s(;|&])(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)(?:\.exe)?\b|downloadstring|downloadfile/i;
const SQL_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'mongosh', 'duckdb']);
const DESTRUCTIVE_SQL = /\b(?:drop\s+(?:database|schema)|truncate\s+table)\b/i;

const RAW_RULES = [
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, DENY, 'Fork bomb.'],
  [/>\s*\/dev\/(?:sd[a-z]|nvme\d|hd[a-z]|disk\d|mmcblk)/i, DENY, 'Writing to a raw disk device.'],
  [/\b(?:ba|z|da|k)?sh\b[^|;&\n]*(?:<\(|\$\()\s*(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b/i, ASK,
    'Executes a script downloaded from the internet without reading it first.'],
  [/\b(?:iex|invoke-expression)\b[^\n]*(?:\b(?:iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b|downloadstring)/i, ASK,
    'Executes code downloaded from the internet without reading it first.'],
];

function rmCheck(name, args) {
  const cmdFamily = ['del', 'erase', 'rd', 'rmdir'].includes(name);
  const unixRm = name === 'rm';
  const psRm = ['remove-item', 'ri'].includes(name);
  if (!unixRm && !psRm && !cmdFamily) return null;

  let recursive = false;
  const paths = [];
  for (const a of args) {
    const l = a.toLowerCase();
    if (l.startsWith('--')) {
      if (l === '--recursive') recursive = true;
      continue;
    }
    if (l.startsWith('-') && l.length > 1) {
      if (/^-[a-z]*r[a-z]*$/.test(l) && (unixRm || psRm)) recursive = true; // -r -rf -fr -Rf
      if (psRm && 'recurse'.startsWith(l.slice(1))) recursive = true; // -Recurse, -rec
      continue;
    }
    if (cmdFamily && /^\/[a-z]$/i.test(a)) {
      if (l === '/s') recursive = true;
      continue;
    }
    paths.push(a);
  }
  if (!recursive) return null;
  const bad = paths.find((p) => isRootLike(p, { broad: true }));
  return bad === undefined ? null : hit(DENY,
    `Recursive delete of "${bad}" (a root, home, drive, system directory, or the whole current directory) is blocked. Name the exact subdirectory to delete.`);
}

function gitCheck(tokens) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'].includes(tokens[i]) ? 2 : 1;
  }
  const sub = tokens[i];
  const args = tokens.slice(i + 1);
  if (!sub) return null;

  if (sub === 'push') {
    const forced = args.some((a) => a === '--force' || a === '--mirror' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+[^\s+]/.test(a));
    if (forced) return hit(DENY, 'Force-push is blocked. Use --force-with-lease on a feature branch, and only after the user explicitly asks (they can run it themselves).');
  }
  if (['commit', 'push', 'merge', 'rebase', 'cherry-pick', 'am', 'revert'].includes(sub)) {
    const skips = args.includes('--no-verify') || (sub === 'commit' && args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a)));
    if (skips) return hit(ASK, 'Skips git hooks (--no-verify). Fix the failing check instead unless the user really wants this.');
  }
  return null;
}

function findCheck(args) {
  const end = args.findIndex((a) => a.startsWith('-') || a === '(' || a === '!');
  const starts = end < 0 ? args : args.slice(0, end);
  const deleting = args.includes('-delete')
    || args.some((a, k) => (a === '-exec' || a === '-execdir') && baseName(args[k + 1] ?? '') === 'rm');
  if (deleting && starts.some((p) => isRootLike(p))) return hit(DENY, 'find ... -delete / -exec rm on a root, home or drive is blocked.');
  return null;
}

/**
 * Would this interpreter execute whatever arrives on stdin as its program?
 * `node -e '...'`, `python3 -c '...'`, `bash script.sh` use stdin as data; `bash`, `bash -s`, `python -`, `iex` run it.
 */
function runsStdinAsProgram(name, args) {
  if (name === 'iex' || name === 'invoke-expression') return true;
  const inline = POWERSHELLS.has(name)
    ? args.some((a) => /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i.test(a) || /^-e/i.test(a))
    : args.some((a) => /^-[a-z]*[cepr]$/.test(a) || a === '--eval' || a === '--print' || a === '--command');
  if (inline) return false;
  const stdinFlag = args.includes('-s') || args.includes('-');
  const positional = args.filter((a) => !a.startsWith('-'));
  return stdinFlag || positional.length === 0;
}

function checkSegment(seg, prev, ctx) {
  const tokens = stripPrefixes(seg.tokens);
  if (!tokens.length) return null;
  const name = baseName(tokens[0]);
  const args = tokens.slice(1);

  // curl ... | sh
  if (seg.piped && prev && INTERPRETERS.has(name) && runsStdinAsProgram(name, args) && DOWNLOADER_RE.test(prev.raw)) {
    return hit(ASK, 'Pipes a download straight into an interpreter. Download the script, read it, then run it.');
  }

  // wrappers: look inside the script they run
  if (SHELLS.has(name)) {
    const i = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    if (i >= 0 && args[i + 1] !== undefined) return check(args[i + 1], ctx);
  }
  if (POWERSHELLS.has(name)) {
    const i = args.findIndex((a) => /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i.test(a));
    if (i >= 0) return check(args.slice(i + 1).join(' '), ctx);
    const e = args.findIndex((a) => /^-e(?:n(?:c(?:o(?:d(?:e(?:d(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?)?)?)?)?)?)?)?$/i.test(a));
    if (e >= 0 && args[e + 1]) {
      try {
        return check(Buffer.from(args[e + 1], 'base64').toString('utf16le'), ctx);
      } catch { /* undecodable: ignore */ }
    }
  }
  if (name === 'cmd') {
    const i = args.findIndex((a) => /^\/[ck]$/i.test(a));
    if (i >= 0) return check(args.slice(i + 1).join(' '), ctx);
  }
  if (name === 'eval') return check(args.join(' '), ctx);

  const rm = rmCheck(name, args);
  if (rm) return rm;

  for (const target of writeTargets(name, tokens)) {
    const what = protectedTarget(target);
    if (what) return hit(DENY, `Writing "${target}" from the shell is blocked: it is ${what}.`);
  }

  if (name === 'git') return gitCheck(tokens);
  if (name === 'find') return findCheck(args);

  if (['chmod', 'chown', 'chgrp'].includes(name) && args.some((a) => a === '--recursive' || /^-[a-zA-Z]*R[a-zA-Z]*$/.test(a))) {
    const target = args.find((a) => !a.startsWith('-') && isRootLike(a));
    if (target !== undefined) return hit(DENY, `Recursive ${name} on "${target}" is blocked.`);
  }

  if (name === 'dd' && args.some((a) => /^of=(?:\/dev\/(?!(?:null|zero|stdout|stderr|tty)$)|\\\\\.\\)/i.test(a))) {
    return hit(DENY, 'dd writing to a raw device is blocked.');
  }
  if (/^mkfs(?:\..+)?$/.test(name) || ['mkswap', 'wipefs', 'diskpart'].includes(name)) {
    return hit(DENY, `${name} (disk formatting/partitioning) is blocked.`);
  }
  if (name === 'format' && args.some((a) => /^[a-z]:\\?$/i.test(a))) return hit(DENY, 'Formatting a drive is blocked.');
  if (name === 'reg' && /^delete$/i.test(args[0] ?? '') && /^hk[a-z]+(?:\\(?:system|software|sam|security))?\\?$/i.test(args[1] ?? '')) {
    return hit(DENY, 'Deleting a registry hive is blocked.');
  }

  if (SQL_CLIENTS.has(name) && DESTRUCTIVE_SQL.test(ctx.original)) {
    return hit(ASK, 'Destructive SQL (DROP DATABASE/SCHEMA, TRUNCATE TABLE). Confirm the target database and that a backup exists.');
  }
  return null;
}

function check(command, ctx) {
  if (ctx.depth >= MAX_DEPTH || typeof command !== 'string' || !command.trim()) return null;
  const inner = { ...ctx, depth: ctx.depth + 1 };
  const text = stripHeredocs(command);

  for (const [re, action, reason] of RAW_RULES) if (re.test(text)) return hit(action, reason);

  const opts = { backticks: ctx.shell !== 'PowerShell' };
  let sc = scan(text, opts);
  if (sc.unbalanced) sc = scan(text, { ...opts, quotes: false });

  let askHit = null;
  for (const sub of sc.subs) {
    const r = check(sub, inner);
    if (r?.action === DENY) return r;
    askHit ??= r;
  }
  for (let i = 0; i < sc.segments.length; i++) {
    const r = checkSegment(sc.segments[i], sc.segments[i - 1], inner);
    if (r?.action === DENY) return r;
    askHit ??= r;
  }
  return askHit;
}

/**
 * @param {string} command
 * @param {{shell?: string}} [opts] shell: tool name ("Bash" | "PowerShell")
 * @returns {{action: 'deny'|'ask', reason: string}|null}
 */
export function evaluate(command, opts = {}) {
  return check(command, { depth: 0, shell: opts.shell, original: String(command ?? '') });
}

async function main() {
  if (process.env.VIBE_GUARD_OFF === '1') return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const result = evaluate(input?.tool_input?.command, { shell: input?.tool_name });
  if (!result) return;
  if (result.action === ASK) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `[vibe-guard] ${result.reason}`,
      },
    }));
    return;
  }
  process.stderr.write(`[vibe-guard] ${result.reason}\n(If the user really wants this, they can run it in their own terminal, or relaunch Claude Code with VIBE_GUARD_OFF=1.)\n`);
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => process.exit(0));
}
