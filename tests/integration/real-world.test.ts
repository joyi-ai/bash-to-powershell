import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

// Test with no native tools — forces PowerShell fallbacks
const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };
// Test with native tools available
const withTools: ToolAvailability = { rg: true, fd: true, curl: true, jq: true };

describe('real-world LLM commands', () => {
  describe('basic commands', () => {
    it('echo simple string', () => {
      const result = transpile('echo "hello world"', { availableTools: noTools });
      expect(result).toContain('Write-Output');
      expect(result).toContain('hello world');
    });

    it('echo with -n (no newline)', () => {
      const result = transpile('echo -n "hello"', { availableTools: noTools });
      expect(result).toContain('Write-Host');
      expect(result).toContain('-NoNewline');
    });

    it('cat a file', () => {
      const result = transpile('cat package.json', { availableTools: noTools });
      expect(result).toContain('Get-Content');
      expect(result).toContain('package.json');
    });

    it('ls -la', () => {
      const result = transpile('ls -la', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
      expect(result).toContain('-Force');
    });

    it('ls a specific directory', () => {
      const result = transpile('ls -la src/', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
      expect(result).toContain('src/');
    });
  });

  describe('grep', () => {
    it('basic grep with rg', () => {
      const result = transpile('grep "TODO" file.txt', { availableTools: withTools });
      expect(result).toContain('rg');
      expect(result).toContain('TODO');
    });

    it('grep -r fallback to Select-String', () => {
      const result = transpile('grep -r "TODO" src/', { availableTools: noTools });
      expect(result).toContain('Select-String');
      expect(result).toContain('TODO');
    });

    it('grep -rni with rg', () => {
      const result = transpile('grep -rni "pattern" src/', { availableTools: withTools });
      expect(result).toContain('rg');
      expect(result).toContain('-i');
      expect(result).toContain('-n');
    });

    it('grep with --include flag', () => {
      const result = transpile('grep -rn "TODO" --include="*.ts" src/', { availableTools: withTools });
      expect(result).toContain('rg');
    });
  });

  describe('find', () => {
    it('find with -name', () => {
      const result = transpile('find . -name "*.ts"', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
      expect(result).toContain('*.ts');
    });

    it('find with -type f', () => {
      const result = transpile('find . -type f -name "*.ts"', { availableTools: noTools });
      expect(result).toContain('-File');
    });

    it('find with fd', () => {
      const result = transpile('find . -name "*.ts" -type f', { availableTools: withTools });
      expect(result).toContain('fd');
    });

    it('find with -not -path to exclude', () => {
      const result = transpile('find . -name "*.ts" -not -path "*/node_modules/*"', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
    });
  });

  describe('file operations', () => {
    it('rm -rf', () => {
      const result = transpile('rm -rf dist/', { availableTools: noTools });
      expect(result).toContain('Remove-Item');
      expect(result).toContain('-Recurse');
      expect(result).toContain('-Force');
    });

    it('mkdir -p', () => {
      const result = transpile('mkdir -p build/output', { availableTools: noTools });
      expect(result).toContain('New-Item');
      expect(result).toContain('-ItemType Directory');
      expect(result).toContain('-Force');
    });

    it('cp -r', () => {
      const result = transpile('cp -r src/ dest/', { availableTools: noTools });
      expect(result).toContain('Copy-Item');
      expect(result).toContain('-Recurse');
    });

    it('mv files', () => {
      const result = transpile('mv old.txt new.txt', { availableTools: noTools });
      expect(result).toContain('Move-Item');
    });

    it('touch a file', () => {
      const result = transpile('touch newfile.txt', { availableTools: noTools });
      expect(result).toContain('Test-Path');
      expect(result).toContain('New-Item');
    });
  });

  describe('piping and chaining', () => {
    it('pipe: cat | grep', () => {
      const result = transpile('cat file.txt | grep "error"', { availableTools: noTools });
      expect(result).toContain('Get-Content');
      expect(result).toContain('|');
      expect(result).toContain('Select-String');
    });

    it('pipe: grep | head', () => {
      const result = transpile('grep -r "TODO" src/ | head -5', { availableTools: noTools });
      expect(result).toContain('|');
      expect(result).toContain('Select-Object -First 5');
    });

    it('&& chaining', () => {
      const result = transpile('rm -rf dist && mkdir -p dist', { availableTools: noTools });
      expect(result).toContain('if ($?)');
      expect(result).toContain('Remove-Item');
      expect(result).toContain('New-Item');
    });

    it('|| chaining', () => {
      const result = transpile('test -d build || mkdir build', { availableTools: noTools });
      expect(result).toContain('if (-not $?)');
    });
  });

  describe('redirects', () => {
    it('output redirect >', () => {
      const result = transpile('echo "hello" > output.txt', { availableTools: noTools });
      expect(result).toContain('>');
      expect(result).toContain('output.txt');
    });

    it('append redirect >>', () => {
      const result = transpile('echo "hello" >> output.txt', { availableTools: noTools });
      expect(result).toContain('>>');
    });

    it('2>/dev/null', () => {
      const result = transpile('cmd 2>/dev/null', { availableTools: noTools });
      expect(result).toContain('2>$null');
    });

    it('2>&1', () => {
      const result = transpile('cmd 2>&1', { availableTools: noTools });
      expect(result).toContain('2>&1');
    });

    it('>/dev/null 2>&1', () => {
      const result = transpile('cmd > /dev/null 2>&1', { availableTools: noTools });
      expect(result).toContain('$null');
      expect(result).toContain('2>&1');
    });
  });

  describe('environment variables', () => {
    it('$HOME translates to $env:USERPROFILE', () => {
      const result = transpile('echo $HOME', { availableTools: noTools });
      expect(result).toContain('$env:USERPROFILE');
    });

    it('$VAR translates to $env:VAR', () => {
      const result = transpile('echo $NODE_ENV', { availableTools: noTools });
      expect(result).toContain('$env:NODE_ENV');
    });

    it('export VAR=value', () => {
      const result = transpile('export NODE_ENV=production', { availableTools: noTools });
      expect(result).toContain('$env:NODE_ENV');
      expect(result).toContain('production');
    });

    it('inline VAR=value before command', () => {
      const result = transpile('NODE_ENV=production npm run build', { availableTools: noTools });
      expect(result).toContain('$env:NODE_ENV');
      expect(result).toContain('npm');
    });
  });

  describe('quoting edge cases', () => {
    it('preserves single-quoted strings', () => {
      const result = transpile("echo 'hello world'", { availableTools: noTools });
      expect(result).toContain('hello world');
    });

    it('handles double quotes with variables', () => {
      const result = transpile('echo "Hello $USER"', { availableTools: noTools });
      expect(result).toContain('$env:USERNAME');
    });

    it('handles $\\\'\\n\\t\\\'', () => {
      const result = transpile("echo $'line1\\nline2'", { availableTools: noTools });
      expect(result).toContain('`n');
    });

    it('handles empty strings', () => {
      const result = transpile('echo ""', { availableTools: noTools });
      expect(result).toBeTruthy();
    });
  });

  describe('sed', () => {
    it('basic substitution', () => {
      const result = transpile("sed 's/old/new/g' file.txt", { availableTools: noTools });
      expect(result).toContain('-replace');
      expect(result).toContain('old');
      expect(result).toContain('new');
    });

    it('in-place substitution', () => {
      const result = transpile("sed -i 's/old/new/g' file.txt", { availableTools: noTools });
      expect(result).toContain('Set-Content');
      expect(result).toContain('-replace');
    });
  });

  describe('test / [ commands', () => {
    it('test -f file', () => {
      const result = transpile('test -f file.txt', { availableTools: noTools });
      expect(result).toContain('Test-Path');
      expect(result).toContain('-PathType Leaf');
    });

    it('[ -d dir ]', () => {
      const result = transpile('[ -d build ]', { availableTools: noTools });
      expect(result).toContain('Test-Path');
      expect(result).toContain('-PathType Container');
    });
  });

  describe('misc commands', () => {
    it('which', () => {
      const result = transpile('which node', { availableTools: noTools });
      expect(result).toContain('Get-Command');
    });

    it('wc -l', () => {
      const result = transpile('wc -l file.txt', { availableTools: noTools });
      expect(result).toContain('Measure-Object');
      expect(result).toContain('-Line');
    });

    it('head -20', () => {
      const result = transpile('head -20 file.txt', { availableTools: noTools });
      expect(result).toContain('Get-Content');
      expect(result).toContain('20');
    });

    it('tail -f', () => {
      const result = transpile('tail -f log.txt', { availableTools: noTools });
      expect(result).toContain('Get-Content');
      expect(result).toContain('-Wait');
    });

    it('sort -r', () => {
      const result = transpile('sort -r file.txt', { availableTools: noTools });
      expect(result).toContain('Sort-Object');
      expect(result).toContain('-Descending');
    });

    it('basename', () => {
      const result = transpile('basename /path/to/file.txt', { availableTools: noTools });
      expect(result).toContain('Split-Path');
      expect(result).toContain('-Leaf');
    });

    it('dirname', () => {
      const result = transpile('dirname /path/to/file.txt', { availableTools: noTools });
      expect(result).toContain('Split-Path');
      expect(result).toContain('-Parent');
    });

    it('pwd', () => {
      const result = transpile('pwd', { availableTools: noTools });
      expect(result).toContain('Get-Location');
    });

    it('sleep', () => {
      const result = transpile('sleep 5', { availableTools: noTools });
      expect(result).toContain('Start-Sleep');
      expect(result).toContain('5');
    });
  });

  describe('complex real-world commands', () => {
    it('find + xargs + rm pipeline', () => {
      const result = transpile('find . -name "*.log" | xargs rm', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
      expect(result).toContain('ForEach-Object');
    });

    it('triple pipe: find | grep | head', () => {
      const result = transpile('find . -name "*.ts" | grep -v node_modules | head -10', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
      expect(result).toContain('|');
      expect(result).toContain('Select-Object -First 10');
    });

    it('chained rm && mkdir && cp', () => {
      const result = transpile('rm -rf dist && mkdir -p dist && cp -r src/* dist/', { availableTools: noTools });
      expect(result).toContain('Remove-Item');
      expect(result).toContain('New-Item');
      expect(result).toContain('Copy-Item');
    });
  });

  describe('transpileWithMeta', () => {
    it('reports fallbacks when no native tools', () => {
      const result = transpileWithMeta('grep "pattern" file.txt', { availableTools: noTools });
      expect(result.usedFallbacks).toBe(true);
      expect(result.powershell).toContain('Select-String');
    });

    it('no fallback when native tools available', () => {
      const result = transpileWithMeta('grep "pattern" file.txt', { availableTools: withTools });
      expect(result.usedFallbacks).toBe(false);
      expect(result.powershell).toContain('rg');
    });

    it('handles empty input gracefully', () => {
      const result = transpileWithMeta('', { availableTools: noTools });
      expect(result.powershell).toBe('');
      expect(result.warnings).toHaveLength(0);
    });

    it('returns warnings for unsupported features', () => {
      const result = transpileWithMeta('chmod 755 file.txt', { availableTools: noTools });
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
