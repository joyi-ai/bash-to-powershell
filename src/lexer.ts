import { Token, TokenType } from './types.js';

// Lookup table: 1 = metacharacter
const META = new Uint8Array(128);
META[0x7C] = 1; // |
META[0x26] = 1; // &
META[0x3B] = 1; // ;
META[0x28] = 1; // (
META[0x29] = 1; // )
META[0x3C] = 1; // <
META[0x3E] = 1; // >
META[0x20] = 1; // space
META[0x09] = 1; // tab
META[0x0A] = 1; // \n
META[0x0D] = 1; // \r

// Lookup table: 1 = valid in variable name body [a-zA-Z_0-9]
const VAR_BODY = new Uint8Array(128);
for (let c = 48; c <= 57; c++) VAR_BODY[c] = 1;  // 0-9
for (let c = 65; c <= 90; c++) VAR_BODY[c] = 1;  // A-Z
for (let c = 97; c <= 122; c++) VAR_BODY[c] = 1; // a-z
VAR_BODY[95] = 1; // _

// Lookup table: 1 = valid variable start [a-zA-Z_]
const VAR_START = new Uint8Array(128);
for (let c = 65; c <= 90; c++) VAR_START[c] = 1;
for (let c = 97; c <= 122; c++) VAR_START[c] = 1;
VAR_START[95] = 1;

// Lookup table: 1 = special single-char var [?#!$@0-9]
const SPECIAL_VAR = new Uint8Array(128);
SPECIAL_VAR[63] = 1;  // ?
SPECIAL_VAR[35] = 1;  // #
SPECIAL_VAR[33] = 1;  // !
SPECIAL_VAR[36] = 1;  // $
SPECIAL_VAR[64] = 1;  // @
for (let c = 48; c <= 57; c++) SPECIAL_VAR[c] = 1; // 0-9

// Char codes
const C_SQ = 39;    // '
const C_DQ = 34;    // "
const C_BS = 92;    // \
const C_DL = 36;    // $
const C_LP = 40;    // (
const C_RP = 41;    // )
const C_LB = 123;   // {
const C_RB = 125;   // }
const C_NL = 10;    // \n
const C_SP = 32;    // space
const C_TB = 9;     // tab
const C_HS = 35;    // #
const C_PI = 124;   // |
const C_AM = 38;    // &
const C_SC = 59;    // ;
const C_LT = 60;    // <
const C_GT = 62;    // >
const C_BT = 96;    // `
const C_0 = 48;     // '0'
const C_7 = 55;     // '7'
const C_9 = 57;     // '9'
const C_DASH = 45;  // '-'

// Hex char lookup
const HEX = new Uint8Array(128);
for (let c = 48; c <= 57; c++) HEX[c] = 1;
for (let c = 65; c <= 70; c++) HEX[c] = 1;
for (let c = 97; c <= 102; c++) HEX[c] = 1;

