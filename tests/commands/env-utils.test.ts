import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('export', () => {
  it('VAR=value', () => {
    const result = transpile('export NODE_ENV=production', { availableTools: noTools });
    expect(result).toContain('$env:NODE_ENV');
    expect(result).toContain('production');
  });

  it('multiple assignments', () => {
    const result = transpile('export A=1 B=2', { availableTools: noTools });
    expect(result).toContain('$env:A');
    expect(result).toContain('$env:B');
  });

  it('-p (print all)', () => {
    const result = transpile('export -p', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem Env:');
  });

  it('without value (no-op)', () => {
    const result = transpile('export PATH', { availableTools: noTools });
    expect(result).toContain('# export PATH');
  });
});

describe('unset', () => {
  it('single var', () => {
    const result = transpile('unset MY_VAR', { availableTools: noTools });
    expect(result).toContain('Remove-Item');
    expect(result).toContain('Env:\\MY_VAR');
    expect(result).toContain('-ErrorAction SilentlyContinue');
  });

  it('multiple vars', () => {
    const result = transpile('unset A B', { availableTools: noTools });
    expect(result).toContain('Env:\\A');
    expect(result).toContain('Env:\\B');
  });

  it('no args', () => {
    const result = transpile('unset', { availableTools: noTools });
    expect(result).toContain('# unset: no variable specified');
  });
});

describe('env', () => {
  it('no args lists env vars', () => {
    const result = transpile('env', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem Env:');
  });

  it('VAR=val cmd runs with env', () => {
    const result = transpile('env NODE_ENV=test node app.js', { availableTools: noTools });
    expect(result).toContain("$env:NODE_ENV = 'test'");
    expect(result).toContain('node app.js');
  });

  it('multiple assignments before cmd', () => {
    const result = transpile('env A=1 B=2 node app.js', { availableTools: noTools });
    expect(result).toContain("$env:A = '1'");
    expect(result).toContain("$env:B = '2'");
    expect(result).toContain('node app.js');
  });
});
