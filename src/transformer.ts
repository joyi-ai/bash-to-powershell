import {
  ScriptNode, StatementNode, PipelineNode, LogicalExprNode,
  CommandNode, SimpleCommandNode, SubshellNode,
  AssignmentNode, AssignmentStatementNode, RedirectNode, WordNode,
  WordPart, LiteralPart, VariablePart, CommandSubstitutionPart,
  TranspileOptions, ToolAvailability, TransformContext,
} from './types.js';
import { getTranslator } from './commands/index.js';
import { lex } from './lexer.js';
import { parse } from './parser.js';

// ============================================================
// SPECIAL VARIABLE MAPPINGS
// ============================================================

const SPECIAL_VARS: Record<string, string> = {
  HOME: 'env:USERPROFILE',
  USER: 'env:USERNAME',
  SHELL: 'env:ComSpec',
  TMPDIR: 'env:TEMP',
  HOSTNAME: 'env:COMPUTERNAME',
  LANG: 'env:LANG',
  // These map to PS built-ins, not env vars
  PWD: 'PWD',
  OLDPWD: 'OLDPWD',
  RANDOM: '(Get-Random)',
  SECONDS: '([int](New-TimeSpan -Start $script:StartTime).TotalSeconds)',
};

const SPECIAL_SINGLE_CHAR_VARS: Record<string, string> = {
  '?': 'LASTEXITCODE',
  '$': 'PID',
  '!': 'PID', // approximate — PS doesn't have background job PID the same way
  '#': 'args.Count',
  '@': 'args',
  '0': 'MyInvocation.MyCommand.Name',
};

// ============================================================
// WORD / QUOTING TRANSLATION
// ============================================================

