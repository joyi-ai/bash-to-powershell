import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

const WC_FLAGS = [
  { short: 'l', long: 'lines' },
  { short: 'w', long: 'words' },
  { short: 'c', long: 'bytes' },
  { short: 'm', long: 'chars' },
];

export function wcTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, WC_FLAGS);
  const { flags, positional } = parsed;

  const lines = !!flags['lines'];
  const words = !!flags['words'];
  const bytes = !!flags['bytes'];
  const chars = !!flags['chars'];
  const noFlags = !lines && !words && !bytes && !chars;

  const files = positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (lines) {
    if (files.length > 0) {
      return {
        command: `(Get-Content ${files.join(',')} | Measure-Object -Line).Lines`,
        warnings: [],
        usedFallback: true,
      };
    }
    return {
      command: '(Measure-Object -Line).Lines',
      warnings: [],
      usedFallback: true,
    };
  }

  if (words) {
    if (files.length > 0) {
      return {
        command: `(Get-Content ${files.join(',')} | Measure-Object -Word).Words`,
        warnings: [],
        usedFallback: true,
      };
    }
    return {
      command: '(Measure-Object -Word).Words',
      warnings: [],
      usedFallback: true,
    };
  }

  if (chars || bytes) {
    if (files.length > 0) {
      return {
        command: `(Get-Content ${files.join(',')} | Measure-Object -Character).Characters`,
        warnings: [],
        usedFallback: true,
      };
    }
    return {
      command: '(Measure-Object -Character).Characters',
      warnings: [],
      usedFallback: true,
    };
  }

  // Default: lines, words, characters
  if (files.length > 0) {
    return {
      command: `Get-Content ${files.join(',')} | Measure-Object -Line -Word -Character`,
      warnings: [],
      usedFallback: true,
    };
  }
  return {
    command: 'Measure-Object -Line -Word -Character',
    warnings: [],
    usedFallback: true,
  };
}
