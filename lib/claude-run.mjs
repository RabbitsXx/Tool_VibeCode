import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Run one non-interactive Claude Code call and digest its stream-json log.
 * Everything returned is read from the log, not from what the model claims.
 * @returns {{final: string, turns: number, costUsd: number, durationMs: number, isError: boolean, limited: boolean, timedOut: boolean,
 *   tools: Record<string, number>, commands: string[], guardMessages: string[], denials: string[], usage: object, raw: string}}
 */
export function runClaude({ cwd, prompt, model = 'sonnet', maxTurns = 30, timeoutMs = 20 * 60_000, logPath, extraArgs = [] }) {
  const argv = ['-p', prompt, '--model', model, '--output-format', 'stream-json', '--verbose', '--max-turns', String(maxTurns),
    '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash', ...extraArgs];
  const t0 = Date.now();
  const r = spawnSync('claude', argv, {
    cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024,
  });
  const raw = `${r.stdout || ''}`;
  if (logPath) fs.writeFileSync(logPath, raw);

  const info = {
    final: '', turns: 0, costUsd: 0, durationMs: Date.now() - t0, isError: false, limited: false,
    timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT'), tools: {}, commands: [], guardMessages: [], denials: [], usage: {}, raw,
  };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    for (const p of Array.isArray(o.message?.content) ? o.message.content : []) {
      if (p.type === 'tool_use') {
        info.tools[p.name] = (info.tools[p.name] ?? 0) + 1;
        if (p.input?.command) info.commands.push(String(p.input.command));
      }
      if (p.type === 'tool_result') {
        const text = typeof p.content === 'string' ? p.content : JSON.stringify(p.content);
        if (/\[vibe-guard\]/.test(text)) info.guardMessages.push(text.slice(0, 400));
        else if (/has been denied|Permission to use|requires approval|not allowed/i.test(text)) info.denials.push(text.slice(0, 300));
      }
    }
    if (o.type === 'result') {
      info.final = String(o.result ?? '');
      info.turns = o.num_turns ?? 0;
      info.costUsd = o.total_cost_usd ?? 0;
      info.isError = Boolean(o.is_error);
      info.usage = o.usage ?? {};
    }
  }
  info.limited = /session limit|usage[_ ]limit|rate[_ ]limit|hit your .*limit/i.test(`${info.final}${raw.slice(-2000)}`) && (info.isError || info.turns <= 1);
  return info;
}

/** Total prompt-side tokens (fresh + cache writes + cache reads) of a result's usage block. */
export const inputTokens = (u = {}) => (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
