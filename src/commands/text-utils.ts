import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

// ============================================================
// sort
// ============================================================

export function sortTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'r', long: 'reverse' },
    { short: 'n', long: 'numeric-sort' },
    { short: 'u', long: 'unique' },
    { short: 'k', long: 'key', takesValue: true },
    { short: 't', long: 'field-separator', takesValue: true },
    { short: 'f', long: 'ignore-case' },
  ]);

  const reverse = !!parsed.flags['reverse'];
  const numeric = !!parsed.flags['numeric-sort'];
  const unique = !!parsed.flags['unique'];
  const files = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  const parts: string[] = [];
  if (files.length > 0) {
    parts.push(`Get-Content ${files.join(',')}`);
    parts.push('|');
  }
  parts.push('Sort-Object');
  if (numeric) parts.push('{ [int]$_ }');
  if (reverse) parts.push('-Descending');
  if (unique) parts.push('-Unique');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// uniq
// ============================================================

export function uniqTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'c', long: 'count' },
    { short: 'd', long: 'repeated' },
    { short: 'u', long: 'unique' },
    { short: 'i', long: 'ignore-case' },
  ]);

  const count = !!parsed.flags['count'];
  const repeated = !!parsed.flags['repeated'];
  const uniqueOnly = !!parsed.flags['unique'];
  const files = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (count) {
    let base = files.length > 0 ? `Get-Content ${files.join(',')} | ` : '';
    return {
      command: `${base}Group-Object | ForEach-Object { '{0,7} {1}' -f $_.Count, $_.Name }`,
      warnings: [],
      usedFallback: true,
    };
  }

  if (repeated) {
    let base = files.length > 0 ? `Get-Content ${files.join(',')} | ` : '';
    return {
      command: `${base}Group-Object | Where-Object { $_.Count -gt 1 } | Select-Object -ExpandProperty Name`,
      warnings: [],
      usedFallback: true,
    };
  }

  let base = files.length > 0 ? `Get-Content ${files.join(',')} | ` : '';
  return { command: `${base}Get-Unique`, warnings: [], usedFallback: true };
}

// ============================================================
// tr
// ============================================================

export function trTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'd', long: 'delete' },
    { short: 's', long: 'squeeze-repeats' },
  ]);

  const doDelete = !!parsed.flags['delete'];
  const squeeze = !!parsed.flags['squeeze-repeats'];
  const sets = parsed.positional;

  if (doDelete && sets.length >= 1) {
    const charset = trSetToRegex(sets[0]);
    return {
      command: `ForEach-Object { $_ -replace '${charset}','' }`,
      warnings: [],
      usedFallback: true,
    };
  }

  if (sets.length >= 2) {
    const from = sets[0];
    const to = sets[1];

    // Common case: tr 'a-z' 'A-Z' (case conversion)
    if (from === 'a-z' && to === 'A-Z') {
      return { command: 'ForEach-Object { $_.ToUpper() }', warnings: [], usedFallback: true };
    }
    if (from === 'A-Z' && to === 'a-z') {
      return { command: 'ForEach-Object { $_.ToLower() }', warnings: [], usedFallback: true };
    }
    if (from === '[:upper:]' && to === '[:lower:]') {
      return { command: 'ForEach-Object { $_.ToLower() }', warnings: [], usedFallback: true };
    }
    if (from === '[:lower:]' && to === '[:upper:]') {
      return { command: 'ForEach-Object { $_.ToUpper() }', warnings: [], usedFallback: true };
    }

    // Single char replacement
    if (from.length === 1 && to.length === 1) {
      return {
        command: `ForEach-Object { $_ -replace '${escapeRegex(from)}','${to}' }`,
        warnings: [],
        usedFallback: true,
      };
    }

    // General case: character-by-character translation
    return {
      command: `ForEach-Object { $_ -replace '[${escapeRegex(from)}]','${to}' }`,
      warnings: ['tr: complex character translation may not be exact'],
      usedFallback: true,
    };
  }

  return { command: '# tr: insufficient arguments', warnings: ['tr: missing arguments'], usedFallback: true };
}

function trSetToRegex(set: string): string {
  if (set === '\\n') return '\\n';
  if (set === '\\t') return '\\t';
  return `[${escapeRegex(set)}]`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// tee
// ============================================================

export function teeTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'a', long: 'append' },
  ]);

  const append = !!parsed.flags['append'];
  const files = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (files.length === 0) {
    return { command: 'Tee-Object', warnings: [], usedFallback: true };
  }

  const parts = ['Tee-Object', '-FilePath', files[0]];
  if (append) parts.push('-Append');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// diff
// ============================================================

export function diffTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'u', long: 'unified' },
    { short: 'r', long: 'recursive' },
    { short: 'q', long: 'brief' },
    { short: 'i', long: 'ignore-case' },
    { short: 'w', long: 'ignore-all-space' },
    { long: 'color', takesValue: true },
  ]);

  const files = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (files.length < 2) {
    return { command: 'Compare-Object', warnings: ['diff: need two files'], usedFallback: true };
  }

  return {
    command: `Compare-Object (Get-Content ${files[0]}) (Get-Content ${files[1]})`,
    warnings: [],
    usedFallback: true,
  };
}

// ============================================================
// xargs
// ============================================================

export function xargsTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'I', takesValue: true },
    { short: 'n', long: 'max-args', takesValue: true },
    { short: '0', long: 'null' },
    { short: 'd', long: 'delimiter', takesValue: true },
    { short: 'p', long: 'interactive' },
    { short: 't', long: 'verbose' },
  ]);

  const replaceStr = parsed.flags['I'] as string | undefined;
  const command = parsed.positional.join(' ') || 'echo';

  if (replaceStr) {
    // xargs -I{} cmd {} → ForEach-Object { cmd $_ }
    const psCmd = command.replace(new RegExp(escapeRegex(replaceStr), 'g'), '$_');
    return {
      command: `ForEach-Object { ${psCmd} }`,
      warnings: [],
      usedFallback: true,
    };
  }

  // Default: append each line as argument
  return {
    command: `ForEach-Object { ${command} $_ }`,
    warnings: [],
    usedFallback: true,
  };
}
