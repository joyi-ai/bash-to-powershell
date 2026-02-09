import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

export function echoTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));

  let noNewline = false;
  let interpretEscapes = false;
  let argStart = 0;

  // Parse echo flags: -n (no newline), -e (interpret escapes), -E (no escapes, default)
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '-n') { noNewline = true; argStart = i + 1; }
    else if (rawArgs[i] === '-e') { interpretEscapes = true; argStart = i + 1; }
    else if (rawArgs[i] === '-E') { argStart = i + 1; }
    else if (rawArgs[i] === '-ne' || rawArgs[i] === '-en') {
      noNewline = true; interpretEscapes = true; argStart = i + 1;
    }
    else break;
  }

  const valueArgs = cmd.args.slice(argStart);
  const translatedArgs = valueArgs.map(a => tw(a, ctx));
  const value = translatedArgs.join(' ') || "''";

  if (interpretEscapes) {
    // The args have already been translated. If the original had $'...' the lexer
    // already expanded escapes. For echo -e with double-quoted "\n", we need to
    // replace literal \n with `n for PS double-quoted strings.
    // Simplest approach: emit as double-quoted with PS escapes.
    let escapedValue = value;
    // If value is single-quoted, we need to convert
    if (escapedValue.startsWith("'") && escapedValue.endsWith("'")) {
      const inner = escapedValue.slice(1, -1).replace(/''/g, "'");
      escapedValue = '"' + convertBashEscapes(inner) + '"';
    } else if (escapedValue.startsWith('"') && escapedValue.endsWith('"')) {
      const inner = escapedValue.slice(1, -1);
      escapedValue = '"' + convertBashEscapes(inner) + '"';
    } else {
      escapedValue = '"' + convertBashEscapes(escapedValue) + '"';
    }

    if (noNewline) {
      return { command: `Write-Host -NoNewline ${escapedValue}`, warnings: [], usedFallback: true };
    }
    return { command: `Write-Output ${escapedValue}`, warnings: [], usedFallback: true };
  }

  if (noNewline) {
    return { command: `Write-Host -NoNewline ${value}`, warnings: [], usedFallback: true };
  }

  return { command: `Write-Output ${value}`, warnings: [], usedFallback: true };
}

function convertBashEscapes(s: string): string {
  return s
    .replace(/\\n/g, '`n')
    .replace(/\\t/g, '`t')
    .replace(/\\r/g, '`r')
    .replace(/\\a/g, '`a')
    .replace(/\\b/g, '`b')
    .replace(/\\\\/g, '\\')
    .replace(/\\0/g, '`0');
}

export function printfTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const translatedArgs = cmd.args.map(a => tw(a, ctx));

  if (rawArgs.length === 0) {
    return { command: "Write-Host ''", warnings: [], usedFallback: true };
  }

  // First arg is the format string
  let format = rawArgs[0];
  const args = translatedArgs.slice(1);

  // Convert printf format to PS: %s → {0}, %d → {1}, etc.
  let argIdx = 0;
  let psFormat = '';
  let i = 0;
  while (i < format.length) {
    if (format[i] === '%' && i + 1 < format.length) {
      const next = format[i + 1];
      if (next === 's' || next === 'd' || next === 'f' || next === 'i') {
        psFormat += `{${argIdx++}}`;
        i += 2;
        continue;
      }
      if (next === '%') {
        psFormat += '%';
        i += 2;
        continue;
      }
      // Handle width specifiers like %-10s, %5d
      let j = i + 1;
      while (j < format.length && /[0-9.\-]/.test(format[j])) j++;
      if (j < format.length && /[sdfi]/.test(format[j])) {
        psFormat += `{${argIdx++}}`;
        i = j + 1;
        continue;
      }
    }
    if (format[i] === '\\') {
      if (i + 1 < format.length) {
        const esc = format[i + 1];
        if (esc === 'n') { psFormat += '`n'; i += 2; continue; }
        if (esc === 't') { psFormat += '`t'; i += 2; continue; }
        if (esc === 'r') { psFormat += '`r'; i += 2; continue; }
        if (esc === '\\') { psFormat += '\\'; i += 2; continue; }
      }
    }
    psFormat += format[i++];
  }

  if (args.length > 0) {
    return {
      command: `Write-Host -NoNewline ("${psFormat.replace(/"/g, '`"')}" -f ${args.join(',')})`,
      warnings: [],
      usedFallback: true,
    };
  }

  return {
    command: `Write-Host -NoNewline "${psFormat.replace(/"/g, '`"')}"`,
    warnings: [],
    usedFallback: true,
  };
}
