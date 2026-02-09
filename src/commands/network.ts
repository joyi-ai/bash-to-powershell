import { SimpleCommandNode, TransformContext, WordNode } from '../types.js';
import { parseArgs, wordRawString } from './arg-parser.js';
import { TranslatedCommand } from './index.js';

// ============================================================
// curl
// ============================================================

const CURL_FLAGS = [
  { short: 's', long: 'silent' },
  { short: 'S', long: 'show-error' },
  { short: 'L', long: 'location' },
  { short: 'f', long: 'fail' },
  { short: 'o', long: 'output', takesValue: true },
  { short: 'O', long: 'remote-name' },
  { short: 'I', long: 'head' },
  { short: 'X', long: 'request', takesValue: true },
  { short: 'H', long: 'header', takesValue: true },
  { short: 'd', long: 'data', takesValue: true },
  { long: 'data-raw', takesValue: true },
  { short: 'u', long: 'user', takesValue: true },
  { short: 'k', long: 'insecure' },
  { short: 'v', long: 'verbose' },
  { short: 'b', long: 'cookie', takesValue: true },
  { short: 'c', long: 'cookie-jar', takesValue: true },
  { long: 'connect-timeout', takesValue: true },
  { short: 'm', long: 'max-time', takesValue: true },
  { long: 'retry', takesValue: true },
  { short: 'A', long: 'user-agent', takesValue: true },
  { short: 'e', long: 'referer', takesValue: true },
  { long: 'compressed' },
];

export function curlTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  // Prefer curl.exe (the real curl, not PS alias)
  if (ctx.tools.curl) {
    // Just call curl.exe directly, passing all args through
    const args = cmd.args.map(a => tw(a, ctx));
    return {
      command: ['curl.exe', ...args].join(' '),
      warnings: [],
      usedFallback: false,
    };
  }

  // Fallback: Invoke-WebRequest / Invoke-RestMethod
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, CURL_FLAGS);
  const { flags, positional } = parsed;

  const url = positional[0] ?? '';
  const method = (flags['request'] as string)?.toUpperCase() ?? 'GET';
  const output = flags['output'] as string | undefined;
  const data = (flags['data'] ?? flags['data-raw']) as string | undefined;
  const headers = flags['header'];
  const silent = !!flags['silent'];
  const insecure = !!flags['insecure'];
  const headOnly = !!flags['head'];
  const timeout = flags['max-time'] as string | undefined;

  const cmdName = data || method !== 'GET' ? 'Invoke-RestMethod' : 'Invoke-WebRequest';
  const parts: string[] = [cmdName];

  if (url) parts.push(`-Uri '${url.replace(/'/g, "''")}'`);
  if (method !== 'GET') parts.push(`-Method ${method}`);
  if (headOnly) parts.push('-Method Head');
  if (data) parts.push(`-Body '${data.replace(/'/g, "''")}'`);
  if (insecure) parts.push('-SkipCertificateCheck');
  if (timeout) parts.push(`-TimeoutSec ${timeout}`);

  if (typeof headers === 'string') {
    const [key, ...valParts] = headers.split(':');
    const val = valParts.join(':').trim();
    parts.push(`-Headers @{'${key.trim()}'='${val.replace(/'/g, "''")}'}`);
  }

  let result = parts.join(' ');

  if (output) {
    result += ` -OutFile '${output.replace(/'/g, "''")}'`;
  } else if (silent) {
    // Just return content
    result = `(${result}).Content`;
  }

  return { command: result, warnings: [], usedFallback: true };
}

// ============================================================
// wget
// ============================================================

export function wgetTranslator(
  cmd: SimpleCommandNode,
  ctx: TransformContext,
  tw: (w: WordNode, ctx: TransformContext) => string,
): TranslatedCommand {
  const rawArgs = cmd.args.map(a => wordRawString(a));
  const parsed = parseArgs(rawArgs, [
    { short: 'O', long: 'output-document', takesValue: true },
    { short: 'q', long: 'quiet' },
    { long: 'no-check-certificate' },
    { short: 'P', long: 'directory-prefix', takesValue: true },
  ]);

  const url = parsed.positional[0] ?? '';
  const output = parsed.flags['output-document'] as string | undefined;
  const insecure = !!parsed.flags['no-check-certificate'];

  // Prefer curl.exe
  if (ctx.tools.curl) {
    const parts = ['curl.exe', '-L', '-o'];
    if (output) {
      parts.push(`'${output.replace(/'/g, "''")}'`);
    } else {
      // Extract filename from URL
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1] || 'download';
      parts.push(`'${filename}'`);
    }
    if (insecure) parts.push('-k');
    parts.push(`'${url.replace(/'/g, "''")}'`);
    return { command: parts.join(' '), warnings: [], usedFallback: false };
  }

  const parts = ['Invoke-WebRequest', `-Uri '${url.replace(/'/g, "''")}'`];
  if (output) {
    parts.push(`-OutFile '${output.replace(/'/g, "''")}'`);
  } else {
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1] || 'download';
    parts.push(`-OutFile '${filename}'`);
  }
  if (insecure) parts.push('-SkipCertificateCheck');

  return { command: parts.join(' '), warnings: [], usedFallback: true };
}
