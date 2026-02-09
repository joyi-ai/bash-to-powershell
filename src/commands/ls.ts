import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

const LS_FLAGS = [
  { short: 'l' },
  { short: 'a', long: 'all' },
  { short: 'A', long: 'almost-all' },
  { short: 'h', long: 'human-readable' },
  { short: 'R', long: 'recursive' },
  { short: 'r', long: 'reverse' },
  { short: 't' },
  { short: 'S' },
  { short: '1' },
  { short: 'd', long: 'directory' },
  { long: 'color', takesValue: true },
];

export function lsTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, LS_FLAGS);
  const { flags } = parsed;

  const showHidden = !!(flags['all'] || flags['almost-all']);
  const longFormat = !!flags['l'];
  const recursive = !!flags['recursive'];
  const sortByTime = !!flags['t'];
  const sortBySize = !!flags['S'];
  const reverseSort = !!flags['reverse'];
  const dirOnly = !!flags['directory'];

  // Collect positional (non-flag) word nodes and translate with tw()
  const pathArgs: string[] = [];
  for (let i = 0; i < cmd.args.length; i++) {
    const raw = rawArgs[i];
    if (!raw.startsWith('-') || raw === '-') {
      pathArgs.push(tw(cmd.args[i], ctx));
    }
  }

  const parts: string[] = ['Get-ChildItem'];

  if (pathArgs.length > 0) {
    parts.push('-Path', pathArgs.join(','));
  }

  if (showHidden) parts.push('-Force');
  if (recursive) parts.push('-Recurse');
  if (dirOnly) parts.push('-Directory');

  const pipes: string[] = [];

  if (sortByTime) {
    pipes.push(`Sort-Object LastWriteTime${reverseSort ? '' : ' -Descending'}`);
  } else if (sortBySize) {
    pipes.push(`Sort-Object Length${reverseSort ? '' : ' -Descending'}`);
  } else if (reverseSort) {
    pipes.push('Sort-Object Name -Descending');
  }

  if (longFormat) {
    // Format output to resemble bash ls -l: mode size date name
    pipes.push("ForEach-Object { $m = $_.Mode; $s = if($_.PSIsContainer) { '<DIR>' } else { $_.Length }; $d = $_.LastWriteTime.ToString('MMM dd HH:mm'); \"$m  $s  $d  $($_.Name)\" }");
  } else {
    // Bare ls: output names only (one per line, like ls -1)
    pipes.push('Select-Object -ExpandProperty Name');
  }

  let result = parts.join(' ');
  if (pipes.length > 0) {
    result += ' | ' + pipes.join(' | ');
  }

  return { command: result, warnings: [], usedFallback: true };
}