/** Escape a string for use inside PowerShell single quotes */
function escapePsSingleQuote(s: string): string {
  return s.replace(/'/g, "''");
}

/** Escape a string for use inside PowerShell double quotes */
function escapePsDoubleQuote(s: string): string {
  return s
    .replace(/`/g, '``')
    .replace(/\$/g, '`$')
    .replace(/"/g, '`"');
}

/**
 * Translate a bash variable name to PowerShell equivalent.
 */
function translateVarName(name: string, braced: boolean): string {
  // Special single-char vars
  if (name.length === 1 && SPECIAL_SINGLE_CHAR_VARS[name]) {
    return '$' + SPECIAL_SINGLE_CHAR_VARS[name];
  }

  // Numeric args ($1, $2, etc.)
  if (/^[0-9]+$/.test(name) && name !== '0') {
    return `$args[${parseInt(name, 10) - 1}]`;
  }

  // Special named vars that map to non-env targets
  if (SPECIAL_VARS[name]) {
    const mapped = SPECIAL_VARS[name];
    if (mapped.startsWith('(')) return mapped; // expression like (Get-Random)
    if (!mapped.startsWith('env:')) return '$' + mapped;
    return '$' + mapped;
  }

  // Regular environment variables
  return braced ? `\${env:${name}}` : `$env:${name}`;
}

/**
 * Translate a WordNode to a PowerShell string.
 * This is the core quoting translation logic.
 */
export function translateWord(word: WordNode, ctx: TransformContext): string {
  // Apply /tmp path translation to command args
  const translated = translatePathInArgs(word);

  if (translated.parts.length === 0) return "''";

  // Single literal part — use optimal quoting
  if (translated.parts.length === 1) {
    return translateSinglePart(translated.parts[0], ctx);
  }

  // Multiple parts — need to combine
  return translateCompoundWord(translated.parts, ctx);
}

function translateSinglePart(part: WordPart, ctx: TransformContext): string {
  switch (part.type) {
    case 'Literal':
      return translateLiteral(part, ctx);
    case 'Variable':
      return translateVarName(part.name, part.braced);
    case 'CommandSubstitution':
      return translateCommandSub(part, ctx);
    case 'Glob':
      return part.pattern;
    default:
      return '';
  }
}

function translateLiteral(part: LiteralPart, ctx: TransformContext): string {
  const { value, quoting } = part;

  if (quoting === 'single') {
    // Single-quoted: wrap in PS single quotes
    return `'${escapePsSingleQuote(value)}'`;
  }

  if (quoting === 'dollar-single') {
    // $'...' content already has C-escapes evaluated by the lexer.
    // We need to represent it in PowerShell. If it contains special chars
    // (newlines, tabs, etc.), use double quotes with PS escape sequences.
    if (/[\x00-\x1f\x7f]/.test(value)) {
      let result = '';
      for (const ch of value) {
        const code = ch.charCodeAt(0);
        if (code === 10) result += '`n';
        else if (code === 13) result += '`r';
        else if (code === 9) result += '`t';
        else if (code === 0) result += '`0';
        else if (code === 7) result += '`a';
        else if (code === 8) result += '`b';
        else if (code === 27) result += '`e';
        else if (code < 32 || code === 127) result += '`0'; // approximate
        else result += escapePsDoubleQuote(ch);
      }
      return `"${result}"`;
    }
    // No special chars — use single quotes
    return `'${escapePsSingleQuote(value)}'`;
  }

  if (quoting === 'double') {
    // Was in bash double quotes — use PS double quotes, escaping PS-special chars
    return `"${escapePsDoubleQuote(value)}"`;
  }

  // Unquoted: only quote if necessary
  if (value === '') return "''";
  // PowerShell special values — never quote these
  if (value === '$null' || value === '$true' || value === '$false') return value;
  if (/^[a-zA-Z0-9_.\/:\-\*\?=@%]+$/.test(value)) {
    return value; // safe unquoted
  }
  // Contains spaces or PS-special chars — wrap in single quotes
  return `'${escapePsSingleQuote(value)}'`;
}

function translateCommandSub(part: CommandSubstitutionPart, ctx: TransformContext): string {
  // Recursively transpile the inner command
  try {
    const innerTokens = lex(part.command);
    const innerAst = parse(innerTokens);
    const innerPs = translateScript(innerAst, ctx);
    return `$(${innerPs})`;
  } catch {
    // If we can't parse, pass through
    ctx.warnings.push(`Could not parse command substitution: $(${part.command})`);
    return `$(${part.command})`;
  }
}

function translateCompoundWord(parts: WordPart[], ctx: TransformContext): string {
  // Check if all parts can live inside a single double-quoted string
  const canUseDoubleQuote = parts.every(p =>
    p.type === 'Literal' || p.type === 'Variable' || p.type === 'CommandSubstitution'
  );

  if (canUseDoubleQuote) {
    let inner = '';
    for (const part of parts) {
      if (part.type === 'Literal') {
        if (part.quoting === 'dollar-single' && /[\x00-\x1f\x7f]/.test(part.value)) {
          // Has control chars — need to use PS escapes inline
          for (const ch of part.value) {
            const code = ch.charCodeAt(0);
            if (code === 10) inner += '`n';
            else if (code === 13) inner += '`r';
            else if (code === 9) inner += '`t';
            else if (code === 0) inner += '`0';
            else inner += escapePsDoubleQuote(ch);
          }
        } else {
          inner += escapePsDoubleQuote(part.value);
        }
      } else if (part.type === 'Variable') {
        inner += translateVarName(part.name, part.braced);
      } else if (part.type === 'CommandSubstitution') {
        inner += translateCommandSub(part, ctx);
      }
    }
    return `"${inner}"`;
  }

  // Fallback: concatenate with +
  const segments = parts.map(p => translateSinglePart(p, ctx));
  return `(${segments.join(' + ')})`;
}

// ============================================================
// PATH TRANSLATION
// ============================================================

/** Translate /tmp paths in command arguments (not /dev/* which is redirect-only) */
function translatePathInArgs(word: WordNode): WordNode {
  if (word.parts.length === 1 && word.parts[0].type === 'Literal') {
    const val = word.parts[0].value;
    if (val === '/tmp' || val === '/tmp/') {
      return { type: 'Word', parts: [{ type: 'Variable', name: 'TEMP', braced: false }] };
    }
    if (val.startsWith('/tmp/')) {
      return {
        type: 'Word',
        parts: [
          { type: 'Variable', name: 'TEMP', braced: false },
          { type: 'Literal', value: '\\' + val.slice(5), quoting: 'unquoted' },
        ],
      };
    }
  }
  return word;
}

function translatePath(word: WordNode): WordNode {
  // Replace /dev/null → $null, /tmp → $env:TEMP (for redirects)
  if (word.parts.length === 1 && word.parts[0].type === 'Literal') {
    const val = word.parts[0].value;
    if (val === '/dev/null') {
      return { type: 'Word', parts: [{ type: 'Literal', value: '$null', quoting: 'unquoted' }] };
    }
    if (val === '/dev/stdout') {
      return { type: 'Word', parts: [{ type: 'Literal', value: 'CON', quoting: 'unquoted' }] };
    }
    if (val === '/dev/stderr') {
      return { type: 'Word', parts: [{ type: 'Literal', value: 'CON', quoting: 'unquoted' }] };
    }
    if (val === '/tmp' || val === '/tmp/') {
      return { type: 'Word', parts: [{ type: 'Variable', name: 'TEMP', braced: false }] };
    }
    if (val.startsWith('/tmp/')) {
      return {
        type: 'Word',
        parts: [
          { type: 'Variable', name: 'TEMP', braced: false },
          { type: 'Literal', value: '\\' + val.slice(5), quoting: 'unquoted' },
        ],
      };
    }
  }
  return word;
}

// ============================================================
// REDIRECT TRANSLATION
// ============================================================

function translateRedirect(r: RedirectNode, ctx: TransformContext): string {
  // fd-to-fd redirect: 2>&1
  if (r.targetFd !== undefined) {
    return `${r.fd}>&${r.targetFd}`;
  }

  const target = translatePath(r.target);
  const targetStr = translateWord(target, ctx);

  // /dev/null → $null
  if (targetStr === '$null') {
    if (r.op === '>') return `${r.fd > 1 ? r.fd : ''}>$null`;
    if (r.op === '>>') return `${r.fd > 1 ? r.fd : ''}>>$null`; // PS doesn't support >> $null well, but close enough
    return '';
  }

  const fdPrefix = r.fd > 1 ? `${r.fd}` : '';
  switch (r.op) {
    case '>': return `${fdPrefix}> ${targetStr}`;
    case '>>': return `${fdPrefix}>> ${targetStr}`;
    case '<': return `< ${targetStr}`;  // not directly supported in PS for all cases
    case '<<<': return `(${targetStr}) |`; // here-string becomes pipe input
    default: return '';
  }
}

// ============================================================
// STATEMENT TRANSLATION
// ============================================================

export function translateScript(script: ScriptNode, ctx: TransformContext): string {
  return script.body.map(s => translateStatement(s, ctx)).join('; ');
}

function translateStatement(stmt: StatementNode, ctx: TransformContext): string {
  switch (stmt.type) {
    case 'Pipeline':
      return translatePipeline(stmt, ctx);
    case 'LogicalExpr':
      return translateLogicalExpr(stmt, ctx);
    case 'AssignmentStatement':
      return stmt.assignments.map(a => translateAssignment(a, ctx)).join('; ');
    default:
      return '';
  }
}

function translatePipeline(pipeline: PipelineNode, ctx: TransformContext): string {
  const commands = pipeline.commands.map(c => translateCommand(c, ctx));
  const joined = commands.join(' | ');
  return pipeline.negated ? `!(${joined})` : joined;
}

function translateLogicalExpr(expr: LogicalExprNode, ctx: TransformContext): string {
  const left = translateStatement(expr.left, ctx);
  const right = translateStatement(expr.right, ctx);

  switch (expr.operator) {
    case '&&':
      return `${left}; if ($?) { ${right} }`;
    case '||':
      return `${left}; if (-not $?) { ${right} }`;
    case ';':
      return `${left}; ${right}`;
    default:
      return `${left}; ${right}`;
  }
}

function translateAssignment(a: AssignmentNode, ctx: TransformContext): string {
  const value = a.value ? translateWord(a.value, ctx) : "''";
  return `$env:${a.name} = ${value}`;
}

function translateCommand(cmd: CommandNode, ctx: TransformContext): string {
  if (cmd.type === 'Subshell') {
    return translateSubshell(cmd, ctx);
  }
  return translateSimpleCommand(cmd, ctx);
}

function translateSubshell(cmd: SubshellNode, ctx: TransformContext): string {
  const body = translateScript(cmd.body, ctx);
  const redirects = cmd.redirects.map(r => translateRedirect(r, ctx)).join(' ');
  const base = `& { ${body} }`;
  return redirects ? `${base} ${redirects}` : base;
}

function translateSimpleCommand(cmd: SimpleCommandNode, ctx: TransformContext): string {
  // Handle inline assignments
  let prefix = '';
  if (cmd.assignments.length > 0) {
    prefix = cmd.assignments.map(a => translateAssignment(a, ctx)).join('; ');
    if (!cmd.name) return prefix;
    prefix += '; ';
  }

  if (!cmd.name) return prefix;

  // Get command name as string
  const cmdName = wordToString(cmd.name);

  // Try command-specific translator
  const translator = getTranslator(cmdName);
  if (translator) {
    const result = translator(cmd, ctx, translateWord);
    if (result.usedFallback) ctx.usedFallbacks = true;
    ctx.warnings.push(...result.warnings);
    const redirects = cmd.redirects.map(r => translateRedirect(r, ctx)).join(' ');
    return prefix + result.command + (redirects ? ' ' + redirects : '');
  }

  // No translator — pass through as-is (external command)
  const args = cmd.args.map(a => translateWord(a, ctx));
  const redirects = cmd.redirects.map(r => translateRedirect(r, ctx)).join(' ');
  const command = [cmdName, ...args].join(' ');
  return prefix + command + (redirects ? ' ' + redirects : '');
}

/** Extract the plain string from a WordNode (for command name matching) */
function wordToString(word: WordNode): string {
  return word.parts.map(p => {
    if (p.type === 'Literal') return p.value;
    if (p.type === 'Variable') return `$${p.name}`;
    if (p.type === 'CommandSubstitution') return `$(${p.command})`;
    if (p.type === 'Glob') return p.pattern;
    return '';
  }).join('');
}
