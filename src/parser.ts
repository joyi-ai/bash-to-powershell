import {
  Token, TokenType,
  ScriptNode, StatementNode, PipelineNode, LogicalExprNode,
  CommandNode, SimpleCommandNode, SubshellNode,
  AssignmentNode, AssignmentStatementNode, RedirectNode, WordNode,
  WordPart, LiteralPart, VariablePart, CommandSubstitutionPart,
} from './types.js';

export function parse(tokens: Token[]): ScriptNode {
  let pos = 0;

  function peek(): Token {
    return tokens[pos] ?? { type: TokenType.EOF, value: '' };
  }

  function advance(): Token {
    return tokens[pos++] ?? { type: TokenType.EOF, value: '' };
  }

  function expect(type: TokenType): Token {
    const tok = advance();
    if (tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok.type} ("${tok.value}")`);
    }
    return tok;
  }

  function isAtEnd(): boolean {
    return peek().type === TokenType.EOF;
  }

  function isSeparator(t: Token): boolean {
    return t.type === TokenType.Semi || t.type === TokenType.Newline;
  }

  function isOperator(t: Token): boolean {
    return t.type === TokenType.And || t.type === TokenType.Or || isSeparator(t);
  }

  function skipNewlines(): void {
    while (peek().type === TokenType.Newline) advance();
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
    const parts: WordPart[] = [];
    let i = 0;
    let literal = '';

    function flushLiteral() {
      if (literal) {
        parts.push({ type: 'Literal', value: literal, quoting } as LiteralPart);
        literal = '';
      }
    }

    while (i < value.length) {
      const ch = value[i];

      // Command substitution: $(...)
      if (ch === '$' && value[i + 1] === '(') {
        flushLiteral();
        i += 2;
        let depth = 1;
        let cmd = '';
        while (i < value.length && depth > 0) {
          if (value[i] === '(') depth++;
          if (value[i] === ')') { depth--; if (depth === 0) { i++; break; } }
          cmd += value[i++];
        }
        parts.push({ type: 'CommandSubstitution', command: cmd } as CommandSubstitutionPart);
        continue;
      }

      // Braced variable: ${VAR}
      if (ch === '$' && value[i + 1] === '{') {
        flushLiteral();
        i += 2;
        let varName = '';
        while (i < value.length && value[i] !== '}') varName += value[i++];
        if (i < value.length) i++; // skip }
        parts.push({ type: 'Variable', name: varName, braced: true } as VariablePart);
        continue;
      }

      // Simple variable: $VAR or $? $# $! $$ $@ $0-$9
      if (ch === '$' && i + 1 < value.length) {
        const next = value[i + 1];
        if (/[a-zA-Z_]/.test(next)) {
          flushLiteral();
          i++; // skip $
          let varName = '';
          while (i < value.length && /[a-zA-Z_0-9]/.test(value[i])) {
            varName += value[i++];
          }
          parts.push({ type: 'Variable', name: varName, braced: false } as VariablePart);
          continue;
        }
        if (/[?#!$@0-9]/.test(next)) {
          flushLiteral();
          i++; // skip $
          parts.push({ type: 'Variable', name: value[i++], braced: false } as VariablePart);
          continue;
        }
      }

      literal += value[i++];
    }

    flushLiteral();
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
    const eq = t.value.indexOf('=');
    if (eq <= 0) return false;
    const name = t.value.slice(0, eq);
    return /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(name);
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
