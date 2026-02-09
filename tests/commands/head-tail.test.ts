import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('head', () => {
  it('default (10 lines) with file', () => {
    const result = transpile('head file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('-TotalCount 10');
  });

  it('-n 20', () => {
    const result = transpile('head -n 20 file.txt', { availableTools: noTools });
    expect(result).toContain('-TotalCount 20');
  });

  it('-20 (bare number shorthand)', () => {
    const result = transpile('head -20 file.txt', { availableTools: noTools });
    expect(result).toContain('-TotalCount 20');
  });

  it('piped (no file)', () => {
    const result = transpile('head -5', { availableTools: noTools });
    expect(result).toContain('Select-Object -First 5');
  });

  it('piped with default count', () => {
    const result = transpile('head', { availableTools: noTools });
    expect(result).toContain('Select-Object -First 10');
  });

  it('--lines=15 long form', () => {
    const result = transpile('head --lines=15 file.txt', { availableTools: noTools });
    expect(result).toContain('-TotalCount 15');
  });
});

describe('tail', () => {
  it('default (10 lines) with file', () => {
    const result = transpile('tail file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('-Tail 10');
  });

  it('-n 20', () => {
    const result = transpile('tail -n 20 file.txt', { availableTools: noTools });
    expect(result).toContain('-Tail 20');
  });

  it('-20 (bare number shorthand)', () => {
    const result = transpile('tail -20 file.txt', { availableTools: noTools });
    expect(result).toContain('-Tail 20');
  });

  it('-f (follow)', () => {
    const result = transpile('tail -f log.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('-Wait');
  });

  it('piped (no file)', () => {
    const result = transpile('tail -5', { availableTools: noTools });
    expect(result).toContain('Select-Object -Last 5');
  });

  it('-f -n 50 combined', () => {
    const result = transpile('tail -f -n 50 app.log', { availableTools: noTools });
    expect(result).toContain('-Tail 50');
    expect(result).toContain('-Wait');
  });
});
