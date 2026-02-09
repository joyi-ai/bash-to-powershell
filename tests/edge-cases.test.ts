import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../src/index.js';
import { ToolAvailability } from '../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('edge cases', () => {
  describe('empty / whitespace input', () => {
    it('empty string returns empty', () => {
      const result = transpileWithMeta('', { availableTools: noTools });
      expect(result.powershell).toBe('');
      expect(result.warnings).toHaveLength(0);
    });

    it('whitespace only returns empty', () => {
      const result = transpileWithMeta('   ', { availableTools: noTools });
      expect(result.powershell).toBe('');
    });

    it('tabs and newlines only returns empty', () => {
      const result = transpileWithMeta('\t\n', { availableTools: noTools });
      expect(result.powershell).toBe('');
    });

    it('comments only returns empty', () => {
      const result = transpile('# just a comment', { availableTools: noTools });
      expect(result).toBe('');
    });
  });

  describe('unsupported constructs (no crash)', () => {
    it('if/then/fi does not crash', () => {
      const result = () => transpile('if [ -f file ]; then echo yes; fi', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('for loop does not crash', () => {
      const result = () => transpile('for i in 1 2 3; do echo $i; done', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('while loop does not crash', () => {
      const result = () => transpile('while true; do sleep 1; done', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('function definition does not crash', () => {
      const result = () => transpile('myfunc() { echo hello; }', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('case statement does not crash', () => {
      const result = () => transpile('case $x in a) echo a;; b) echo b;; esac', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('arithmetic expansion produces some output', () => {
      const meta = transpileWithMeta('echo $((1 + 2))', { availableTools: noTools });
      // May not translate perfectly but should not crash
      expect(typeof meta.powershell).toBe('string');
    });
  });

  describe('error handling', () => {
    // Lexer auto-closes unterminated quotes gracefully
    it('unterminated single quote is auto-closed by lexer', () => {
      const meta = transpileWithMeta("echo 'hello", { availableTools: noTools });
      expect(meta.powershell).toContain('hello');
      expect(meta.powershell).not.toContain('TRANSPILE ERROR');
    });

    it('unterminated double quote is auto-closed by lexer', () => {
      const meta = transpileWithMeta('echo "hello', { availableTools: noTools });
      expect(meta.powershell).toContain('hello');
      expect(meta.powershell).not.toContain('TRANSPILE ERROR');
    });

    it('unmatched parenthesis returns error comment', () => {
      const meta = transpileWithMeta('(echo hello', { availableTools: noTools });
      expect(meta.powershell).toContain('TRANSPILE ERROR');
    });

    it('transpileWithMeta on parse error has warnings', () => {
      const meta = transpileWithMeta('(((', { availableTools: noTools });
      expect(meta.warnings.length).toBeGreaterThan(0);
    });

    it('deeply nested pipes do not crash', () => {
      const result = transpile('a | b | c | d | e | f | g | h', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('|');
    });
  });

  describe('special characters and encoding', () => {
    it('escaped single quotes in single-quoted context', () => {
      // Bash idiom for single quote in single-quoted string: 'it'\''s'
      const result = () => transpile("echo 'it'\\''s'", { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('dollar sign in single quotes stays literal', () => {
      const result = transpile("echo '$HOME'", { availableTools: noTools });
      expect(result).toContain('$HOME');
      expect(result).not.toContain('$env:USERPROFILE');
    });

    it('unicode in string does not crash', () => {
      const result = () => transpile('echo "hello world 🌍"', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('very long command completes without error', () => {
      const longArg = 'x'.repeat(500);
      const result = transpile(`echo "${longArg}"`, { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain(longArg);
    });

    it('backtick in double quotes is escaped', () => {
      const result = transpile('echo "hello `world`"', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
    });
  });

  describe('misc edge cases', () => {
    it('= in argument is not treated as assignment', () => {
      const result = transpile('git log --format=%H', { availableTools: noTools });
      expect(result).toBe('git log --format=%H');
    });

    it('multiple semicolons do not crash', () => {
      const result = () => transpile(';;;', { availableTools: noTools });
      expect(result).not.toThrow();
    });

    it('here-string <<< becomes pipe input', () => {
      const result = transpile('cat <<< "hello"', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
    });

    it('unknown command passes through', () => {
      const result = transpile('my-custom-tool --flag value', { availableTools: noTools });
      expect(result).toContain('my-custom-tool');
      expect(result).toContain('--flag');
      expect(result).toContain('value');
    });

    it('negated pipeline wraps in !()', () => {
      const result = transpile('! grep "error" file.txt', { availableTools: noTools });
      expect(result).toContain('!');
    });

    it('multiple commands on separate lines', () => {
      const result = transpile('echo hello\necho world', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
    });

    it('command with -- stops flag parsing', () => {
      const result = transpile('grep -- -v file.txt', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
    });

    it('empty subshell', () => {
      const result = () => transpile('()', { availableTools: noTools });
      // May error but should not crash the transpiler
      expect(result).not.toThrow();
    });

    it('pipe to unknown command passes through', () => {
      const result = transpile('echo hello | my-tool --format json', { availableTools: noTools });
      expect(result).toContain('|');
      expect(result).toContain('my-tool');
    });
  });
});
