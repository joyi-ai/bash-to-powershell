import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

const FIND_FLAGS = [
  { long: 'name', takesValue: true },
  { long: 'iname', takesValue: true },
  { long: 'type', takesValue: true },
  { long: 'path', takesValue: true },
  { long: 'not' },
  { long: 'maxdepth', takesValue: true },
  { long: 'mindepth', takesValue: true },
  { long: 'exec', takesValue: true },
  { long: 'delete' },
  { long: 'print' },
  { long: 'print0' },
  { long: 'size', takesValue: true },
  { long: 'mtime', takesValue: true },
  { long: 'newer', takesValue: true },
  { long: 'empty' },
  { long: 'prune' },
];

export function findTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));

  // Parse find's unique argument style: find [path...] [expression...]
  // Expressions start with - or ( or ! or ,
  let searchPaths: string[] = [];
  let exprArgs: string[] = [];
  let inExpr = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (!inExpr && !arg.startsWith('-') && arg !== '!' && arg !== '(' && arg !== ')') {
      searchPaths.push(arg);
    } else {
      inExpr = true;
      exprArgs.push(arg);
    }
  }

  if (searchPaths.length === 0) searchPaths = ['.'];

  // Parse expressions manually (find has a unique syntax)
  let namePattern: string | null = null;
  let inamePattern: string | null = null;
  let typeFilter: string | null = null;
  let maxDepth: string | null = null;
  let minDepth: string | null = null;
  let notPath: string | null = null;
  let doDelete = false;
  let isEmpty = false;
  let execCmd: string[] = [];
  let isNot = false;

  for (let i = 0; i < exprArgs.length; i++) {
    const arg = exprArgs[i];
    if (arg === '!' || arg === '-not') { isNot = true; continue; }
    if (arg === '-name' && i + 1 < exprArgs.length) {
      if (isNot) { isNot = false; i++; continue; } // skip negated names for simplicity
      namePattern = exprArgs[++i];
      continue;
    }
    if (arg === '-iname' && i + 1 < exprArgs.length) {
      inamePattern = exprArgs[++i]; continue;
    }
    if (arg === '-type' && i + 1 < exprArgs.length) {
      typeFilter = exprArgs[++i]; continue;
    }
    if (arg === '-maxdepth' && i + 1 < exprArgs.length) {
      maxDepth = exprArgs[++i]; continue;
    }
    if (arg === '-mindepth' && i + 1 < exprArgs.length) {
      minDepth = exprArgs[++i]; continue;
    }
    if (arg === '-path' && i + 1 < exprArgs.length) {
      if (isNot) { notPath = exprArgs[++i]; isNot = false; continue; }
      i++; continue;
    }
    if (arg === '-delete') { doDelete = true; continue; }
    if (arg === '-empty') { isEmpty = true; continue; }
    if (arg === '-exec') {
      i++;
      while (i < exprArgs.length && exprArgs[i] !== ';' && exprArgs[i] !== '+') {
        execCmd.push(exprArgs[i++]);
      }
      continue;
    }
    if (arg === '-prune' || arg === '-print' || arg === '-print0') continue;
    isNot = false;
  }

  // Prefer fd
  if (ctx.tools.fd) {
    const parts: string[] = ['fd'];
    if (typeFilter === 'f') parts.push('-t', 'f');
    else if (typeFilter === 'd') parts.push('-t', 'd');
    else if (typeFilter === 'l') parts.push('-t', 'l');
    if (maxDepth) parts.push('-d', maxDepth);
    if (isEmpty) parts.push('-e');
    if (namePattern) {
      // fd uses regex by default, convert glob to pattern
      const pattern = globToFdPattern(namePattern);
      parts.push('-g', `'${pattern}'`);
    } else if (inamePattern) {
      parts.push('-i', '-g', `'${globToFdPattern(inamePattern)}'`);
    }
    if (notPath) {
      parts.push('-E', `'${notPath}'`);
    }
    for (const p of searchPaths) {
      if (p !== '.') parts.push(`'${p}'`);
    }
    if (doDelete) parts.push('-X', 'Remove-Item');
    if (execCmd.length > 0) {
      const execStr = execCmd.join(' ').replace(/\{\}/g, '{}');
      parts.push('-x', execStr);
    }
    return { command: parts.join(' '), warnings: [], usedFallback: false };
  }

  // Fallback: Get-ChildItem
  const parts: string[] = ['Get-ChildItem'];
  parts.push('-Path', searchPaths.map(p => `'${p}'`).join(','));
  parts.push('-Recurse');

  if (typeFilter === 'f') parts.push('-File');
  else if (typeFilter === 'd') parts.push('-Directory');

  if (maxDepth) parts.push('-Depth', maxDepth);

  const filters: string[] = [];

  if (namePattern) {
    parts.push('-Filter', `'${namePattern}'`);
  } else if (inamePattern) {
    parts.push('-Filter', `'${inamePattern}'`);
  }

  if (notPath) {
    filters.push(`$_.FullName -notlike '${notPath}'`);
  }

  if (isEmpty) {
    filters.push('$_.Length -eq 0');
  }

  let result = parts.join(' ');
  if (filters.length > 0) {
    result += ` | Where-Object { ${filters.join(' -and ')} }`;
  }

  if (doDelete) {
    result += ' | Remove-Item -Force';
  }

  if (execCmd.length > 0) {
    const psExec = execCmd.join(' ').replace(/\{\}/g, '$_.FullName');
    result += ` | ForEach-Object { ${psExec} }`;
  }

  return { command: result, warnings: [], usedFallback: true };
}

function globToFdPattern(glob: string): string {
  // fd -g accepts globs directly, just pass through
  return glob;
}
