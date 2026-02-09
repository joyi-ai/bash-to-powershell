import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

const GREP_FLAGS = [
  { short: 'r', long: 'recursive' },
  { short: 'R', long: 'dereference-recursive' },
  { short: 'i', long: 'ignore-case' },
  { short: 'n', long: 'line-number' },
  { short: 'l', long: 'files-with-matches' },
  { short: 'L', long: 'files-without-match' },
  { short: 'c', long: 'count' },
  { short: 'v', long: 'invert-match' },
  { short: 'w', long: 'word-regexp' },
  { short: 'x', long: 'line-regexp' },
  { short: 'E', long: 'extended-regexp' },
  { short: 'F', long: 'fixed-strings' },
  { short: 'P', long: 'perl-regexp' },
  { short: 'o', long: 'only-matching' },
  { short: 'q', long: 'quiet' },
  { short: 'H', long: 'with-filename' },
  { short: 'h', long: 'no-filename' },
  { short: 'm', long: 'max-count', takesValue: true },
  { short: 'A', long: 'after-context', takesValue: true },
  { short: 'B', long: 'before-context', takesValue: true },
  { short: 'C', long: 'context', takesValue: true },
  { short: 'e', long: 'regexp', takesValue: true },
  { long: 'include', takesValue: true },
  { long: 'exclude', takesValue: true },
  { long: 'exclude-dir', takesValue: true },
  { long: 'color', takesValue: true },
  { long: 'colour', takesValue: true },
];

export function grepTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, GREP_FLAGS);
  const { flags, positional } = parsed;

  const pattern = (flags['regexp'] as string) ?? positional[0] ?? '';
  const files = (flags['regexp'] ? positional : positional.slice(1));
  const recursive = !!(flags['recursive'] || flags['dereference-recursive']);
  const ignoreCase = !!flags['ignore-case'];
  const lineNumber = !!flags['line-number'];
  const filesOnly = !!flags['files-with-matches'];
  const filesWithout = !!flags['files-without-match'];
  const count = !!flags['count'];
  const invert = !!flags['invert-match'];
  const onlyMatch = !!flags['only-matching'];
  const quiet = !!flags['quiet'];
  const fixedStrings = !!flags['fixed-strings'];
  const include = flags['include'] as string | undefined;
  const exclude = flags['exclude'] as string | undefined;
  const excludeDir = flags['exclude-dir'] as string | undefined;
  const maxCount = flags['max-count'] as string | undefined;
  const afterCtx = flags['after-context'] as string | undefined;
  const beforeCtx = flags['before-context'] as string | undefined;
  const contextLines = flags['context'] as string | undefined;

  // Prefer ripgrep
  if (ctx.tools.rg) {
    const parts: string[] = ['rg'];
    if (fixedStrings) parts.push('-F');
    if (ignoreCase) parts.push('-i');
    if (!ignoreCase) parts.push('-s'); // rg is smart-case by default
    if (lineNumber) parts.push('-n');
    if (filesOnly) parts.push('-l');
    if (filesWithout) parts.push('--files-without-match');
    if (count) parts.push('-c');
    if (invert) parts.push('-v');
    if (onlyMatch) parts.push('-o');
    if (quiet) parts.push('-q');
    if (maxCount) parts.push('-m', maxCount);
    if (afterCtx) parts.push('-A', afterCtx);
    if (beforeCtx) parts.push('-B', beforeCtx);
    if (contextLines) parts.push('-C', contextLines);
    if (include) parts.push('-g', `'${include}'`);
    if (exclude) parts.push('-g', `'!${exclude}'`);
    if (excludeDir) parts.push('-g', `'!${excludeDir}/**'`);
    if (!recursive && files.length === 0) parts.push('--no-recursive');
    parts.push(`'${pattern.replace(/'/g, "''")}'`);
    if (files.length > 0) {
      parts.push(...files.map(f => `'${f.replace(/'/g, "''")}'`));
    }
    return { command: parts.join(' '), warnings: [], usedFallback: false };
  }

  // Fallback: Select-String
  const parts: string[] = [];

  if (recursive || files.length === 0) {
    // Need Get-ChildItem for recursion
    const gcParts = ['Get-ChildItem'];
    if (recursive) gcParts.push('-Recurse');
    gcParts.push('-File');
    if (files.length > 0) {
      gcParts.push('-Path', files.map(f => `'${f.replace(/'/g, "''")}'`).join(','));
    }
    if (include) gcParts.push('-Include', `'${include}'`);
    if (exclude) gcParts.push('-Exclude', `'${exclude}'`);
    parts.push(gcParts.join(' '), '|');
  }

  parts.push('Select-String');
  const escapedPattern = pattern.replace(/'/g, "''");
  parts.push('-Pattern', fixedStrings ? `-SimpleMatch '${escapedPattern}'` : `'${escapedPattern}'`);

  if (!recursive && files.length > 0) {
    parts.push('-Path', files.map(f => `'${f.replace(/'/g, "''")}'`).join(','));
  }
  if (!ignoreCase) parts.push('-CaseSensitive');
  if (invert) parts.push('-NotMatch');

  if (filesOnly) {
    parts.push('| Select-Object -Unique -ExpandProperty Path');
  } else if (count) {
    parts.push('| Group-Object Path | Select-Object Name, Count');
  }

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}
