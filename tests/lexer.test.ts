import { describe, it, expect } from 'vitest';
import { lex } from '../src/lexer.js';
import { TokenType } from '../src/types.js';

describe('lexer', () => {
  it('tokenizes a simple command', () => {
    const tokens = lex('echo hello');
    expect(tokens[0]).toMatchObject({ type: TokenType.Word, value: 'echo' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Word, value: 'hello' });
    expect(tokens[2]).toMatchObject({ type: TokenType.EOF });
  });

  it('handles single-quoted strings', () => {
    const tokens = lex("echo 'hello world'");
    expect(tokens[0]).toMatchObject({ type: TokenType.Word, value: 'echo' });
    expect(tokens[1]).toMatchObject({ type: TokenType.SingleQuoted, value: 'hello world' });
  });

  it('handles double-quoted strings', () => {
    const tokens = lex('echo "hello world"');
    expect(tokens[0]).toMatchObject({ type: TokenType.Word, value: 'echo' });
    expect(tokens[1]).toMatchObject({ type: TokenType.DoubleQuoted, value: 'hello world' });
  });

  it('handles double-quoted strings with escaped quotes', () => {
    const tokens = lex('echo "say \\"hi\\""');
    expect(tokens[1]).toMatchObject({ type: TokenType.DoubleQuoted, value: 'say "hi"' });
  });

  it('handles $\\\'...\\\'  (C-style escapes)', () => {
    const tokens = lex("echo $'hello\\nworld'");
    expect(tokens[1]).toMatchObject({ type: TokenType.DollarSingleQuoted, value: 'hello\nworld' });
  });

  it('handles variable references in words', () => {
    const tokens = lex('echo $HOME');
    expect(tokens[1]).toMatchObject({ type: TokenType.Word, value: '$HOME' });
  });

  it('handles ${VAR} syntax', () => {
    const tokens = lex('echo ${HOME}');
    expect(tokens[1]).toMatchObject({ type: TokenType.Word, value: '${HOME}' });
  });

  it('handles command substitution', () => {
    const tokens = lex('echo $(date)');
    expect(tokens[1]).toMatchObject({ type: TokenType.Word, value: '$(date)' });
  });

  it('tokenizes pipes', () => {
    const tokens = lex('echo hello | grep hello');
    expect(tokens[2]).toMatchObject({ type: TokenType.Pipe, value: '|' });
  });

  it('tokenizes && and ||', () => {
    const tokens = lex('cmd1 && cmd2 || cmd3');
    expect(tokens[1]).toMatchObject({ type: TokenType.And, value: '&&' });
    expect(tokens[3]).toMatchObject({ type: TokenType.Or, value: '||' });
  });

  it('tokenizes semicolons', () => {
    const tokens = lex('cmd1 ; cmd2');
    expect(tokens[1]).toMatchObject({ type: TokenType.Semi, value: ';' });
  });

  it('tokenizes redirects', () => {
    const tokens = lex('echo hi > file.txt');
    expect(tokens[2]).toMatchObject({ type: TokenType.RedirectOut, value: '>' });
    expect(tokens[3]).toMatchObject({ type: TokenType.Word, value: 'file.txt' });
  });

  it('tokenizes append redirect', () => {
    const tokens = lex('echo hi >> file.txt');
    expect(tokens[2]).toMatchObject({ type: TokenType.RedirectAppend, value: '>>' });
  });

  it('tokenizes fd redirect 2>&1', () => {
    const tokens = lex('cmd 2>&1');
    expect(tokens[1]).toMatchObject({ type: TokenType.RedirectOut, fd: 2, targetFd: 1 });
  });

  it('tokenizes 2>/dev/null', () => {
    const tokens = lex('cmd 2>/dev/null');
    expect(tokens[1]).toMatchObject({ type: TokenType.RedirectOut, fd: 2 });
    expect(tokens[2]).toMatchObject({ type: TokenType.Word, value: '/dev/null' });
  });

  it('handles parentheses for subshells', () => {
    const tokens = lex('(echo hello)');
    expect(tokens[0]).toMatchObject({ type: TokenType.LeftParen });
    expect(tokens[3]).toMatchObject({ type: TokenType.RightParen });
  });

  it('handles backslash escaping in unquoted words', () => {
    const tokens = lex('echo hello\\ world');
    expect(tokens[1]).toMatchObject({ type: TokenType.Word, value: 'hello world' });
  });

  it('handles heredocs', () => {
    const tokens = lex('cat <<EOF\nhello\nworld\nEOF');
    expect(tokens[0]).toMatchObject({ type: TokenType.Word, value: 'cat' });
    expect(tokens[1]).toMatchObject({ type: TokenType.HereDoc, value: 'hello\nworld' });
  });

  it('handles quoted heredocs (no expansion)', () => {
    const tokens = lex("cat <<'EOF'\nhello $VAR\nEOF");
    const heredoc = tokens.find(t => t.type === TokenType.HereDoc)!;
    expect(heredoc.value).toBe('hello $VAR');
    expect(heredoc.fd).toBe(0); // 0 = quoted
  });

  it('handles concatenated quoting styles', () => {
    const tokens = lex("echo 'hello '\"world\"");
    expect(tokens[1].value).toBe('hello world');
  });

  it('skips comments', () => {
    const tokens = lex('echo hello # this is a comment');
    expect(tokens.length).toBe(3); // echo, hello, EOF
  });

  it('handles empty input', () => {
    const tokens = lex('');
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  it('handles newlines as separators', () => {
    const tokens = lex('cmd1\ncmd2');
    expect(tokens.some(t => t.type === TokenType.Newline)).toBe(true);
  });
});
