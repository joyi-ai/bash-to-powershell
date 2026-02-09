import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('cat', () => {
  it('single file', () => {
    const result = transpile('cat file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('file.txt');
  });

  it('multiple files', () => {
    const result = transpile('cat a.txt b.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('a.txt');
    expect(result).toContain('b.txt');
  });

  it('-n (line numbers)', () => {
    const result = transpile('cat -n file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('ForEach-Object');
  });

  it('-b (number non-blank)', () => {
    const result = transpile('cat -b file.txt', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('ForEach-Object');
  });

  it('no args (stdin)', () => {
    const result = transpile('cat', { availableTools: noTools });
    expect(result).toContain('Get-Content');
  });

  it('filename with spaces', () => {
    const result = transpile("cat 'my file.txt'", { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('my file.txt');
  });
});
