import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { grepTranslator } from './grep.js';
import { findTranslator } from './find.js';
import { lsTranslator } from './ls.js';
import { catTranslator } from './cat.js';
import { headTranslator, tailTranslator } from './head-tail.js';
import { echoTranslator, printfTranslator } from './echo-printf.js';
import { rmTranslator, cpTranslator, mvTranslator, mkdirTranslator, touchTranslator, lnTranslator, chmodTranslator } from './file-ops.js';
import { sedTranslator } from './sed.js';
import { awkTranslator } from './awk.js';
import { wcTranslator } from './wc.js';
import { whichTranslator, psTranslator, killTranslator } from './system.js';
import { curlTranslator, wgetTranslator } from './network.js';
import { sortTranslator, uniqTranslator, trTranslator, teeTranslator, diffTranslator, xargsTranslator } from './text-utils.js';
import { basenameTranslator, dirnameTranslator, realpathTranslator, readlinkTranslator } from './path-utils.js';
import { exportTranslator, unsetTranslator, envTranslator } from './env-utils.js';
import { testTranslator } from './test.js';

export interface TranslatedCommand {
  command: string;
  warnings: string[];
  usedFallback: boolean;
}

export type CommandTranslator = (
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  translateWord: (w: WordNode, ctx: TransformContext) => string,
) => TranslatedCommand;

const registry = new Map<string, CommandTranslator>();

function register(name: string, translator: CommandTranslator): void {
  registry.set(name, translator);
}

// Register all translators
register('grep', grepTranslator);
register('egrep', grepTranslator);
register('fgrep', grepTranslator);
register('find', findTranslator);
register('ls', lsTranslator);
register('ll', lsTranslator); // common alias
register('cat', catTranslator);
register('head', headTranslator);
register('tail', tailTranslator);
register('echo', echoTranslator);
register('printf', printfTranslator);
register('rm', rmTranslator);
register('cp', cpTranslator);
register('mv', mvTranslator);
register('mkdir', mkdirTranslator);
register('touch', touchTranslator);
register('ln', lnTranslator);
register('chmod', chmodTranslator);
register('sed', sedTranslator);
register('awk', awkTranslator);
register('gawk', awkTranslator);
register('wc', wcTranslator);
register('which', whichTranslator);
register('command', whichTranslator); // `command -v` is similar
register('ps', psTranslator);
register('kill', killTranslator);
register('curl', curlTranslator);
register('wget', wgetTranslator);
register('sort', sortTranslator);
register('uniq', uniqTranslator);
register('tr', trTranslator);
register('tee', teeTranslator);
register('diff', diffTranslator);
register('xargs', xargsTranslator);
register('basename', basenameTranslator);
register('dirname', dirnameTranslator);
register('realpath', realpathTranslator);
register('readlink', readlinkTranslator);
register('export', exportTranslator);
register('unset', unsetTranslator);
register('env', envTranslator);
register('test', testTranslator);
register('[', testTranslator);

// true/false
register('true', (_cmd, _ctx, _tw) => ({ command: '$true', warnings: [], usedFallback: true }));
register('false', (_cmd, _ctx, _tw) => ({ command: '$false', warnings: [], usedFallback: true }));

// cd
register('cd', (cmd, ctx, tw) => {
  const args = cmd.args.map(a => {
    const raw = a.parts.map(p => p.type === 'Literal' ? p.value : '').join('');
    if (raw === '~' || raw === '') return '$env:USERPROFILE';
    if (raw === '-') return '$OLDPWD';
    return tw(a, ctx);
  });
  return { command: `Set-Location ${args[0] ?? '$env:USERPROFILE'}`, warnings: [], usedFallback: true };
});

// pwd
register('pwd', () => ({ command: '(Get-Location).Path', warnings: [], usedFallback: true }));

// clear
register('clear', () => ({ command: 'Clear-Host', warnings: [], usedFallback: true }));

// sleep
register('sleep', (cmd, _ctx, _tw) => {
  const rawArgs = cmd.args.map(a => a.parts.map(p => p.type === 'Literal' ? p.value : '').join(''));
  const seconds = rawArgs[0] ?? '1';
  return { command: `Start-Sleep -Seconds ${seconds}`, warnings: [], usedFallback: true };
});

// date
register('date', (cmd, _ctx, _tw) => {
  const rawArgs = cmd.args.map(a => a.parts.map(p => p.type === 'Literal' ? p.value : '').join(''));
  if (rawArgs.length === 0) {
    return { command: 'Get-Date', warnings: [], usedFallback: true };
  }
  // date +%FORMAT
  if (rawArgs[0]?.startsWith('+')) {
    const fmt = rawArgs[0].slice(1)
      .replace(/%Y/g, 'yyyy')
      .replace(/%m/g, 'MM')
      .replace(/%d/g, 'dd')
      .replace(/%H/g, 'HH')
      .replace(/%M/g, 'mm')
      .replace(/%S/g, 'ss')
      .replace(/%s/g, "(Get-Date -UFormat '%s')")
      .replace(/%F/g, 'yyyy-MM-dd')
      .replace(/%T/g, 'HH:mm:ss');
    return { command: `Get-Date -Format '${fmt}'`, warnings: [], usedFallback: true };
  }
  return { command: 'Get-Date', warnings: [], usedFallback: true };
});

// whoami
register('whoami', () => ({ command: '[System.Security.Principal.WindowsIdentity]::GetCurrent().Name', warnings: [], usedFallback: true }));

// uname
register('uname', () => ({ command: '[System.Environment]::OSVersion.VersionString', warnings: [], usedFallback: true }));

// du
register('du', (cmd, ctx, tw) => {
  const rawArgs = cmd.args.map(a => a.parts.map(p => p.type === 'Literal' ? p.value : '').join(''));
  const hasH = rawArgs.includes('-h') || rawArgs.includes('--human-readable');
  const hasS = rawArgs.includes('-s') || rawArgs.includes('--summarize');
  const dirs = rawArgs.filter(a => !a.startsWith('-'));
  const path = dirs[0] ? `'${dirs[0]}'` : "'.'";

  if (hasS) {
    return {
      command: `(Get-ChildItem ${path} -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB`,
      warnings: [],
      usedFallback: true,
    };
  }
  return {
    command: `Get-ChildItem ${path} -Recurse -File | Measure-Object -Property Length -Sum`,
    warnings: [],
    usedFallback: true,
  };
});

// df
register('df', () => ({
  command: 'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N="Used(GB)";E={[math]::Round($_.Used/1GB,2)}}, @{N="Free(GB)";E={[math]::Round($_.Free/1GB,2)}}',
  warnings: [],
  usedFallback: true,
}));

// history
register('history', () => ({ command: 'Get-History', warnings: [], usedFallback: true }));

// exit
register('exit', (cmd) => {
  const rawArgs = cmd.args.map(a => a.parts.map(p => p.type === 'Literal' ? p.value : '').join(''));
  const code = rawArgs[0] ?? '0';
  return { command: `exit ${code}`, warnings: [], usedFallback: true };
});

// source / .
register('source', (cmd, ctx, tw) => {
  const file = cmd.args[0] ? tw(cmd.args[0], ctx) : '';
  return { command: `. ${file}`, warnings: [], usedFallback: true };
});
register('.', (cmd, ctx, tw) => {
  const file = cmd.args[0] ? tw(cmd.args[0], ctx) : '';
  return { command: `. ${file}`, warnings: [], usedFallback: true };
});

export function getTranslator(name: string): CommandTranslator | undefined {
  return registry.get(name);
}
