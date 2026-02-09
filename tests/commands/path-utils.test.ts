import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('path-utils', () => {
  it('basename extracts filename', () => {
    const result = transpile('basename /path/to/file.txt', { availableTools: noTools });
    expect(result).toContain('Split-Path');
    expect(result).toContain('-Leaf');
  });

  it('basename with suffix removal', () => {
    const result = transpile('basename /path/to/file.txt .txt', { availableTools: noTools });
    expect(result).toContain('Split-Path');
    expect(result).toContain('-Leaf');
    expect(result).toContain("-replace");
    expect(result).toContain(".txt");
  });

  it('dirname extracts directory', () => {
    const result = transpile('dirname /path/to/file.txt', { availableTools: noTools });
    expect(result).toContain('Split-Path');
    expect(result).toContain('-Parent');
  });

  it('realpath resolves to absolute', () => {
    const result = transpile('realpath ./relative/path', { availableTools: noTools });
    expect(result).toContain('Resolve-Path');
    expect(result).toContain('.Path');
  });

  it('readlink gets link target', () => {
    const result = transpile('readlink symlink', { availableTools: noTools });
    expect(result).toContain('Get-Item');
    expect(result).toContain('.Target');
  });

  it('readlink -f canonicalizes path', () => {
    const result = transpile('readlink -f ./path', { availableTools: noTools });
    expect(result).toContain('Resolve-Path');
    expect(result).toContain('.Path');
  });

  it('basename with no args', () => {
    const result = transpile('basename', { availableTools: noTools });
    expect(result).toContain('Split-Path');
    expect(result).toContain('-Leaf');
  });

  it('dirname with no args', () => {
    const result = transpile('dirname', { availableTools: noTools });
    expect(result).toContain('Split-Path');
    expect(result).toContain('-Parent');
  });
});
