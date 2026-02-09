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

  it('-c with files: outputs file:count format', () => {
    const result = transpile('grep -c "error" file.txt', { availableTools: noTools });
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
    // The grep part (2nd command) should output lines
    expect(result).toContain('ForEach-Object { $_.Line }');
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
});
