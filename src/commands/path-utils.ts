import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

export function basenameTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const path = rawArgs[0] ?? '';
  const suffix = rawArgs[1];

  let result = `Split-Path -Leaf '${path.replace(/'/g, "''")}'`;
  if (suffix) {
    result = `(Split-Path -Leaf '${path.replace(/'/g, "''")}') -replace '${suffix.replace(/'/g, "''")}$',''`;
  }
  return { command: result, warnings: [], usedFallback: true };
}

export function dirnameTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const path = rawArgs[0] ?? '';
  return {
    command: `Split-Path -Parent '${path.replace(/'/g, "''")}'`,
    warnings: [],
    usedFallback: true,
  };
}

export function realpathTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const path = rawArgs[0] ?? '.';
  return {
    command: `(Resolve-Path '${path.replace(/'/g, "''")}').Path`,
    warnings: [],
    usedFallback: true,
  };
}

export function readlinkTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a)).filter(a => !a.startsWith('-'));
  const path = rawArgs[0] ?? '';

  // readlink -f is like realpath
  const allArgs = cmd.args.map(a => wordRawString(a));
  if (allArgs.includes('-f') || allArgs.includes('--canonicalize')) {
    return {
      command: `(Resolve-Path '${path.replace(/'/g, "''")}').Path`,
      warnings: [],
      usedFallback: true,
    };
  }

  return {
    command: `(Get-Item '${path.replace(/'/g, "''")}').Target`,
    warnings: [],
    usedFallback: true,
  };
}
