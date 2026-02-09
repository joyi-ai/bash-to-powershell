import { Token, TokenType } from './types.js';

const METACHAR = new Set(['|', '&', ';', '(', ')', '<', '>', ' ', '\t', '\n', '\r']);

export function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  function peek(offset = 0): string {
    return input[i + offset] ?? '';
  }

  function advance(n = 1): string {
    const s = input.slice(i, i + n);
    i += n;
    return s;
  }

  function atEnd(): boolean {
    return i >= input.length;
  }

  /** Read a single-quoted string: 'content' */
  function readSingleQuoted(): string {
    advance(); // skip opening '
    let value = '';
    while (!atEnd()) {
      if (peek() === "'") {
        advance(); // skip closing '
        return value;
      }
      value += advance();
    }
    // Unterminated — return what we have
    return value;
  }

  /** Read a double-quoted string: "content" (returns raw content, caller handles parts) */
  function readDoubleQuoted(): string {
    advance(); // skip opening "
    let value = '';
    while (!atEnd()) {
      const ch = peek();
      if (ch === '"') {
        advance(); // skip closing "
        return value;
      }
      if (ch === '\\') {
        const next = peek(1);
        if (next === '"' || next === '\\' || next === '$' || next === '`' || next === '\n') {
          advance(); // skip backslash
          if (next === '\n') {
            advance(); // line continuation, skip both
            continue;
          }
          value += advance();
          continue;
        }
        // backslash is literal if next char isn't special
        value += advance();
        continue;
      }
      value += advance();
    }
    return value;
  }

  /** Read $'...' (C-style escapes) */
  function readDollarSingleQuoted(): string {
    advance(2); // skip $'
    let value = '';
    while (!atEnd()) {
      if (peek() === "'") {
        advance();
        return value;
      }
      if (peek() === '\\') {
        advance(); // skip backslash
        if (atEnd()) break;
        const esc = advance();
        switch (esc) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case "'": value += "'"; break;
          case '"': value += '"'; break;
          case 'a': value += '\x07'; break;
          case 'b': value += '\b'; break;
          case 'e': case 'E': value += '\x1b'; break;
          case '0': {
            // Octal: \0NNN
            let oct = '';
            while (oct.length < 3 && !atEnd() && peek() >= '0' && peek() <= '7') {
              oct += advance();
            }
            value += oct ? String.fromCharCode(parseInt(oct, 8)) : '\0';
            break;
          }
          case 'x': {
            // Hex: \xHH
            let hex = '';
            while (hex.length < 2 && !atEnd() && /[0-9a-fA-F]/.test(peek())) {
              hex += advance();
            }
            if (hex) value += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          case 'u': {
            // Unicode: \uHHHH
            let hex = '';
            while (hex.length < 4 && !atEnd() && /[0-9a-fA-F]/.test(peek())) {
              hex += advance();
            }
            if (hex) value += String.fromCodePoint(parseInt(hex, 16));
            break;
          }
          default: value += esc; break;
        }
        continue;
      }
      value += advance();
    }
    return value;
  }

  /** Read a $(...) command substitution, tracking nested parens */
  function readCommandSubstitution(): string {
    advance(2); // skip $(
    let depth = 1;
    let content = '';
    while (!atEnd() && depth > 0) {
      const ch = peek();
      if (ch === '(') depth++;
      if (ch === ')') {
        depth--;
        if (depth === 0) { advance(); break; }
      }
      // Handle quoted strings inside substitution
      if (ch === "'") {
        content += "'";
        advance();
        while (!atEnd() && peek() !== "'") content += advance();
        if (!atEnd()) { content += "'"; advance(); }
        continue;
      }
      if (ch === '"') {
        content += '"';
        advance();
        while (!atEnd()) {
          if (peek() === '\\' && (peek(1) === '"' || peek(1) === '\\')) {
            content += advance() + advance();
            continue;
          }
          if (peek() === '"') { content += '"'; advance(); break; }
          content += advance();
        }
        continue;
      }
      content += advance();
    }
    return content;
  }

  /** Read an unquoted word segment (stops at metachar or quote) */
  function readUnquotedSegment(): string {
    let value = '';
    while (!atEnd()) {
      const ch = peek();
      if (METACHAR.has(ch) || ch === "'" || ch === '"') break;
      if (ch === '$' && (peek(1) === '(' || peek(1) === "'" || peek(1) === '{')) break;
      if (ch === '$' && /[a-zA-Z_@?#!$0-9]/.test(peek(1))) break;
      if (ch === '\\') {
        advance(); // skip backslash
        if (!atEnd() && peek() !== '\n') {
          value += advance(); // escaped char
        }
        // if \n, it's line continuation — skip both
        if (!atEnd() && peek() === '\n') advance();
        continue;
      }
      value += advance();
    }
    return value;
  }

  /** Read a complete word token (may be composed of multiple segments) */
  function readWord(): Token {
    let fullValue = '';
    let tokenType = TokenType.Word;
    let hasSingleQuote = false;
    let hasDoubleQuote = false;
    let hasDollarSingle = false;

    while (!atEnd()) {
      const ch = peek();
      if (METACHAR.has(ch)) break;

      if (ch === "'" && peek(-1 + i < 0 ? 0 : 0) !== '$') {
        // Check it's not $'...' (handled below)
        if (i === 0 || input[i - 1] !== '$') {
          const content = readSingleQuoted();
          fullValue += content;
          hasSingleQuote = true;
          continue;
        }
      }

      if (ch === "'") {
        const content = readSingleQuoted();
        fullValue += content;
        hasSingleQuote = true;
        continue;
      }

      if (ch === '"') {
        const content = readDoubleQuoted();
        fullValue += content;
        hasDoubleQuote = true;
        continue;
      }

      if (ch === '$' && peek(1) === "'") {
        const content = readDollarSingleQuoted();
        fullValue += content;
        hasDollarSingle = true;
        continue;
      }

      if (ch === '$' && peek(1) === '(') {
        const cmd = readCommandSubstitution();
        fullValue += '$(' + cmd + ')';
        continue;
      }

      if (ch === '$' && peek(1) === '{') {
        // ${VAR} — read until }
        advance(2); // skip ${
        let varName = '';
        while (!atEnd() && peek() !== '}') varName += advance();
        if (!atEnd()) advance(); // skip }
        fullValue += '${' + varName + '}';
        continue;
      }

      if (ch === '$' && /[a-zA-Z_@?#!$0-9]/.test(peek(1))) {
        advance(); // skip $
        let varName = '';
        if (/[?#!$@0-9]/.test(peek())) {
          varName = advance(); // special single-char vars
        } else {
          while (!atEnd() && /[a-zA-Z_0-9]/.test(peek())) {
            varName += advance();
          }
        }
        fullValue += '$' + varName;
        continue;
      }

      // Unquoted segment
      const seg = readUnquotedSegment();
      if (!seg && !atEnd() && !METACHAR.has(peek())) {
        // Avoid infinite loop on unexpected chars
        fullValue += advance();
        continue;
      }
      fullValue += seg;
      if (seg === '') break;
    }

    if (hasDollarSingle) tokenType = TokenType.DollarSingleQuoted;
    else if (hasSingleQuote && !hasDoubleQuote) tokenType = TokenType.SingleQuoted;
    else if (hasDoubleQuote) tokenType = TokenType.DoubleQuoted;

    return { type: tokenType, value: fullValue };
  }

  function skipWhitespace(): void {
    while (!atEnd() && (peek() === ' ' || peek() === '\t')) {
      advance();
    }
  }

  function skipComment(): void {
    if (peek() === '#') {
      while (!atEnd() && peek() !== '\n') advance();
    }
  }

  while (!atEnd()) {
    skipWhitespace();
    if (atEnd()) break;

    const ch = peek();

    // Comment
    if (ch === '#') {
      skipComment();
      continue;
    }

    // Newline — treat as statement separator
    if (ch === '\n') {
      advance();
      // Collapse multiple newlines and skip if last token was already a separator
      const last = tokens[tokens.length - 1];
      if (last && last.type !== TokenType.Semi && last.type !== TokenType.And
          && last.type !== TokenType.Or && last.type !== TokenType.Pipe
          && last.type !== TokenType.Newline) {
        tokens.push({ type: TokenType.Newline, value: '\n' });
      }
      continue;
    }

    // Operators
    if (ch === '|' && peek(1) === '|') {
      advance(2);
      tokens.push({ type: TokenType.Or, value: '||' });
      continue;
    }
    if (ch === '|') {
      advance();
      tokens.push({ type: TokenType.Pipe, value: '|' });
      continue;
    }
    if (ch === '&' && peek(1) === '&') {
      advance(2);
      tokens.push({ type: TokenType.And, value: '&&' });
      continue;
    }
    if (ch === '&') {
      // Background operator — treat as end of statement for simplicity
      advance();
      tokens.push({ type: TokenType.Semi, value: ';' });
      continue;
    }
    if (ch === ';') {
      advance();
      tokens.push({ type: TokenType.Semi, value: ';' });
      continue;
    }

    // Parens
    if (ch === '(') {
      advance();
      tokens.push({ type: TokenType.LeftParen, value: '(' });
      continue;
    }
    if (ch === ')') {
      advance();
      tokens.push({ type: TokenType.RightParen, value: ')' });
      continue;
    }

    // Redirects
    // Check for fd number prefix: 1>, 2>, 2>>, 2>&1, etc.
    if (/[0-9]/.test(ch) && (peek(1) === '>' || peek(1) === '<')) {
      const fd = parseInt(advance(), 10);
      const op = peek();
      if (op === '>' && peek(1) === '>') {
        advance(2);
        skipWhitespace();
        const target = readWord();
        tokens.push({ type: TokenType.RedirectAppend, value: '>>', fd });
        tokens.push(target);
        continue;
      }
      if (op === '>' && peek(1) === '&') {
        advance(2); // skip >&
        let targetFd = '';
        while (!atEnd() && /[0-9]/.test(peek())) targetFd += advance();
        tokens.push({ type: TokenType.RedirectOut, value: '>', fd, targetFd: parseInt(targetFd, 10) });
        continue;
      }
      if (op === '>') {
        advance();
        skipWhitespace();
        const target = readWord();
        tokens.push({ type: TokenType.RedirectOut, value: '>', fd });
        tokens.push(target);
        continue;
      }
      if (op === '<') {
        advance();
        skipWhitespace();
        const target = readWord();
        tokens.push({ type: TokenType.RedirectIn, value: '<', fd });
        tokens.push(target);
        continue;
      }
      // Not actually a redirect, treat the digit as start of a word
      i--; // back up the digit
    }

    // Heredoc <<
    if (ch === '<' && peek(1) === '<') {
      if (peek(2) === '<') {
        // Here-string <<<
        advance(3);
        skipWhitespace();
        const target = readWord();
        tokens.push({ type: TokenType.HereString, value: '<<<' });
        tokens.push(target);
        continue;
      }
      advance(2); // skip <<
      const stripTabs = peek() === '-';
      if (stripTabs) advance();

      skipWhitespace();

      // Read delimiter (may be quoted)
      let delimiter = '';
      let quoted = false;
      if (peek() === "'") {
        advance();
        while (!atEnd() && peek() !== "'") delimiter += advance();
        if (!atEnd()) advance();
        quoted = true;
      } else if (peek() === '"') {
        advance();
        while (!atEnd() && peek() !== '"') delimiter += advance();
        if (!atEnd()) advance();
        quoted = true;
      } else {
        while (!atEnd() && peek() !== '\n' && peek() !== ' ' && peek() !== '\t') {
          delimiter += advance();
        }
      }

      // Skip to next newline
      while (!atEnd() && peek() !== '\n') advance();
      if (!atEnd()) advance(); // skip the newline

      // Read heredoc body until delimiter on its own line
      let body = '';
      while (!atEnd()) {
        let line = '';
        while (!atEnd() && peek() !== '\n') line += advance();
        if (!atEnd()) advance(); // skip newline

        const trimmedLine = stripTabs ? line.replace(/^\t+/, '') : line;
        if (trimmedLine === delimiter) break;
        body += line + '\n';
      }

      // Remove trailing newline from body
      if (body.endsWith('\n')) body = body.slice(0, -1);

      tokens.push({
        type: TokenType.HereDoc,
        value: body,
        fd: quoted ? 0 : 1, // Reuse fd: 0 = quoted (no expansion), 1 = unquoted (expand)
      });
      continue;
    }

    // Simple redirects (no fd prefix)
    if (ch === '>' && peek(1) === '>') {
      advance(2);
      skipWhitespace();
      const target = readWord();
      tokens.push({ type: TokenType.RedirectAppend, value: '>>' });
      tokens.push(target);
      continue;
    }
    if (ch === '>') {
      advance();
      if (peek() === '&') {
        advance();
        let targetFd = '';
        while (!atEnd() && /[0-9]/.test(peek())) targetFd += advance();
        tokens.push({ type: TokenType.RedirectOut, value: '>', fd: 1, targetFd: parseInt(targetFd, 10) });
        continue;
      }
      skipWhitespace();
      const target = readWord();
      tokens.push({ type: TokenType.RedirectOut, value: '>' });
      tokens.push(target);
      continue;
    }
    if (ch === '<') {
      advance();
      skipWhitespace();
      const target = readWord();
      tokens.push({ type: TokenType.RedirectIn, value: '<' });
      tokens.push(target);
      continue;
    }

    // Word (command name, argument, etc.)
    const word = readWord();
    if (word.value !== '') {
      tokens.push(word);
    }
  }

  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}
