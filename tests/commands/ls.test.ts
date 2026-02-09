import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('ls', () => {
  it('bare ls', () => {
    expect(transpile('ls', { availableTools: noTools })).toContain('Get-ChildItem');
  });

  it('-l (long format)', () => {
    const result = transpile('ls -l', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('Format-Table');
    expect(result).toContain('Mode');
    expect(result).toContain('LastWriteTime');
  });

  it('-a (show hidden)', () => {
    const result = transpile('ls -a', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('-Force');
  });

  it('-la (combined)', () => {
    const result = transpile('ls -la', { availableTools: noTools });
    expect(result).toContain('-Force');
    expect(result).toContain('Format-Table');
  });

  it('-R (recursive)', () => {
    const result = transpile('ls -R', { availableTools: noTools });
    expect(result).toContain('-Recurse');
  });

  it('-t (sort by time)', () => {
    const result = transpile('ls -t', { availableTools: noTools });
    expect(result).toContain('Sort-Object LastWriteTime -Descending');
  });

  it('-S (sort by size)', () => {
    const result = transpile('ls -S', { availableTools: noTools });
    expect(result).toContain('Sort-Object Length -Descending');
  });

  it('-r (reverse sort)', () => {
    const result = transpile('ls -r', { availableTools: noTools });
    expect(result).toContain('Sort-Object Name -Descending');
  });

  it('-d (directory only)', () => {
    const result = transpile('ls -d */', { availableTools: noTools });
    expect(result).toContain('-Directory');
  });

  it('with path argument', () => {
    const result = transpile('ls -la src/', { availableTools: noTools });
    expect(result).toContain('-Path');
    expect(result).toContain('src/');
  });
});
