import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

export function sedTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const warnings: string[] = [];

  let inPlace = false;
  let inPlaceBackup: string | null = null;
  let expressions: string[] = [];
  let files: string[] = [];
  let quiet = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '-i' || arg === '--in-place') {
      inPlace = true;
      // Check if next arg is a backup suffix (not starting with s/ or a flag)
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-') && !isSedExpr(rawArgs[i + 1])) {
        inPlaceBackup = rawArgs[++i];
      }
    } else if (arg.startsWith('-i') && arg.length > 2) {
      inPlace = true;
      inPlaceBackup = arg.slice(2);
    } else if (arg === '-e' || arg === '--expression') {
      if (i + 1 < rawArgs.length) expressions.push(rawArgs[++i]);
    } else if (arg === '-n' || arg === '--quiet' || arg === '--silent') {
      quiet = true;
    } else if (arg === '-E' || arg === '-r' || arg === '--regexp-extended') {
      // Extended regex — PS uses .NET regex by default which is close enough
    } else if (arg.startsWith('-')) {
      // Unknown flag, skip
    } else if (expressions.length === 0 && isSedExpr(arg)) {
      expressions.push(arg);
    } else {
      files.push(arg);
    }
  }

  if (expressions.length === 0) {
    return { command: '# sed: no expression provided', warnings: ['sed: missing expression'], usedFallback: true };
  }

  const psCommands: string[] = [];

  for (const expr of expressions) {
    const parsed = parseSedExpression(expr);
    if (!parsed) {
      warnings.push(`sed: could not parse expression: ${expr}`);
      continue;
    }
    psCommands.push(parsed);
  }

  if (psCommands.length === 0) {
    return { command: `# sed: unsupported expression`, warnings, usedFallback: true };
  }

  const escapedFiles = files.map(f => `'${f.replace(/'/g, "''")}'`);

  if (inPlace && files.length > 0) {
    // In-place editing
    if (inPlaceBackup) {
      const backupCmd = escapedFiles.map(f =>
        `Copy-Item ${f} (${f} + '${inPlaceBackup}')`
      ).join('; ');
      const editCmds = escapedFiles.map(f => {
        const chain = psCommands.join(' | ');
        return `(Get-Content ${f}) | ${chain} | Set-Content ${f}`;
      });
      return {
        command: `${backupCmd}; ${editCmds.join('; ')}`,
        warnings,
        usedFallback: true,
      };
    }

    const editCmds = escapedFiles.map(f => {
      if (psCommands.length === 1 && psCommands[0].startsWith('ForEach-Object')) {
        return `$content = Get-Content ${f}; $content | ${psCommands[0]} | Set-Content ${f}`;
      }
      return `$content = Get-Content ${f}; ($content | ${psCommands.join(' | ')}) | Set-Content ${f}`;
    });
    return { command: editCmds.join('; '), warnings, usedFallback: true };
  }

  // Non-in-place: output to stdout
  if (files.length > 0) {
    const chain = psCommands.join(' | ');
    return {
      command: `Get-Content ${escapedFiles.join(',')} | ${chain}`,
      warnings,
      usedFallback: true,
    };
  }

  // Piped input
  const chain = psCommands.join(' | ');
  return { command: chain, warnings, usedFallback: true };
}

function isSedExpr(s: string): boolean {
  return /^[sy\/0-9,;{}:daipqrwcltDHhGgnNPx=]/.test(s) || s.startsWith("s/") || s.startsWith("s|") || s.startsWith("s#");
}

function parseSedExpression(expr: string): string | null {
  // Substitution: s/pattern/replacement/flags
  const subMatch = expr.match(/^s(.)(.+?)\1(.*?)\1([gipmI]*)$/);
  if (subMatch) {
    const [, , pattern, replacement, flags] = subMatch;
    const psPattern = pattern;
    const psReplacement = replacement
      .replace(/\\1/g, '$1')
      .replace(/\\2/g, '$2')
      .replace(/\\3/g, '$3')
      .replace(/\\4/g, '$4')
      .replace(/\\5/g, '$5')
      .replace(/&/g, '$0');

    // -replace in PS is global by default
    const escapedPattern = psPattern.replace(/'/g, "''");
    const escapedReplacement = psReplacement.replace(/'/g, "''");

    return `ForEach-Object { $_ -replace '${escapedPattern}','${escapedReplacement}' }`;
  }

  // Delete: /pattern/d or Nd
  const delMatch = expr.match(/^\/(.+)\/d$/);
  if (delMatch) {
    return `Where-Object { $_ -notmatch '${delMatch[1].replace(/'/g, "''")}' }`;
  }

  // Line number delete: Nd
  const lineDelMatch = expr.match(/^(\d+)d$/);
  if (lineDelMatch) {
    const line = parseInt(lineDelMatch[1], 10);
    return `Where-Object { $_.ReadCount -ne ${line} }`;
  }

  // Print: /pattern/p (with -n)
  const printMatch = expr.match(/^\/(.+)\/p$/);
  if (printMatch) {
    return `Where-Object { $_ -match '${printMatch[1].replace(/'/g, "''")}' }`;
  }

  // Line range: N,Mp or N,Ms/...
  const rangeMatch = expr.match(/^(\d+),(\d+)p$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return `Select-Object -Skip ${start - 1} -First ${end - start + 1}`;
  }

  // Simple line print: Np
  const linePrintMatch = expr.match(/^(\d+)p$/);
  if (linePrintMatch) {
    const line = parseInt(linePrintMatch[1], 10);
    return `Select-Object -Skip ${line - 1} -First 1`;
  }

  return null;
}
