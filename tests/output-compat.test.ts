import { describe, it, expect } from 'vitest';
import { transpile } from '../src/index.js';
import { ToolAvailability } from '../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('grep output formatting (bash-compatible)', () => {
  it('single file: outputs matching lines without filename', () => {
    const result = transpile('grep "error" file.txt', { availableTools: noTools });
    expect(result).toContain('ForEach-Object { $_.Line }');
    expect(result).not.toContain('$_.Path');
  });

  it('single file with -n: outputs linenum:line', () => {
    const result = transpile('grep -n "error" file.txt', { availableTools: noTools });
    expect(result).toContain('$_.LineNumber');
    expect(result).toContain('$_.Line');
    expect(result).not.toContain('$_.Path');
  });

  it('recursive: outputs path:line', () => {
    const result = transpile('grep -r "TODO" src/', { availableTools: noTools });
    expect(result).toContain('$_.Path');
    expect(result).toContain('$_.Line');
  });

  it('recursive with -n: outputs path:linenum:line', () => {
    const result = transpile('grep -rn "TODO" src/', { availableTools: noTools });
    expect(result).toContain('$_.Path');
    expect(result).toContain('$_.LineNumber');
    expect(result).toContain('$_.Line');
  });

  it('multiple files: includes filename in output', () => {
    const result = transpile('grep "error" a.txt b.txt', { availableTools: noTools });
    expect(result).toContain('$_.Path');
    expect(result).toContain('$_.Line');
  });

  it('-c with single file: outputs just count (not file:count)', () => {
    const result = transpile('grep -c "error" file.txt', { availableTools: noTools });
    expect(result).toContain('Measure-Object');
    expect(result).toContain('$_.Count');
    // Single file should NOT include filename in count output
    expect(result).not.toContain('$_.Name');
  });

  it('-c with multiple files: outputs file:count format', () => {
    const result = transpile('grep -c "error" a.txt b.txt', { availableTools: noTools });
    expect(result).toContain('$_.Name');
    expect(result).toContain('$_.Count');
  });

  it('-c piped: outputs just the count', () => {
    const result = transpile('grep -rc "error" src/', { availableTools: noTools });
    expect(result).toContain('Measure-Object');
    expect(result).toContain('$_.Count');
  });

  it('-o: outputs only matching parts', () => {
    const result = transpile('grep -o "[0-9]+" file.txt', { availableTools: noTools });
    expect(result).toContain('$_.Matches.Value');
  });

  it('-l: files-with-matches still uses ExpandProperty Path', () => {
    const result = transpile('grep -rl "TODO" .', { availableTools: noTools });
    expect(result).toContain('Select-Object -Unique -ExpandProperty Path');
  });

  it('piped grep: outputs matching lines only', () => {
    const result = transpile('cat file.txt | grep "error"', { availableTools: noTools });
    expect(result).toContain('ForEach-Object { $_.Line }');
  });
});