export function lex(input: string): Token[] {
  const tokens: Token[] = [];
  const len = input.length;
  let i = 0;

  function readSingleQuoted(): string {
    i++; // skip opening '
    const start = i;
    while (i < len && input.charCodeAt(i) !== C_SQ) i++;
    const value = input.slice(start, i);
    if (i < len) i++; // skip closing '
    return value;
  }

  function readDoubleQuoted(): string {
    i++; // skip opening "
    // Fast path: scan for backslash or closing quote
    const start = i;
    while (i < len) {
      const c = input.charCodeAt(i);
      if (c === C_DQ) {
        const value = input.slice(start, i);
        i++; // skip closing "
        return value;
      }
      if (c === C_BS) break; // escape found, switch to slow path
      i++;
    }
    // Slow path: has backslash escapes
    let value = input.slice(start, i);
    while (i < len) {
      const c = input.charCodeAt(i);
      if (c === C_DQ) { i++; return value; }
      if (c === C_BS && i + 1 < len) {
        const next = input.charCodeAt(i + 1);
        if (next === C_DQ || next === C_BS || next === C_DL || next === C_BT || next === C_NL) {
          i++; // skip backslash
          if (next === C_NL) { i++; continue; } // line continuation
          value += input[i++];
          continue;
        }
      }
      value += input[i++];
    }
    return value;
  }

  function readDollarSingleQuoted(): string {
    i += 2; // skip $'
    let value = '';
    while (i < len) {
      const c = input.charCodeAt(i);
      if (c === C_SQ) { i++; return value; }
      if (c === C_BS) {
        i++; // skip backslash
        if (i >= len) break;
        const esc = input[i++];
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
            let oct = '';
            while (oct.length < 3 && i < len && input.charCodeAt(i) >= C_0 && input.charCodeAt(i) <= C_7) {
              oct += input[i++];
            }
            value += oct ? String.fromCharCode(parseInt(oct, 8)) : '\0';
            break;
          }
          case 'x': {
            let hex = '';
            while (hex.length < 2 && i < len && HEX[input.charCodeAt(i)]) {
              hex += input[i++];
            }
            if (hex) value += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          case 'u': {
            let hex = '';
            while (hex.length < 4 && i < len && HEX[input.charCodeAt(i)]) {
              hex += input[i++];
            }
            if (hex) value += String.fromCodePoint(parseInt(hex, 16));
            break;
          }
          default: value += esc; break;
        }
        continue;
      }
      value += input[i++];
    }
    return value;
  }

  function readCommandSubstitution(): string {
    i += 2; // skip $(
    let depth = 1;
    let content = '';
    while (i < len && depth > 0) {
      const c = input.charCodeAt(i);
      if (c === C_LP) { depth++; content += input[i++]; continue; }
      if (c === C_RP) {
        depth--;
        if (depth === 0) { i++; break; }
        content += input[i++];
        continue;
      }
      if (c === C_SQ) {
        content += "'";
        i++;
        while (i < len && input.charCodeAt(i) !== C_SQ) content += input[i++];
        if (i < len) { content += "'"; i++; }
        continue;
      }
      if (c === C_DQ) {
        content += '"';
        i++;
        while (i < len) {
          if (input.charCodeAt(i) === C_BS && i + 1 < len && (input.charCodeAt(i + 1) === C_DQ || input.charCodeAt(i + 1) === C_BS)) {
            content += input[i++]; content += input[i++];
            continue;
          }
          if (input.charCodeAt(i) === C_DQ) { content += '"'; i++; break; }
          content += input[i++];
        }
        continue;
      }
      content += input[i++];
    }
    return content;
  }

  function readUnquotedSegment(): string {
    const start = i;
    while (i < len) {
      const c = input.charCodeAt(i);
      if (c < 128 && META[c]) break;
      if (c === C_SQ || c === C_DQ) break;
      if (c === C_DL && i + 1 < len) {
        const next = input.charCodeAt(i + 1);
        if (next === C_LP || next === C_SQ || next === C_LB) break;
        if (next < 128 && (VAR_START[next] || SPECIAL_VAR[next])) break;
      }
      if (c === C_BS) {
        // Flush what we have, then handle escape
        let value = input.slice(start, i);
        i++; // skip backslash
        if (i < len && input.charCodeAt(i) !== C_NL) {
          value += input[i++];
        }
        if (i < len && input.charCodeAt(i) === C_NL) i++;
        // Continue building with concat from here
        while (i < len) {
          const c2 = input.charCodeAt(i);
          if (c2 < 128 && META[c2]) break;
          if (c2 === C_SQ || c2 === C_DQ) break;
          if (c2 === C_DL && i + 1 < len) {
            const next = input.charCodeAt(i + 1);
            if (next === C_LP || next === C_SQ || next === C_LB) break;
            if (next < 128 && (VAR_START[next] || SPECIAL_VAR[next])) break;
          }
          if (c2 === C_BS) {
            i++;
            if (i < len && input.charCodeAt(i) !== C_NL) value += input[i++];
            if (i < len && input.charCodeAt(i) === C_NL) i++;
            continue;
          }
          value += input[i++];
        }
        return value;
      }
      i++;
    }
    return input.slice(start, i);
  }

  function readWord(): Token {
    let fullValue = '';
    let tokenType = TokenType.Word;
    let hasSingleQuote = false;
    let hasDoubleQuote = false;
    let hasDollarSingle = false;
    let segCount = 0;

    while (i < len) {
      const c = input.charCodeAt(i);
      if (c < 128 && META[c]) break;

      if (c === C_SQ) {
        // Check it's not $'...' (handled below)
        if (i === 0 || input.charCodeAt(i - 1) !== C_DL) {
          const content = readSingleQuoted();
          fullValue += content;
          hasSingleQuote = true;
          segCount++;
          continue;
        }
        const content = readSingleQuoted();
        fullValue += content;
        hasSingleQuote = true;
        segCount++;
        continue;
      }

      if (c === C_DQ) {
        const content = readDoubleQuoted();
        fullValue += content;
        hasDoubleQuote = true;
        segCount++;
        continue;
      }

      if (c === C_DL && i + 1 < len) {
        const next = input.charCodeAt(i + 1);

        if (next === C_SQ) {
          const content = readDollarSingleQuoted();
          fullValue += content;
          hasDollarSingle = true;
          segCount++;
          continue;
        }

        if (next === C_LP) {
          const cmd = readCommandSubstitution();
          fullValue += '$(' + cmd + ')';
          segCount++;
          continue;
        }

        if (next === C_LB) {
          i += 2; // skip ${
          const start = i;
          while (i < len && input.charCodeAt(i) !== C_RB) i++;
          const varName = input.slice(start, i);
          if (i < len) i++; // skip }
          fullValue += '${' + varName + '}';
          segCount++;
          continue;
        }

        if (next < 128 && (VAR_START[next] || SPECIAL_VAR[next])) {
          i++; // skip $
          let varName: string;
          if (SPECIAL_VAR[next] && !VAR_START[next]) {
            varName = input[i++]; // special single-char vars
          } else {
            const start = i;
            while (i < len && input.charCodeAt(i) < 128 && VAR_BODY[input.charCodeAt(i)]) i++;
            varName = input.slice(start, i);
          }
          fullValue += '$' + varName;
          segCount++;
          continue;
        }
      }

      // Unquoted segment
      const seg = readUnquotedSegment();
      if (seg === '' && i < len && !(input.charCodeAt(i) < 128 && META[input.charCodeAt(i)])) {
        fullValue += input[i++];
        segCount++;
        continue;
      }
      if (seg === '') break;
      fullValue += seg;
      segCount++;
    }

    if (hasDollarSingle) tokenType = TokenType.DollarSingleQuoted;
    else if (hasSingleQuote && !hasDoubleQuote) tokenType = TokenType.SingleQuoted;
    else if (hasDoubleQuote) tokenType = TokenType.DoubleQuoted;

    return { type: tokenType, value: fullValue };
  }

  while (i < len) {
    // Skip whitespace inline
    let c = input.charCodeAt(i);
    while (c === C_SP || c === C_TB) {
      i++;
      if (i >= len) break;
      c = input.charCodeAt(i);
    }
    if (i >= len) break;

    // Comment
    if (c === C_HS) {
      while (i < len && input.charCodeAt(i) !== C_NL) i++;
      continue;
    }

    // Newline
    if (c === C_NL) {
      i++;
      const last = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
      if (last && last.type !== TokenType.Semi && last.type !== TokenType.And
          && last.type !== TokenType.Or && last.type !== TokenType.Pipe
          && last.type !== TokenType.Newline) {
        tokens.push({ type: TokenType.Newline, value: '\n' });
      }
      continue;
    }

    // Operators
    if (c === C_PI) {
      if (i + 1 < len && input.charCodeAt(i + 1) === C_PI) {
        i += 2;
        tokens.push({ type: TokenType.Or, value: '||' });
      } else {
        i++;
        tokens.push({ type: TokenType.Pipe, value: '|' });
      }
      continue;
    }
    if (c === C_AM) {
      if (i + 1 < len && input.charCodeAt(i + 1) === C_AM) {
        i += 2;
        tokens.push({ type: TokenType.And, value: '&&' });
      } else {
        i++;
        tokens.push({ type: TokenType.Background, value: '&' });
      }
      continue;
    }
    if (c === C_SC) {
      i++;
      tokens.push({ type: TokenType.Semi, value: ';' });
      continue;
    }

    // Parens
    if (c === C_LP) {
      i++;
      tokens.push({ type: TokenType.LeftParen, value: '(' });
      continue;
    }
    if (c === C_RP) {
      i++;
      tokens.push({ type: TokenType.RightParen, value: ')' });
      continue;
    }

    // Redirects with fd prefix: 2>, 2>>, 2>&1
    if (c >= C_0 && c <= C_9 && i + 1 < len) {
      const nextC = input.charCodeAt(i + 1);
      if (nextC === C_GT || nextC === C_LT) {
        const fd = c - C_0;
        i++; // consume digit
        const op = input.charCodeAt(i);
        if (op === C_GT && i + 1 < len && input.charCodeAt(i + 1) === C_GT) {
          i += 2;
          while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
          const target = readWord();
          tokens.push({ type: TokenType.RedirectAppend, value: '>>', fd });
          tokens.push(target);
          continue;
        }
        if (op === C_GT && i + 1 < len && input.charCodeAt(i + 1) === C_AM) {
          i += 2;
          const fdStart = i;
          while (i < len && input.charCodeAt(i) >= C_0 && input.charCodeAt(i) <= C_9) i++;
          tokens.push({ type: TokenType.RedirectOut, value: '>', fd, targetFd: parseInt(input.slice(fdStart, i), 10) });
          continue;
        }
        if (op === C_GT) {
          i++;
          while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
          const target = readWord();
          tokens.push({ type: TokenType.RedirectOut, value: '>', fd });
          tokens.push(target);
          continue;
        }
        if (op === C_LT) {
          i++;
          while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
          const target = readWord();
          tokens.push({ type: TokenType.RedirectIn, value: '<', fd });
          tokens.push(target);
          continue;
        }
        i--; // back up the digit
      }
    }

    // Heredoc << and here-string <<<
    if (c === C_LT && i + 1 < len && input.charCodeAt(i + 1) === C_LT) {
      if (i + 2 < len && input.charCodeAt(i + 2) === C_LT) {
        // Here-string <<<
        i += 3;
        while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
        const target = readWord();
        tokens.push({ type: TokenType.HereString, value: '<<<' });
        tokens.push(target);
        continue;
      }
      i += 2; // skip <<
      const stripTabs = i < len && input.charCodeAt(i) === C_DASH;
      if (stripTabs) i++;

      while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;

      // Read delimiter
      let delimiter = '';
      let quoted = false;
      if (i < len && input.charCodeAt(i) === C_SQ) {
        i++;
        const start = i;
        while (i < len && input.charCodeAt(i) !== C_SQ) i++;
        delimiter = input.slice(start, i);
        if (i < len) i++;
        quoted = true;
      } else if (i < len && input.charCodeAt(i) === C_DQ) {
        i++;
        const start = i;
        while (i < len && input.charCodeAt(i) !== C_DQ) i++;
        delimiter = input.slice(start, i);
        if (i < len) i++;
        quoted = true;
      } else {
        const start = i;
        while (i < len && input.charCodeAt(i) !== C_NL && input.charCodeAt(i) !== C_SP && input.charCodeAt(i) !== C_TB) i++;
        delimiter = input.slice(start, i);
      }

      // Skip to next newline
      while (i < len && input.charCodeAt(i) !== C_NL) i++;
      if (i < len) i++;

      // Read heredoc body
      let body = '';
      while (i < len) {
        const lineStart = i;
        while (i < len && input.charCodeAt(i) !== C_NL) i++;
        const line = input.slice(lineStart, i);
        if (i < len) i++;

        const trimmedLine = stripTabs ? line.replace(/^\t+/, '') : line;
        if (trimmedLine === delimiter) break;
        body += line + '\n';
      }

      if (body.endsWith('\n')) body = body.slice(0, -1);

      tokens.push({
        type: TokenType.HereDoc,
        value: body,
        fd: quoted ? 0 : 1,
      });
      continue;
    }

    // Simple redirects (no fd prefix)
    if (c === C_GT) {
      if (i + 1 < len && input.charCodeAt(i + 1) === C_GT) {
        i += 2;
        while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
        const target = readWord();
        tokens.push({ type: TokenType.RedirectAppend, value: '>>' });
        tokens.push(target);
        continue;
      }
      i++;
      if (i < len && input.charCodeAt(i) === C_AM) {
        i++;
        const fdStart = i;
        while (i < len && input.charCodeAt(i) >= C_0 && input.charCodeAt(i) <= C_9) i++;
        tokens.push({ type: TokenType.RedirectOut, value: '>', fd: 1, targetFd: parseInt(input.slice(fdStart, i), 10) });
        continue;
      }
      while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
      const target = readWord();
      tokens.push({ type: TokenType.RedirectOut, value: '>' });
      tokens.push(target);
      continue;
    }
    if (c === C_LT) {
      i++;
      while (i < len && (input.charCodeAt(i) === C_SP || input.charCodeAt(i) === C_TB)) i++;
      const target = readWord();
      tokens.push({ type: TokenType.RedirectIn, value: '<' });
      tokens.push(target);
      continue;
    }

    // Word
    const word = readWord();
    if (word.value !== '') {
      tokens.push(word);
    }
  }

  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}
