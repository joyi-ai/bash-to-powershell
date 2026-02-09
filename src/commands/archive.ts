import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

// ============================================================
// zip
// ============================================================

const ZIP_FLAGS = [
  { short: 'r', long: 'recurse-paths' },
  { short: 'q', long: 'quiet' },
  { short: 'j', long: 'junk-paths' },
  { short: 'u', long: 'update' },
];

export function zipTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, ZIP_FLAGS);

  const archive = parsed.positional[0];
  const sources = parsed.positional.slice(1);

  if (!archive) {
    return { command: '# zip: missing archive name', warnings: ['zip: no archive specified'], usedFallback: true };
  }

  const archiveName = archive.endsWith('.zip') ? archive : archive + '.zip';
  const escaped = archiveName.replace(/'/g, "''");

  if (sources.length === 0) {
    return { command: `Compress-Archive -Path * -DestinationPath '${escaped}'`, warnings: [], usedFallback: true };
  }

  const sourcePaths = sources.map(s => `'${s.replace(/'/g, "''")}'`).join(',');

  const parts = ['Compress-Archive', '-Path', sourcePaths, '-DestinationPath', `'${escaped}'`];
  if (parsed.flags['update']) parts.push('-Update');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// unzip
// ============================================================

const UNZIP_FLAGS = [
  { short: 'o' },  // overwrite
  { short: 'q' },  // quiet
  { short: 'd', takesValue: true },  // destination directory
  { short: 'l' },  // list
];

export function unzipTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, UNZIP_FLAGS);

  const archive = parsed.positional[0];
  const destDir = parsed.flags['d'] as string | undefined;
  const listOnly = !!parsed.flags['l'];

  if (!archive) {
    return { command: '# unzip: missing archive', warnings: ['unzip: no archive specified'], usedFallback: true };
  }

  const escaped = archive.replace(/'/g, "''");

  if (listOnly) {
    return {
      command: `[System.IO.Compression.ZipFile]::OpenRead('${escaped}').Entries | Select-Object FullName, Length, LastWriteTime`,
      warnings: [],
      usedFallback: true,
    };
  }

  const dest = destDir ? `'${destDir.replace(/'/g, "''")}'` : "'.'";
  const parts = ['Expand-Archive', '-Path', `'${escaped}'`, '-DestinationPath', dest];
  if (parsed.flags['o']) parts.push('-Force');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}
