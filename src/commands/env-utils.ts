import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

export function exportTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const cmds: string[] = [];

  for (const arg of rawArgs) {
    if (arg === '-p' || arg === '--print') {
      cmds.push('Get-ChildItem Env:');
      continue;
    }
    if (arg === '-n') {
      // export -n VAR → unset
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0) {
      const name = arg.slice(0, eq);
      const value = arg.slice(eq + 1);
      cmds.push(`$env:${name} = '${value.replace(/'/g, "''")}'`);
    } else {
      // export VAR (without value) — in bash this exports existing var to env
      // In PS, env vars are always accessible, so this is a no-op
      cmds.push(`# export ${arg}: already in environment`);
    }
  }

  return { command: cmds.join('; ') || '# export: no arguments', warnings: [], usedFallback: true };
}

export function unsetTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a)).filter(a => !a.startsWith('-'));

  if (rawArgs.length === 0) {
    return { command: '# unset: no variable specified', warnings: [], usedFallback: true };
  }

  const cmds = rawArgs.map(v => `Remove-Item Env:\\${v} -ErrorAction SilentlyContinue`);
  return { command: cmds.join('; '), warnings: [], usedFallback: true };
}

export function envTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));

  if (rawArgs.length === 0) {
    return { command: 'Get-ChildItem Env:', warnings: [], usedFallback: true };
  }

  // env VAR=value cmd → set env and run cmd
  const assignments: string[] = [];
  let cmdStart = 0;
  for (let i = 0; i < rawArgs.length; i++) {
    const eq = rawArgs[i].indexOf('=');
    if (eq > 0 && /^[a-zA-Z_]/.test(rawArgs[i])) {
      const name = rawArgs[i].slice(0, eq);
      const value = rawArgs[i].slice(eq + 1);
      assignments.push(`$env:${name} = '${value.replace(/'/g, "''")}'`);
      cmdStart = i + 1;
    } else {
      break;
    }
  }

  if (cmdStart < rawArgs.length) {
    const remaining = rawArgs.slice(cmdStart).join(' ');
    return {
      command: `${assignments.join('; ')}; ${remaining}`,
      warnings: [],
      usedFallback: true,
    };
  }

  if (assignments.length > 0) {
    return { command: assignments.join('; '), warnings: [], usedFallback: true };
  }

  return { command: 'Get-ChildItem Env:', warnings: [], usedFallback: true };
}
