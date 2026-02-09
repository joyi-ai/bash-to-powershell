import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('which', () => {
  it('single command', () => {
    const result = transpile('which node', { availableTools: noTools });
    expect(result).toContain('Get-Command');
    expect(result).toContain("'node'");
    expect(result).toContain('.Source');
  });

  it('multiple commands', () => {
    const result = transpile('which node python', { availableTools: noTools });
    expect(result).toContain("Get-Command 'node'");
    expect(result).toContain("Get-Command 'python'");
  });

  it('no args', () => {
    const result = transpile('which', { availableTools: noTools });
    expect(result).toBe('Get-Command');
  });

  it('command -v (alias)', () => {
    const result = transpile('command -v git', { availableTools: noTools });
    expect(result).toContain('Get-Command');
    expect(result).toContain("'git'");
  });
});

describe('ps', () => {
  it('no args', () => {
    const result = transpile('ps', { availableTools: noTools });
    expect(result).toContain('Get-Process');
  });

  it('-p PID', () => {
    const result = transpile('ps -p 1234', { availableTools: noTools });
    expect(result).toContain('Get-Process');
    expect(result).toContain('-Id 1234');
  });
});

describe('kill', () => {
  it('single PID', () => {
    const result = transpile('kill 1234', { availableTools: noTools });
    expect(result).toContain('Stop-Process');
    expect(result).toContain('-Id');
    expect(result).toContain('1234');
  });

  it('-9 (force kill)', () => {
    const result = transpile('kill -9 1234', { availableTools: noTools });
    expect(result).toContain('Stop-Process');
    expect(result).toContain('-Force');
  });

  it('-s SIGKILL', () => {
    const result = transpile('kill -s SIGKILL 1234', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('multiple PIDs', () => {
    const result = transpile('kill 123 456', { availableTools: noTools });
    expect(result).toContain('Stop-Process');
    expect(result).toContain('123');
    expect(result).toContain('456');
  });
});
