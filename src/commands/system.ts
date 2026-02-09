import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

// ============================================================
// which
// ============================================================

export function whichTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a)).filter(a => !a.startsWith('-'));
  if (rawArgs.length === 0) {
    return { command: 'Get-Command', warnings: [], usedFallback: true };
  }
  const cmds = rawArgs.map(c => `'${c.replace(/'/g, "''")}'`);
  if (cmds.length === 1) {
    return {
      command: `(Get-Command ${cmds[0]} -ErrorAction SilentlyContinue).Source`,
      warnings: [],
      usedFallback: true,
    };
  }
  return {
    command: cmds.map(c => `(Get-Command ${c} -ErrorAction SilentlyContinue).Source`).join('; '),
    warnings: [],
    usedFallback: true,
  };
}

// ============================================================
// ps
// ============================================================

export function psTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'e', long: 'every' },
    { short: 'f', long: 'full' },
    { short: 'u', long: 'user', takesValue: true },
    { short: 'p', long: 'pid', takesValue: true },
    { long: 'sort', takesValue: true },
  ]);

  const user = parsed.flags['user'] as string | undefined;
  const pid = parsed.flags['pid'] as string | undefined;

  const parts = ['Get-Process'];
  if (pid) parts.push(`-Id ${pid}`);

  const filters: string[] = [];
  if (user) filters.push(`$_.StartInfo.UserName -like '*${user}*'`);

  let result = parts.join(' ');
  if (filters.length > 0) {
    result += ` | Where-Object { ${filters.join(' -and ')} }`;
  }

  return { command: result, warnings: [], usedFallback: true };
}

// ============================================================
// kill
// ============================================================

export function killTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 's', long: 'signal', takesValue: true },
    { short: '9' },
    { short: 'f' },
  ]);

  const pids = parsed.positional;
  const force = !!(parsed.flags['9'] || parsed.flags['f']);
  const signal = parsed.flags['signal'] as string | undefined;

  if (signal === 'SIGKILL' || signal === '9' || signal === 'KILL') {
    return {
      command: `Stop-Process -Id ${pids.join(',')} -Force`,
      warnings: [],
      usedFallback: true,
    };
  }

  const parts = ['Stop-Process', '-Id', pids.join(',')];
  if (force) parts.push('-Force');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}
