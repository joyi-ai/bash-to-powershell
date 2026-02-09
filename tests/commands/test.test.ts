import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('test / [', () => {
  it('test -f (file exists, is file)', () => {
    const result = transpile('test -f file.txt', { availableTools: noTools });
    expect(result).toContain('Test-Path');
    expect(result).toContain('-PathType Leaf');
  });

  it('test -d (directory)', () => {
    const result = transpile('test -d build/', { availableTools: noTools });
    expect(result).toContain('Test-Path');
    expect(result).toContain('-PathType Container');
  });

  it('test -e (exists)', () => {
    const result = transpile('test -e path', { availableTools: noTools });
    expect(result).toContain('Test-Path');
  });

  it('test -s (non-zero size)', () => {
    const result = transpile('test -s file.txt', { availableTools: noTools });
    expect(result).toContain('Test-Path');
    expect(result).toContain('.Length -gt 0');
  });

  it('test -z (empty string)', () => {
    const result = transpile('test -z "$VAR"', { availableTools: noTools });
    expect(result).toContain('IsNullOrEmpty');
  });

  it('test -n (non-empty string)', () => {
    const result = transpile('test -n "$VAR"', { availableTools: noTools });
    expect(result).toContain('-not');
    expect(result).toContain('IsNullOrEmpty');
  });

  it('[ string = string ]', () => {
    const result = transpile('[ "$A" = "$B" ]', { availableTools: noTools });
    expect(result).toContain('-eq');
  });

  it('[ string != string ]', () => {
    const result = transpile('[ "$A" != "$B" ]', { availableTools: noTools });
    expect(result).toContain('-ne');
  });

  it('[ N -eq M ]', () => {
    const result = transpile('[ 5 -eq 5 ]', { availableTools: noTools });
    expect(result).toContain('[int]');
    expect(result).toContain('-eq');
  });

  it('[ N -gt M ]', () => {
    const result = transpile('[ 5 -gt 3 ]', { availableTools: noTools });
    expect(result).toContain('[int]');
    expect(result).toContain('-gt');
  });

  it('negation: test ! -f', () => {
    const result = transpile('test ! -f file.txt', { availableTools: noTools });
    expect(result).toContain('-not');
  });

  it('[ ] bracket syntax strips trailing ]', () => {
    const result = transpile('[ -f file.txt ]', { availableTools: noTools });
    expect(result).toContain('Test-Path');
    expect(result).toContain('-PathType Leaf');
  });

  it('compound -a (and)', () => {
    const result = transpile('test -f a -a -f b', { availableTools: noTools });
    expect(result).toContain('-and');
  });

  it('compound -o (or)', () => {
    const result = transpile('test -f a -o -f b', { availableTools: noTools });
    expect(result).toContain('-or');
  });
});