describe('grep pipeline correctness (anti-gaming)', () => {
  it('piped grep does NOT insert Get-ChildItem', () => {
    const result = transpile('cat file.txt | grep "error"', { availableTools: noTools });
    // The grep command should NOT prepend Get-ChildItem when receiving piped input
    // Split on | to get the grep part
    const parts = result.split(' | ');
    const grepPart = parts.slice(1).join(' | '); // everything after Get-Content
    expect(grepPart).not.toContain('Get-ChildItem');
  });

  it('bare grep (piped) is just Select-String + formatter', () => {
    const result = transpile('grep "error"', { availableTools: noTools });
    expect(result).not.toContain('Get-ChildItem');
    expect(result).toContain('Select-String');
    expect(result).toContain('ForEach-Object');
  });

  it('grep with file does NOT insert Get-ChildItem', () => {
    const result = transpile('grep "error" file.txt', { availableTools: noTools });
    expect(result).not.toContain('Get-ChildItem');
    expect(result).toContain('Select-String');
    expect(result).toContain('-Path');
  });

  it('recursive grep DOES use Get-ChildItem', () => {
    const result = transpile('grep -r "error" src/', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('-Recurse');
  });
});

describe('wc pipeline correctness (anti-gaming)', () => {
  it('piped wc -l uses pipe-compatible syntax', () => {
    const result = transpile('wc -l', { availableTools: noTools });
    // Must NOT use (expression).Property as pipe receiver
    expect(result).not.toMatch(/^\(/); // should not start with (
    expect(result).toContain('Measure-Object -Line');
    expect(result).toContain('ForEach-Object');
    expect(result).toContain('$_.Lines');
  });

  it('cat | grep | wc -l produces valid pipeline', () => {
    const result = transpile('cat file.txt | grep "error" | wc -l', { availableTools: noTools });
    // Full pipeline should not have expression syntax as pipe receiver
    expect(result).not.toContain('| (Measure-Object');
    expect(result).toContain('| Measure-Object -Line | ForEach-Object');
  });

  it('wc -l with file uses expression form (not piped)', () => {
    const result = transpile('wc -l file.txt', { availableTools: noTools });
    // With file, it starts its own pipeline so expression form is fine
    expect(result).toContain('(Get-Content');
    expect(result).toContain('.Lines');
  });

  it('piped wc -w uses pipe-compatible syntax', () => {
    const result = transpile('wc -w', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Word | ForEach-Object');
    expect(result).toContain('$_.Words');
  });

  it('piped wc -c uses pipe-compatible syntax', () => {
    const result = transpile('wc -c', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Character | ForEach-Object');
    expect(result).toContain('$_.Characters');
  });
});

describe('ls output formatting (bash-compatible)', () => {
  it('bare ls: outputs names only', () => {
    const result = transpile('ls', { availableTools: noTools });
    expect(result).toContain('Select-Object -ExpandProperty Name');
    expect(result).not.toContain('Format-Table');
  });

  it('ls -l: outputs bash-like long format', () => {
    const result = transpile('ls -l', { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
    expect(result).toContain('$_.Mode');
    expect(result).toContain('$_.Name');
    expect(result).toContain('LastWriteTime');
    expect(result).not.toContain('Format-Table');
  });

  it('ls -la: shows hidden + long format', () => {
    const result = transpile('ls -la', { availableTools: noTools });
    expect(result).toContain('-Force');
    expect(result).toContain('ForEach-Object');
  });

  it('ls with sort still adds name output', () => {
    const result = transpile('ls -t', { availableTools: noTools });
    expect(result).toContain('Sort-Object');
    expect(result).toContain('Select-Object -ExpandProperty Name');
  });
});

describe('find output formatting (bash-compatible)', () => {
  it('find outputs file paths via FullName', () => {
    const result = transpile('find . -name "*.ts"', { availableTools: noTools });
    expect(result).toContain('Select-Object -ExpandProperty FullName');
  });

  it('find -type f outputs paths', () => {
    const result = transpile('find . -type f', { availableTools: noTools });
    expect(result).toContain('FullName');
  });

  it('find -delete does NOT append FullName (has Remove-Item)', () => {
    const result = transpile('find . -name "*.tmp" -delete', { availableTools: noTools });
    expect(result).toContain('Remove-Item');
    expect(result).not.toContain('FullName');
  });

  it('find -exec does NOT append FullName', () => {
    const result = transpile('find . -name "*.ts" -exec wc -l {} ;', { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
    expect(result).not.toContain('ExpandProperty FullName');
  });
});

describe('background process (&)', () => {
  it('simple command with &', () => {
    const result = transpile('sleep 100 &', { availableTools: noTools });
    expect(result).toContain('Start-Job');
    expect(result).toContain('Start-Sleep');
  });

  it('node server with &', () => {
    const result = transpile('node server.js &', { availableTools: noTools });
    expect(result).toContain('Start-Job');
    expect(result).toContain('node');
    expect(result).toContain('server.js');
  });

  it('command && other; bg &', () => {
    const result = transpile('echo hello; node server.js &', { availableTools: noTools });
    expect(result).toContain('Start-Job');
    expect(result).toContain('node');
  });

  it('pipe with &', () => {
    const result = transpile('tail -f log.txt | grep error &', { availableTools: noTools });
    expect(result).toContain('Start-Job');
  });

  it('& does not affect && chains', () => {
    const result = transpile('cd frontend && npm install', { availableTools: noTools });
    expect(result).not.toContain('Start-Job');
    expect(result).toContain('if ($?)');
  });

  it('2>&1 is not affected by & change', () => {
    const result = transpile('cmd 2>&1', { availableTools: noTools });
    expect(result).toContain('2>&1');
    expect(result).not.toContain('Start-Job');
  });
});

describe('tilde expansion', () => {
  it('bare ~ expands to $env:USERPROFILE', () => {
    const result = transpile('cd ~', { availableTools: noTools });
    expect(result).toContain('$env:USERPROFILE');
  });

  it('~/path expands to $env:USERPROFILE\\path', () => {
    const result = transpile('ls ~/projects', { availableTools: noTools });
    expect(result).toContain('$env:USERPROFILE');
    expect(result).toContain('projects');
  });

  it('~/deep/path works', () => {
    const result = transpile('cat ~/projects/stella/README.md', { availableTools: noTools });
    expect(result).toContain('$env:USERPROFILE');
    expect(result).toContain('stella');
  });

  it('tilde in middle of word is not expanded', () => {
    const result = transpile('echo foo~bar', { availableTools: noTools });
    expect(result).not.toContain('$env:USERPROFILE');
    expect(result).toContain('foo~bar');
  });

  it('double-quoted ~/path is NOT expanded (bash semantics)', () => {
    const result = transpile('echo "~/projects"', { availableTools: noTools });
    expect(result).not.toContain('$env:USERPROFILE');
    expect(result).toContain('~/projects');
  });

  it('single-quoted ~/path is NOT expanded', () => {
    const result = transpile("echo '~/projects'", { availableTools: noTools });
    expect(result).not.toContain('$env:USERPROFILE');
    expect(result).toContain('~/projects');
  });
});

describe('full pipeline integration (anti-gaming)', () => {
  it('cat | grep | wc -l: no broken fragments', () => {
    const result = transpile('cat file.txt | grep "error" | wc -l', { availableTools: noTools });
    // Should be: Get-Content file.txt | Select-String ... | ForEach-Object { $_.Line } | Measure-Object -Line | ForEach-Object { $_.Lines }
    expect(result).toContain('Get-Content');
    expect(result).toContain('Select-String');
    expect(result).toContain('Measure-Object -Line');
    // No broken Get-ChildItem insertion
    expect(result).not.toContain('Get-ChildItem');
    // No expression-as-pipe-receiver
    expect(result).not.toContain('| (Measure-Object');
  });

  it('grep pattern file | head -5: valid pipeline', () => {
    const result = transpile('grep "TODO" file.txt | head -5', { availableTools: noTools });
    expect(result).toContain('Select-String');
    expect(result).toContain('Select-Object -First 5');
    expect(result).not.toContain('Get-ChildItem');
  });

  it('find | grep: no double Get-ChildItem', () => {
    const result = transpile('find . -name "*.ts" | grep "import"', { availableTools: noTools });
    // find uses Get-ChildItem, but piped grep should NOT add another
    const gciCount = (result.match(/Get-ChildItem/g) || []).length;
    expect(gciCount).toBe(1);
  });

  it('echo | grep: clean pipeline', () => {
    const result = transpile('echo "hello world" | grep "hello"', { availableTools: noTools });
    expect(result).toContain('Write-Output');
    expect(result).toContain('Select-String');
    expect(result).not.toContain('Get-ChildItem');
  });
});
