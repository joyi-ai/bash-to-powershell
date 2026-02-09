import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

// ============================================================
// rm
// ============================================================

export function rmTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'r', long: 'recursive' },
    { short: 'R' },
    { short: 'f', long: 'force' },
    { short: 'i' },
    { short: 'd', long: 'dir' },
    { short: 'v', long: 'verbose' },
  ]);

  const recursive = !!(parsed.flags['recursive'] || parsed.flags['R']);
  const force = !!parsed.flags['force'];
  const files = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (files.length === 0) {
    return { command: 'Remove-Item', warnings: ['rm: no files specified'], usedFallback: true };
  }

  const parts = ['Remove-Item', ...files];
  if (recursive) parts.push('-Recurse');
  if (force) parts.push('-Force');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// cp
// ============================================================

export function cpTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'r', long: 'recursive' },
    { short: 'R' },
    { short: 'f', long: 'force' },
    { short: 'i', long: 'interactive' },
    { short: 'v', long: 'verbose' },
    { short: 'a', long: 'archive' },
    { short: 'p', long: 'preserve' },
    { short: 'n', long: 'no-clobber' },
  ]);

  const recursive = !!(parsed.flags['recursive'] || parsed.flags['R'] || parsed.flags['archive']);
  const force = !!parsed.flags['force'];
  const items = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (items.length < 2) {
    return { command: 'Copy-Item', warnings: ['cp: missing destination'], usedFallback: true };
  }

  const dest = items.pop()!;
  const sources = items;

  const parts = ['Copy-Item', '-Path', sources.join(','), '-Destination', dest];
  if (recursive) parts.push('-Recurse');
  if (force) parts.push('-Force');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// mv
// ============================================================

export function mvTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'f', long: 'force' },
    { short: 'i', long: 'interactive' },
    { short: 'n', long: 'no-clobber' },
    { short: 'v', long: 'verbose' },
  ]);

  const force = !!parsed.flags['force'];
  const items = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);

  if (items.length < 2) {
    return { command: 'Move-Item', warnings: ['mv: missing destination'], usedFallback: true };
  }

  const dest = items.pop()!;
  const sources = items;

  const parts = ['Move-Item', '-Path', sources.join(','), '-Destination', dest];
  if (force) parts.push('-Force');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// mkdir
// ============================================================

export function mkdirTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'p', long: 'parents' },
    { short: 'v', long: 'verbose' },
    { short: 'm', long: 'mode', takesValue: true },
  ]);

  const dirs = parsed.positional.map(d => `'${d.replace(/'/g, "''")}'`);
  if (dirs.length === 0) {
    return { command: 'New-Item -ItemType Directory', warnings: [], usedFallback: true };
  }

  // -Force handles -p behavior (creates parents, no error if exists)
  const parts: string[] = [];
  for (const dir of dirs) {
    parts.push(`New-Item -ItemType Directory -Force -Path ${dir}`);
  }

  const result = parts.length === 1 ? parts[0] : parts.join('; ');
  return { command: result, warnings: [], usedFallback: true };
}

// ============================================================
// touch
// ============================================================

export function touchTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const files = rawArgs.filter(a => !a.startsWith('-'));

  if (files.length === 0) {
    return { command: '', warnings: ['touch: no files specified'], usedFallback: true };
  }

  // touch: create if not exists, update timestamp if exists
  const cmds = files.map(f => {
    const escaped = f.replace(/'/g, "''");
    return `if (Test-Path '${escaped}') { (Get-Item '${escaped}').LastWriteTime = Get-Date } else { New-Item -ItemType File '${escaped}' }`;
  });

  return { command: cmds.join('; '), warnings: [], usedFallback: true };
}

// ============================================================
// ln
// ============================================================

export function lnTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 's', long: 'symbolic' },
    { short: 'f', long: 'force' },
  ]);

  const symbolic = !!parsed.flags['symbolic'];
  const force = !!parsed.flags['force'];
  const items = parsed.positional;

  if (items.length < 2) {
    return { command: 'New-Item -ItemType SymbolicLink', warnings: ['ln: missing target or link name'], usedFallback: true };
  }

  const target = `'${items[0].replace(/'/g, "''")}'`;
  const linkName = `'${items[1].replace(/'/g, "''")}'`;
  const itemType = symbolic ? 'SymbolicLink' : 'HardLink';

  let result = '';
  if (force) {
    result = `Remove-Item -Force -ErrorAction SilentlyContinue ${linkName}; `;
  }
  result += `New-Item -ItemType ${itemType} -Path ${linkName} -Target ${target}`;

  return { command: result, warnings: [], usedFallback: true };
}

// ============================================================
// chmod (limited — Windows permissions are fundamentally different)
// ============================================================

export function chmodTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'R', long: 'recursive' },
  ]);

  const recursive = !!parsed.flags['recursive'];
  const positional = parsed.positional;

  if (positional.length < 2) {
    return {
      command: '# chmod: no Windows equivalent',
      warnings: ['chmod has no direct PowerShell equivalent; use icacls for detailed permissions'],
      usedFallback: true,
    };
  }

  const mode = positional[0];
  const files = positional.slice(1).map(f => `'${f.replace(/'/g, "''")}'`);

  // +x → make executable (on Windows: unblock or set ACL)
  if (mode === '+x' || mode === 'u+x' || mode === 'a+x') {
    return {
      command: files.map(f => `Unblock-File ${f}`).join('; '),
      warnings: ['chmod +x approximated with Unblock-File; Windows has different permission model'],
      usedFallback: true,
    };
  }

  // For numeric modes, emit icacls
  return {
    command: `# chmod ${mode} → icacls equivalent needed\nicacls ${files.join(' ')}`,
    warnings: [`chmod ${mode} has no direct equivalent; manual icacls command may be needed`],
    usedFallback: true,
  };
}
