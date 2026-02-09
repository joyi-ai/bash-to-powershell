import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

/**
 * Translate `test` and `[` commands.
 * [ ... ] is equivalent to test ...
 */
export function testTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  let rawArgs = cmd.args.map(a => wordRawString(a));

  // Remove trailing ] if present (from [ ... ] syntax)
  if (rawArgs[rawArgs.length - 1] === ']') {
    rawArgs = rawArgs.slice(0, -1);
  }

  const expr = translateTestExpr(rawArgs, ctx, tw, cmd);
  return { command: expr, warnings: [], usedFallback: true };
}

function translateTestExpr(
  args: string[],
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
  cmd: SimpleCommandNode,
): string {
  if (args.length === 0) return '$false';

  // Negation: ! expr
  if (args[0] === '!') {
    const inner = translateTestExpr(args.slice(1), ctx, tw, cmd);
    return `(-not (${inner}))`;
  }

  // Binary operators
  if (args.length === 3) {
    const [left, op, right] = args;
    const l = translateTestOperand(left);
    const r = translateTestOperand(right);

    switch (op) {
      case '=': case '==': return `(${l} -eq ${r})`;
      case '!=': return `(${l} -ne ${r})`;
      case '-eq': return `([int]${l} -eq [int]${r})`;
      case '-ne': return `([int]${l} -ne [int]${r})`;
      case '-gt': return `([int]${l} -gt [int]${r})`;
      case '-ge': return `([int]${l} -ge [int]${r})`;
      case '-lt': return `([int]${l} -lt [int]${r})`;
      case '-le': return `([int]${l} -le [int]${r})`;
      case '-nt': return `((Get-Item ${l}).LastWriteTime -gt (Get-Item ${r}).LastWriteTime)`;
      case '-ot': return `((Get-Item ${l}).LastWriteTime -lt (Get-Item ${r}).LastWriteTime)`;
      default: return `(${l} ${op} ${r})`;
    }
  }

  // Unary operators
  if (args.length === 2) {
    const [op, operand] = args;
    const o = translateTestOperand(operand);

    switch (op) {
      case '-f': return `(Test-Path -PathType Leaf ${o})`;
      case '-d': return `(Test-Path -PathType Container ${o})`;
      case '-e': return `(Test-Path ${o})`;
      case '-s': return `((Test-Path ${o}) -and (Get-Item ${o}).Length -gt 0)`;
      case '-r': case '-w': case '-x': return `(Test-Path ${o})`; // approximate
      case '-L': case '-h': return `((Get-Item ${o} -ErrorAction SilentlyContinue).LinkType -ne $null)`;
      case '-z': return `([string]::IsNullOrEmpty(${o}))`;
      case '-n': return `(-not [string]::IsNullOrEmpty(${o}))`;
      default: return `(${op} ${o})`;
    }
  }

  // Compound with -a / -o
  const andIdx = args.indexOf('-a');
  if (andIdx > 0) {
    const left = translateTestExpr(args.slice(0, andIdx), ctx, tw, cmd);
    const right = translateTestExpr(args.slice(andIdx + 1), ctx, tw, cmd);
    return `(${left} -and ${right})`;
  }

  const orIdx = args.indexOf('-o');
  if (orIdx > 0) {
    const left = translateTestExpr(args.slice(0, orIdx), ctx, tw, cmd);
    const right = translateTestExpr(args.slice(orIdx + 1), ctx, tw, cmd);
    return `(${left} -or ${right})`;
  }

  // Single argument — true if non-empty
  if (args.length === 1) {
    const o = translateTestOperand(args[0]);
    return `(-not [string]::IsNullOrEmpty(${o}))`;
  }

  return args.join(' ');
}

function translateTestOperand(s: string): string {
  // Translate $VAR to $env:VAR
  if (s.startsWith('$') && !s.startsWith('$(')) {
    const varName = s.slice(1);
    if (varName === '?' || varName === '$' || varName === '!' || varName === '#' || varName === '@') {
      return s; // keep special vars as-is (handled elsewhere)
    }
    return `$env:${varName}`;
  }
  // Quote strings
  if (s.startsWith("'") || s.startsWith('"')) return s;
  if (/^[0-9]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}
