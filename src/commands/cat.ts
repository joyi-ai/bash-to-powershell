import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

const CAT_FLAGS = [
  { short: 'n', long: 'number' },
  { short: 'b', long: 'number-nonblank' },
  { short: 's', long: 'squeeze-blank' },
  { short: 'E', long: 'show-ends' },
  { short: 'T', long: 'show-tabs' },
  { short: 'A', long: 'show-all' },
];

export function catTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, CAT_FLAGS);
  const { flags } = parsed;

  const showNumbers = !!(flags['number'] || flags['number-nonblank']);

  // Collect positional (non-flag) word nodes and translate with tw()
  const files: string[] = [];
  for (let i = 0; i < cmd.args.length; i++) {
    const raw = rawArgs[i];
    if (!raw.startsWith('-') || raw === '-') {
      files.push(tw(cmd.args[i], ctx));
    }
  }

  if (files.length === 0) {
    // cat with no args reads stdin — not easily translatable, pass through
    return { command: 'Get-Content', warnings: [], usedFallback: true };
  }

  let result: string;
  if (files.length === 1) {
    result = `Get-Content ${files[0]}`;
  } else {
    result = `Get-Content ${files.join(',')}`;
  }

  if (showNumbers) {
    result += " | ForEach-Object { $i = 0 } { $i++; '{0,6}  {1}' -f $i, $_ }";
  }

  return { command: result, warnings: [], usedFallback: true };
}
