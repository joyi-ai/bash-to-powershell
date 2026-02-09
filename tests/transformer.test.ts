import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../src/index.js';
import { ToolAvailability } from '../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('transformer', () => {
  describe('variable mapping', () => {
    it('$HOME maps to $env:USERPROFILE', () => {
      expect(transpile('echo $HOME', { availableTools: noTools })).toContain('$env:USERPROFILE');
    });

    it('$USER maps to $env:USERNAME', () => {
      expect(transpile('echo $USER', { availableTools: noTools })).toContain('$env:USERNAME');
    });

    it('$SHELL maps to $env:ComSpec', () => {
      expect(transpile('echo $SHELL', { availableTools: noTools })).toContain('$env:ComSpec');
    });

    it('$TMPDIR maps to $env:TEMP', () => {
      expect(transpile('echo $TMPDIR', { availableTools: noTools })).toContain('$env:TEMP');
    });

    it('$? maps to $LASTEXITCODE', () => {
      expect(transpile('echo $?', { availableTools: noTools })).toContain('$LASTEXITCODE');
    });

    it('$RANDOM maps to (Get-Random)', () => {
      expect(transpile('echo $RANDOM', { availableTools: noTools })).toContain('(Get-Random)');
    });

    it('${HOME} braced syntax', () => {
      expect(transpile('echo ${HOME}', { availableTools: noTools })).toContain('$env:USERPROFILE');
    });

    it('$1 positional arg maps to $args[0]', () => {
      expect(transpile('echo $1', { availableTools: noTools })).toContain('$args[0]');
    });

    it('$@ maps to $args', () => {
      expect(transpile('echo $@', { availableTools: noTools })).toContain('$args');
    });

    it('regular $MY_VAR maps to $env:MY_VAR', () => {
      expect(transpile('echo $MY_VAR', { availableTools: noTools })).toContain('$env:MY_VAR');
    });

    it('$$ maps to $PID', () => {
      expect(transpile('echo $$', { availableTools: noTools })).toContain('$PID');
    });

    it('$# maps to $args.Count', () => {
      expect(transpile('echo $#', { availableTools: noTools })).toContain('$args.Count');
    });
  });

  describe('path translation', () => {
    it('/dev/null maps to $null in redirect', () => {
      const result = transpile('echo test > /dev/null', { availableTools: noTools });
      expect(result).toContain('$null');
    });

    it('/tmp in redirect maps to $env:TEMP', () => {
      const result = transpile('echo test > /tmp/out.txt', { availableTools: noTools });
      expect(result).toContain('$env:TEMP');
    });

    it('/tmp as command arg is translated to $env:TEMP', () => {
      const result = transpile('ls /tmp', { availableTools: noTools });
      expect(result).toContain('$env:TEMP');
    });

    it('2>/dev/null maps to 2>$null', () => {
      const result = transpile('cmd 2>/dev/null', { availableTools: noTools });
      expect(result).toContain('2>$null');
    });
  });

  describe('quoting', () => {
    it('single quotes preserved without expansion', () => {
      const result = transpile("echo 'hello $world'", { availableTools: noTools });
      expect(result).toContain('hello $world');
      expect(result).not.toContain('$env:');
    });

    it('double quotes translate variables', () => {
      const result = transpile('echo "Hello $USER"', { availableTools: noTools });
      expect(result).toContain('$env:USERNAME');
    });

    it("$'...' with \\n produces PS backtick-n", () => {
      const result = transpile("echo $'line1\\nline2'", { availableTools: noTools });
      expect(result).toContain('`n');
    });

    it("$'...' with \\t produces PS backtick-t", () => {
      const result = transpile("echo $'col1\\tcol2'", { availableTools: noTools });
      expect(result).toContain('`t');
    });

    it('empty single-quoted string', () => {
      const result = transpile("echo ''", { availableTools: noTools });
      expect(result).toBeTruthy();
      expect(result).not.toContain('TRANSPILE ERROR');
    });

    it('empty double-quoted string', () => {
      const result = transpile('echo ""', { availableTools: noTools });
      expect(result).toBeTruthy();
      expect(result).not.toContain('TRANSPILE ERROR');
    });

    it('concatenated quoting styles', () => {
      const result = transpile(`echo 'hello '"world"`, { availableTools: noTools });
      expect(result).toBeTruthy();
      expect(result).not.toContain('TRANSPILE ERROR');
    });

    it('dollar sign in single quotes stays literal', () => {
      const result = transpile("echo '$HOME'", { availableTools: noTools });
      expect(result).toContain('$HOME');
      expect(result).not.toContain('$env:USERPROFILE');
    });
  });

  describe('redirects', () => {
    it('output redirect >', () => {
      const result = transpile('echo hi > out.txt', { availableTools: noTools });
      expect(result).toContain('>');
      expect(result).toContain('out.txt');
    });

    it('append redirect >>', () => {
      const result = transpile('echo hi >> out.txt', { availableTools: noTools });
      expect(result).toContain('>>');
      expect(result).toContain('out.txt');
    });

    it('2>&1 stderr to stdout', () => {
      const result = transpile('cmd 2>&1', { availableTools: noTools });
      expect(result).toContain('2>&1');
    });

    it('combined > /dev/null 2>&1', () => {
      const result = transpile('cmd > /dev/null 2>&1', { availableTools: noTools });
      expect(result).toContain('$null');
      expect(result).toContain('2>&1');
    });
  });

  describe('pipes and chains', () => {
    it('simple pipe', () => {
      const result = transpile('echo hello | grep hello', { availableTools: noTools });
      expect(result).toContain('|');
    });

    it('&& chain uses if ($?)', () => {
      const result = transpile('cmd1 && cmd2', { availableTools: noTools });
      expect(result).toContain('if ($?)');
    });

    it('|| chain uses if (-not $?)', () => {
      const result = transpile('cmd1 || cmd2', { availableTools: noTools });
      expect(result).toContain('if (-not $?)');
    });

    it('semicolon chain', () => {
      const result = transpile('cmd1 ; cmd2', { availableTools: noTools });
      expect(result).toContain(';');
      expect(result).toContain('cmd1');
      expect(result).toContain('cmd2');
    });

    it('negated pipeline', () => {
      const result = transpile('! cmd', { availableTools: noTools });
      expect(result).toContain('!');
    });
  });

  describe('assignments and substitution', () => {
    it('bare assignment FOO=bar', () => {
      const result = transpile('FOO=bar', { availableTools: noTools });
      expect(result).toContain('$env:FOO');
      expect(result).toContain('bar');
    });

    it('inline assignment before command', () => {
      const result = transpile('NODE_ENV=production npm start', { availableTools: noTools });
      expect(result).toContain('$env:NODE_ENV');
      expect(result).toContain('npm');
    });

    it('subshell wraps in & { }', () => {
      const result = transpile('(echo hello)', { availableTools: noTools });
      expect(result).toContain('& {');
      expect(result).toContain('}');
    });

    it('command substitution $(cmd) translated recursively', () => {
      const result = transpile('echo $(date)', { availableTools: noTools });
      expect(result).toContain('$(');
      expect(result).toContain('Get-Date');
    });

    it('nested command substitution', () => {
      const result = transpile('echo $(echo $(date))', { availableTools: noTools });
      expect(result).toContain('$(');
      expect(result).toContain('Get-Date');
      expect(result).not.toContain('TRANSPILE ERROR');
    });
  });
});
