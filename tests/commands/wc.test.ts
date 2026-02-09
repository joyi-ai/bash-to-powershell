import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('wc', () => {
  it('-l (lines) with file', () => {
    const result = transpile('wc -l file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('Measure-Object -Line');
    expect(result).toContain('.Lines');
  });

  it('-w (words) with file', () => {
    const result = transpile('wc -w file.txt', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Word');
    expect(result).toContain('.Words');
  });

  it('-c (bytes) with file', () => {
    const result = transpile('wc -c file.txt', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Character');
  });

  it('-m (chars) with file', () => {
    const result = transpile('wc -m file.txt', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Character');
  });

  it('no flags (default: all)', () => {
    const result = transpile('wc file.txt', { availableTools: noTools });
    expect(result).toContain('Measure-Object');
    expect(result).toContain('-Line');
    expect(result).toContain('-Word');
    expect(result).toContain('-Character');
  });

  it('-l piped (no file)', () => {
    const result = transpile('wc -l', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Line');
    expect(result).toContain('$_.Lines');
    expect(result).not.toContain('Get-Content');
  });

  it('multiple files', () => {
    const result = transpile('wc -l a.txt b.txt', { availableTools: noTools });
    expect(result).toContain("'a.txt'");
    expect(result).toContain("'b.txt'");
    expect(result).toContain('Measure-Object -Line');
  });

  it('-w piped (no file)', () => {
    const result = transpile('wc -w', { availableTools: noTools });
    expect(result).toContain('Measure-Object -Word');
    expect(result).toContain('$_.Words');
    expect(result).not.toContain('Get-Content');
  });
});
