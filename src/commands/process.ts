import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

// ============================================================
// lsof
// ============================================================

const LSOF_FLAGS = [
  { short: 'i', takesValue: true },
  { short: 'p', takesValue: true },
  { short: 't' },
  { short: 'n' },
  { short: 'P' },
];

export function lsofTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, LSOF_FLAGS);

  const iArg = parsed.flags['i'] as string | undefined;
  const pArg = parsed.flags['p'] as string | undefined;
  const terse = !!parsed.flags['t'];

  // lsof -i :PORT → Get-NetTCPConnection
  if (iArg) {
    const portMatch = iArg.match(/:(\d+)$/);
    if (portMatch) {
      const port = portMatch[1];
      if (terse) {
        return {
          command: `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess`,
          warnings: [],
          usedFallback: true,
        };
      }
      return {
        command: `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess`,
        warnings: [],
        usedFallback: true,
      };
    }
    // lsof -i (all network connections)
    return {
      command: 'Get-NetTCPConnection | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess',
      warnings: [],
      usedFallback: true,
    };
  }

  // lsof -p PID → Get-Process
  if (pArg) {
    return {
      command: `Get-Process -Id ${pArg} | Select-Object Id, ProcessName, Path`,
      warnings: [],
      usedFallback: true,
    };
  }

  // Bare lsof with file arguments
  if (parsed.positional.length > 0) {
    const files = parsed.positional.map(f => `'${f.replace(/'/g, "''")}'`);
    return {
      command: `Get-Process | Where-Object { $_.Path -like ${files[0]} }`,
      warnings: ['lsof: file-based lookup is approximate in PowerShell'],
      usedFallback: true,
    };
  }

  return { command: 'Get-NetTCPConnection', warnings: [], usedFallback: true };
}

// ============================================================
// pkill
// ============================================================

const PKILL_FLAGS = [
  { short: 'f', long: 'full' },
  { short: '9' },
  { short: 'x', long: 'exact' },
  { long: 'signal', takesValue: true },
];

export function pkillTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, PKILL_FLAGS);

  const force = !!parsed.flags['9'];
  const signal = parsed.flags['signal'] as string | undefined;
  const isForceSignal = force || signal === 'SIGKILL' || signal === '9' || signal === 'KILL';
  const pattern = parsed.positional[0];

  if (!pattern) {
    return { command: '# pkill: missing process name', warnings: ['pkill: no pattern specified'], usedFallback: true };
  }

  const escaped = pattern.replace(/'/g, "''");
  const parts = ['Stop-Process', '-Name', `'${escaped}'`];
  if (isForceSignal) parts.push('-Force');
  parts.push('-ErrorAction SilentlyContinue');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}

// ============================================================
// killall (alias for pkill behavior)
// ============================================================

export function killallTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: '9' },
    { short: 's', long: 'signal', takesValue: true },
  ]);

  const force = !!parsed.flags['9'];
  const signal = parsed.flags['signal'] as string | undefined;
  const isForceSignal = force || signal === 'SIGKILL' || signal === '9' || signal === 'KILL';
  const names = parsed.positional;

  if (names.length === 0) {
    return { command: '# killall: missing process name', warnings: ['killall: no name specified'], usedFallback: true };
  }

  const cmds = names.map(name => {
    const escaped = name.replace(/'/g, "''");
    const parts = ['Stop-Process', '-Name', `'${escaped}'`];
    if (isForceSignal) parts.push('-Force');
    parts.push('-ErrorAction SilentlyContinue');
    return parts.join(' ');
  });

  return { command: cmds.join('; '), warnings: [], usedFallback: true };
}

// ============================================================
// pgrep
// ============================================================

const PGREP_FLAGS = [
  { short: 'f', long: 'full' },
  { short: 'l', long: 'list-name' },
  { short: 'x', long: 'exact' },
  { short: 'c', long: 'count' },
];

export function pgrepTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, PGREP_FLAGS);

  const listName = !!parsed.flags['list-name'];
  const count = !!parsed.flags['count'];
  const pattern = parsed.positional[0];

  if (!pattern) {
    return { command: '# pgrep: missing process name', warnings: ['pgrep: no pattern specified'], usedFallback: true };
  }

  const escaped = pattern.replace(/'/g, "''");

  if (count) {
    return {
      command: `(Get-Process -Name '${escaped}' -ErrorAction SilentlyContinue | Measure-Object).Count`,
      warnings: [],
      usedFallback: true,
    };
  }

  if (listName) {
    return {
      command: `Get-Process -Name '${escaped}' -ErrorAction SilentlyContinue | Select-Object Id, ProcessName`,
      warnings: [],
      usedFallback: true,
    };
  }

  return {
    command: `(Get-Process -Name '${escaped}' -ErrorAction SilentlyContinue).Id`,
    warnings: [],
    usedFallback: true,
  };
}
