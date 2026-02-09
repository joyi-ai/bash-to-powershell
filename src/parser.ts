import {
  Token, TokenType,
  ScriptNode, StatementNode, PipelineNode, LogicalExprNode,
  CommandNode, SimpleCommandNode, SubshellNode,
  AssignmentNode, AssignmentStatementNode, RedirectNode, WordNode,
  WordPart, LiteralPart, VariablePart, CommandSubstitutionPart,
} from './types.js';

const EOF_TOKEN: Token = { type: TokenType.EOF, value: '' };

export function parse(tokens: Token[]): ScriptNode {
  let pos = 0;
  const len = tokens.length;

  function peek(): Token {
    return pos < len ? tokens[pos] : EOF_TOKEN;
  }

  function advance(): Token {
    return pos < len ? tokens[pos++] : EOF_TOKEN;
  }

  function expect(type: TokenType): Token {
    const tok = advance();
    if (tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok.type} ("${tok.value}")`);
    }
    return tok;
  }

  function isAtEnd(): boolean {
    return pos >= len || tokens[pos].type === TokenType.EOF;
  }

  function isSeparator(t: Token): boolean {
    return t.type === TokenType.Semi || t.type === TokenType.Newline;
  }

  function isOperator(t: Token): boolean {
    return t.type === TokenType.And || t.type === TokenType.Or || isSeparator(t);
  }

  function skipNewlines(): void {
    while (pos < len && tokens[pos].type === TokenType.Newline) pos++;
  }

  /** Parse a word token into a WordNode with parts */
  function parseWord(token: Token): WordNode {
    const parts = parseWordParts(token.value, token.type);
    return { type: 'Word', parts };
  }

  /** Break a word value into its constituent parts (literals, vars, command subs) */
  function parseWordParts(value: string, tokenType: TokenType): WordPart[] {
    if (tokenType === TokenType.SingleQuoted) {
      return [{ type: 'Literal', value, quoting: 'single' }];
    }
    if (tokenType === TokenType.DollarSingleQuoted) {
      return [{ type: 'Literal', value, quoting: 'dollar-single' }];
    }

    const quoting = tokenType === TokenType.DoubleQuoted ? 'double' : 'unquoted';

    // Fast path: no $ in value means no variables or command substitutions
    if (value.indexOf('$') === -1) {
      return [{ type: 'Literal', value, quoting }];
    }

    const parts: WordPart[] = [];
    let i = 0;
    const vlen = value.length;
    let litStart = 0; // track literal start for slice

    function flushLiteral() {
      if (i > litStart) {
        parts.push({ type: 'Literal', value: value.slice(litStart, i), quoting } as LiteralPart);
      }
    }

    while (i < vlen) {
      const cc = value.charCodeAt(i);

      if (cc !== 0x24 /* $ */) { i++; continue; }

      // We have a $ — check what follows
      if (i + 1 >= vlen) { i++; continue; }
      const next = value.charCodeAt(i + 1);

      // Command substitution: $(...)
      if (next === 0x28 /* ( */) {
        flushLiteral();
        i += 2;
        let depth = 1;
        const cmdStart = i;
        while (i < vlen && depth > 0) {
          const c = value.charCodeAt(i);
          if (c === 0x28) depth++;
          if (c === 0x29 /* ) */) { depth--; if (depth === 0) break; }
          i++;
        }
        parts.push({ type: 'CommandSubstitution', command: value.slice(cmdStart, i) } as CommandSubstitutionPart);
        if (i < vlen) i++; // skip )
        litStart = i;
        continue;
      }

      // Braced variable: ${VAR}
      if (next === 0x7B /* { */) {
        flushLiteral();
        i += 2;
        const varStart = i;
        while (i < vlen && value.charCodeAt(i) !== 0x7D /* } */) i++;
        parts.push({ type: 'Variable', name: value.slice(varStart, i), braced: true } as VariablePart);
        if (i < vlen) i++; // skip }
        litStart = i;
        continue;
      }

      // Simple variable: $VAR (starts with a-zA-Z_)
      if ((next >= 0x41 && next <= 0x5A) || (next >= 0x61 && next <= 0x7A) || next === 0x5F) {
        flushLiteral();
        i++; // skip $
        const varStart = i;
        i++; // skip first char (already validated)
        while (i < vlen) {
          const c = value.charCodeAt(i);
          if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c === 0x5F || (c >= 0x30 && c <= 0x39)) {
            i++;
          } else {
            break;
          }
        }
        parts.push({ type: 'Variable', name: value.slice(varStart, i), braced: false } as VariablePart);
        litStart = i;
        continue;
      }

      // Special variable: $? $# $! $$ $@ $0-$9
      if (next === 0x3F || next === 0x23 || next === 0x21 || next === 0x24 ||
          next === 0x40 || (next >= 0x30 && next <= 0x39)) {
        flushLiteral();
        i++; // skip $
        parts.push({ type: 'Variable', name: value[i++], braced: false } as VariablePart);
        litStart = i;
        continue;
      }

      // Just a literal $
      i++;
    }

    // Flush remaining literal
    if (i > litStart) {
      parts.push({ type: 'Literal', value: value.slice(litStart, i), quoting } as LiteralPart);
    }
    return parts.length > 0 ? parts : [{ type: 'Literal', value: '', quoting }];
  }

  function isWordToken(t: Token): boolean {
    return t.type === TokenType.Word
      || t.type === TokenType.SingleQuoted
      || t.type === TokenType.DoubleQuoted
      || t.type === TokenType.DollarSingleQuoted;
  }

  function isRedirectToken(t: Token): boolean {
    return t.type === TokenType.RedirectOut
      || t.type === TokenType.RedirectAppend
      || t.type === TokenType.RedirectIn
      || t.type === TokenType.HereString;
  }

  /** Check if a word token looks like an assignment: VAR=value */
  function isAssignment(t: Token): boolean {
    if (t.type !== TokenType.Word) return false;
    const v = t.value;
    const eq = v.indexOf('=');
    if (eq <= 0) return false;
    // Check first char: [a-zA-Z_]
    const c0 = v.charCodeAt(0);
    if (!((c0 >= 0x41 && c0 <= 0x5A) || (c0 >= 0x61 && c0 <= 0x7A) || c0 === 0x5F)) return false;
    // Check remaining chars before =: [a-zA-Z_0-9]
    for (let j = 1; j < eq; j++) {
      const c = v.charCodeAt(j);
      if (!((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || c === 0x5F || (c >= 0x30 && c <= 0x39))) return false;
    }
    return true;
  }

  function parseAssignment(t: Token): AssignmentNode {
    const eq = t.value.indexOf('=');
    const name = t.value.slice(0, eq);
    const rawValue = t.value.slice(eq + 1);
    const value = rawValue ? parseWord({ ...t, value: rawValue }) : null;
    return { type: 'Assignment', name, value };
  }

  function parseRedirect(): RedirectNode {
    const tok = advance();
    const fd = tok.fd ?? (tok.type === TokenType.RedirectIn ? 0 : 1);

    // fd-to-fd redirect (like 2>&1) — no target word token
    if (tok.targetFd !== undefined) {
      return {
        type: 'Redirect',
        op: '>',
        fd,
        target: { type: 'Word', parts: [{ type: 'Literal', value: `&${tok.targetFd}`, quoting: 'unquoted' }] },
        targetFd: tok.targetFd,
      };
    }

    let op: RedirectNode['op'];
    switch (tok.type) {
      case TokenType.RedirectOut: op = '>'; break;
      case TokenType.RedirectAppend: op = '>>'; break;
      case TokenType.RedirectIn: op = '<'; break;
      case TokenType.HereString: op = '<<<'; break;
      default: op = '>';
    }

    // The target word should be the next token (lexer already read it)
    const targetTok = advance();
    const target = parseWord(targetTok);

    return { type: 'Redirect', op, fd, target };
  }

  function parseSimpleCommand(): SimpleCommandNode {
    const assignments: AssignmentNode[] = [];
    const args: WordNode[] = [];
    const redirects: RedirectNode[] = [];
    let name: WordNode | null = null;

    // Leading assignments
    while (isAssignment(peek())) {
      assignments.push(parseAssignment(advance()));
    }

    // Command name
    if (isWordToken(peek())) {
      name = parseWord(advance());
    }

    // Arguments and redirects
    while (!isAtEnd()) {
      const t = peek();
      if (isRedirectToken(t)) {
        redirects.push(parseRedirect());
        continue;
      }
      if (t.type === TokenType.HereDoc) {
        const heredocTok = advance();
        const isQuoted = heredocTok.fd === 0;
        const quoting = isQuoted ? 'single' : 'unquoted';
        const parts: WordPart[] = isQuoted
          ? [{ type: 'Literal', value: heredocTok.value, quoting: 'single' }]
          : parseWordParts(heredocTok.value, TokenType.Word);
        redirects.push({
          type: 'Redirect',
          op: '<',
          fd: 0,
          target: { type: 'Word', parts },
        });
        continue;
      }
      if (isWordToken(t)) {
        args.push(parseWord(advance()));
        continue;
      }
      break;
    }

    return { type: 'SimpleCommand', assignments, name, args, redirects };
  }

  function parseCommand(): CommandNode {
    if (peek().type === TokenType.LeftParen) {
      advance(); // skip (
      skipNewlines();
      const body = parseScript();
      skipNewlines();
      expect(TokenType.RightParen);
      const redirects: RedirectNode[] = [];
      while (isRedirectToken(peek())) {
        redirects.push(parseRedirect());
      }
      return { type: 'Subshell', body, redirects } as SubshellNode;
    }
    return parseSimpleCommand();
  }

  function parsePipeline(): PipelineNode {
    const negated = peek().value === '!' && peek().type === TokenType.Word;
    if (negated) advance();

    const commands: CommandNode[] = [parseCommand()];
    while (peek().type === TokenType.Pipe) {
      advance();
      skipNewlines();
      commands.push(parseCommand());
    }
    return { type: 'Pipeline', commands, negated };
  }

  function parseAndOr(): StatementNode {
    let left: StatementNode = parsePipeline();

    while (peek().type === TokenType.And || peek().type === TokenType.Or) {
      const op = advance().type === TokenType.And ? '&&' : '||';
      skipNewlines();
      const right = parsePipeline();
      left = { type: 'LogicalExpr', operator: op, left, right } as LogicalExprNode;
    }

    return left;
  }

  function parseList(): StatementNode {
    let left = parseAndOr();

    while (isSeparator(peek())) {
      advance(); // skip ; or newline
      skipNewlines();
      if (isAtEnd() || peek().type === TokenType.RightParen) break;
      // Check if the next thing is just EOF or another separator
      if (isOperator(peek()) || isAtEnd()) break;
      const right = parseAndOr();
      left = { type: 'LogicalExpr', operator: ';', left, right } as LogicalExprNode;
    }

    return left;
  }

  function parseScript(): ScriptNode {
    skipNewlines();
    const body: StatementNode[] = [];

    while (!isAtEnd() && peek().type !== TokenType.RightParen) {
      // Handle bare assignments (no command following)
      if (isAssignment(peek())) {
        // Look ahead to see if there's a command after assignments
        let lookAhead = pos;
        while (lookAhead < tokens.length && isAssignment(tokens[lookAhead])) lookAhead++;
        if (lookAhead >= tokens.length || !isWordToken(tokens[lookAhead])
            || isSeparator(tokens[lookAhead]) || tokens[lookAhead].type === TokenType.EOF) {
          // Bare assignments
          const assignments: AssignmentNode[] = [];
          while (isAssignment(peek())) {
            assignments.push(parseAssignment(advance()));
          }
          body.push({ type: 'AssignmentStatement', assignments } as AssignmentStatementNode);
          skipNewlines();
          while (isSeparator(peek())) { advance(); skipNewlines(); }
          continue;
        }
      }

      body.push(parseList());
      skipNewlines();
      while (isSeparator(peek())) { advance(); skipNewlines(); }
    }

    return { type: 'Script', body };
  }

  return parseScript();
}
