import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

export function awkTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const warnings: string[] = [];

  let fieldSep: string | null = null;
  let program = '';
  let files: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '-F' && i + 1 < rawArgs.length) {
      fieldSep = rawArgs[++i];
    } else if (rawArgs[i].startsWith('-F') && rawArgs[i].length > 2) {
      fieldSep = rawArgs[i].slice(2);
    } else if (!program && !rawArgs[i].startsWith('-')) {
      program = rawArgs[i];
    } else if (program && !rawArgs[i].startsWith('-')) {
      files.push(rawArgs[i]);
    }
  }

  if (!program) {
    return { command: '# awk: no program specified', warnings: ['awk: missing program'], usedFallback: true };
  }

  const result = translateAwkProgram(program, fieldSep);
  if (!result) {
    warnings.push(`awk: complex program not fully translatable: ${program}`);
    return {
      command: `# awk '${program}' → manual translation needed`,
      warnings,
      usedFallback: true,
    };
  }

  if (files.length > 0) {
    const escapedFiles = files.map(f => `'${f.replace(/'/g, "''")}'`);
    return {
      command: `Get-Content ${escapedFiles.join(',')} | ${result}`,
      warnings,
      usedFallback: true,
    };
  }

  return { command: result, warnings, usedFallback: true };
}

function translateAwkProgram(program: string, fieldSep: string | null): string | null {
  const sep = fieldSep ? `'${fieldSep}'` : "' '";

  // Common pattern: {print $N} where N >= 1
  const printFieldMatch = program.match(/^\{\s*print\s+\$([1-9]\d*)\s*\}$/);
  if (printFieldMatch) {
    const fieldIdx = parseInt(printFieldMatch[1], 10) - 1;
    return `ForEach-Object { ($_ -split ${sep})[${fieldIdx}] }`;
  }

  // {print $N, $M} or {print $N " " $M}
  const multiFieldMatch = program.match(/^\{\s*print\s+([\$\d\s,"]+)\s*\}$/);
  if (multiFieldMatch) {
    const fields = multiFieldMatch[1].match(/\$([1-9]\d*)/g);
    if (fields) {
      const indices = fields.map(f => parseInt(f.slice(1), 10) - 1);
      const parts = indices.map(idx => `($_ -split ${sep})[${idx}]`);
      return `ForEach-Object { ${parts.join(" + ' ' + ")} }`;
    }
  }

  // {print $0} or {print} — pass through
  if (program.match(/^\{\s*print(\s+\$0)?\s*\}$/)) {
    return 'ForEach-Object { $_ }';
  }

  // NR==N — select line by number
  const nrMatch = program.match(/^NR\s*==\s*(\d+)$/);
  if (nrMatch) {
    const line = parseInt(nrMatch[1], 10);
    return `Select-Object -Skip ${line - 1} -First 1`;
  }

  // /pattern/ { print } or /pattern/
  const patternMatch = program.match(/^\/(.+)\/(\s*\{\s*print\s*\})?$/);
  if (patternMatch) {
    return `Where-Object { $_ -match '${patternMatch[1]}' }`;
  }

  // {print NF} — print number of fields
  if (program.match(/^\{\s*print\s+NF\s*\}$/)) {
    return `ForEach-Object { ($_ -split ${sep}).Count }`;
  }

  // BEGIN/END blocks or complex programs — can't translate
  return null;
}
