import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('sort', () => {
  it('basic with file', () => {
    const result = transpile('sort file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('Sort-Object');
  });

  it('-r (reverse)', () => {
    const result = transpile('sort -r file.txt', { availableTools: noTools });
    expect(result).toContain('-Descending');
  });

  it('-n (numeric)', () => {
    const result = transpile('sort -n file.txt', { availableTools: noTools });
    expect(result).toContain('[int]$_');
  });

  it('-u (unique)', () => {
    const result = transpile('sort -u file.txt', { availableTools: noTools });
    expect(result).toContain('-Unique');
  });

  it('piped (no file)', () => {
    const result = transpile('sort', { availableTools: noTools });
    expect(result).toContain('Sort-Object');
    expect(result).not.toContain('Get-Content');
  });
});

describe('uniq', () => {
  it('basic', () => {
    const result = transpile('uniq file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Unique');
  });

  it('-c (count)', () => {
    const result = transpile('uniq -c file.txt', { availableTools: noTools });
    expect(result).toContain('Group-Object');
    expect(result).toContain('$_.Count');
  });

  it('-d (duplicates only)', () => {
    const result = transpile('uniq -d file.txt', { availableTools: noTools });
    expect(result).toContain('$_.Count -gt 1');
  });

  it('piped', () => {
    const result = transpile('uniq', { availableTools: noTools });
    expect(result).toContain('Get-Unique');
    expect(result).not.toContain('Get-Content');
  });
});

describe('tr', () => {
  it('a-z A-Z (uppercase)', () => {
    const result = transpile("tr 'a-z' 'A-Z'", { availableTools: noTools });
    expect(result).toContain('$_.ToUpper()');
  });

  it('A-Z a-z (lowercase)', () => {
    const result = transpile("tr 'A-Z' 'a-z'", { availableTools: noTools });
    expect(result).toContain('$_.ToLower()');
  });

  it('-d (delete chars)', () => {
    const result = transpile("tr -d '\\n'", { availableTools: noTools });
    expect(result).toContain("-replace");
    expect(result).toContain("''");
  });

  it('single char replacement', () => {
    const result = transpile("tr ',' '\\t'", { availableTools: noTools });
    expect(result).toContain('-replace');
  });
});

describe('tee', () => {
  it('basic', () => {
    const result = transpile('tee output.txt', { availableTools: noTools });
    expect(result).toContain('Tee-Object');
    expect(result).toContain('-FilePath');
    expect(result).toContain("'output.txt'");
  });

  it('-a (append)', () => {
    const result = transpile('tee -a output.txt', { availableTools: noTools });
    expect(result).toContain('-Append');
  });
});

describe('diff', () => {
  it('two files', () => {
    const result = transpile('diff a.txt b.txt', { availableTools: noTools });
    expect(result).toContain('Compare-Object');
    expect(result).toContain('Get-Content');
    expect(result).toContain("'a.txt'");
    expect(result).toContain("'b.txt'");
  });
});

describe('xargs', () => {
  it('basic', () => {
    const result = transpile('xargs rm', { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
    expect(result).toContain('rm');
  });

  it('-I (replace string)', () => {
    const result = transpile("xargs -I{} cp {} /dest/", { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
    expect(result).toContain('$_');
  });
});
