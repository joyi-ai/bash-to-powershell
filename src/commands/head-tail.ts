import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

const HEAD_FLAGS = [
  { short: 'n', long: 'lines', takesValue: true },
  { short: 'c', long: 'bytes', takesValue: true },
  { short: 'q', long: 'quiet' },
];

const TAIL_FLAGS = [
  { short: 'n', long: 'lines', takesValue: true },
  { short: 'c', long: 'bytes', takesValue: true },
  { short: 'f', long: 'follow' },
  { short: 'q', long: 'quiet' },
];

export function headTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  // Handle bare -N shorthand (e.g. head -20 = head -n 20)
  const normalized = normalizeBareNumber(rawArgs);
  const parsed = parseArgs(normalized, HEAD_FLAGS);
  const { flags, positional } = parsed;

  const lines = flags['lines'] as string | undefined;
  const count = lines ?? '10';

  if (positional.length === 0) {
    // Piped input
    return {
      command: `Select-Object -First ${count}`,
      warnings: [],
      usedFallback: true,
    };
  }

  const file = `'${positional[0].replace(/'/g, "''")}'`;
  return {
    command: `Get-Content ${file} -TotalCount ${count}`,
    warnings: [],
    usedFallback: true,
  };
}

/** Convert bare -N (e.g. -20) to -n N for head/tail */
function normalizeBareNumber(args: string[]): string[] {
  return args.map(arg => {
    if (/^-\d+$/.test(arg)) return '-n' + arg.slice(1); // -20 → -n20
    return arg;
  });
}

export function tailTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const normalized = normalizeBareNumber(rawArgs);
  const parsed = parseArgs(normalized, TAIL_FLAGS);
  const { flags, positional } = parsed;

  const lines = flags['lines'] as string | undefined;
  const count = lines ?? '10';
  const follow = !!flags['follow'];

  if (positional.length === 0) {
    // Piped input
    return {
      command: `Select-Object -Last ${count}`,
      warnings: [],
      usedFallback: true,
    };
  }

  const file = `'${positional[0].replace(/'/g, "''")}'`;

  if (follow) {
    return {
      command: `Get-Content ${file} -Tail ${count} -Wait`,
      warnings: [],
      usedFallback: true,
    };
  }

  return {
    command: `Get-Content ${file} -Tail ${count}`,
    warnings: [],
    usedFallback: true,
  };
}
