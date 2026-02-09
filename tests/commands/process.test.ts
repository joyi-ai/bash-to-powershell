import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('lsof', () => {
  it('lsof -i :3000 (check port)', () => {
    const result = transpile('lsof -i :3000', { availableTools: noTools });
    expect(result).toContain('Get-NetTCPConnection');
    expect(result).toContain('3000');
  });

  it('lsof -i :8080 -t (terse — PIDs only)', () => {
    const result = transpile('lsof -i :8080 -t', { availableTools: noTools });
    expect(result).toContain('OwningProcess');
    expect(result).toContain('8080');
  });

  it('lsof -i (all connections)', () => {
    const result = transpile('lsof -i', { availableTools: noTools });
    expect(result).toContain('Get-NetTCPConnection');
  });

  it('lsof -p PID', () => {
    const result = transpile('lsof -p 1234', { availableTools: noTools });
    expect(result).toContain('Get-Process');
    expect(result).toContain('1234');
  });

  it('bare lsof', () => {
    const result = transpile('lsof', { availableTools: noTools });
    expect(result).toContain('Get-NetTCPConnection');
  });
});

describe('pkill', () => {
  it('pkill node', () => {
    const result = transpile('pkill node', { availableTools: noTools });
    expect(result).toContain('Stop-Process');
    expect(result).toContain('-Name');
    expect(result).toContain('node');
  });

  it('pkill -9 node (force)', () => {
    const result = transpile('pkill -9 node', { availableTools: noTools });
    expect(result).toContain('Stop-Process');
    expect(result).toContain('-Force');
  });

  it('pkill --signal SIGKILL node', () => {
    const result = transpile('pkill --signal SIGKILL node', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('pkill with no args', () => {
    const result = transpile('pkill', { availableTools: noTools });
    expect(result).toContain('# pkill');
  });
});

describe('killall', () => {
  it('killall node', () => {
    const result = transpile('killall node', { availableTools: noTools });
    expect(result).toContain('Stop-Process');
    expect(result).toContain('node');
  });

  it('killall -9 node', () => {
    const result = transpile('killall -9 node', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('killall multiple processes', () => {
    const result = transpile('killall node python', { availableTools: noTools });
    expect(result).toContain('node');
    expect(result).toContain('python');
  });
});

describe('pgrep', () => {
  it('pgrep node (PIDs)', () => {
    const result = transpile('pgrep node', { availableTools: noTools });
    expect(result).toContain('Get-Process');
    expect(result).toContain('.Id');
  });

  it('pgrep -l node (list with names)', () => {
    const result = transpile('pgrep -l node', { availableTools: noTools });
    expect(result).toContain('Select-Object');
    expect(result).toContain('ProcessName');
  });

  it('pgrep -c node (count)', () => {
    const result = transpile('pgrep -c node', { availableTools: noTools });
    expect(result).toContain('Measure-Object');
    expect(result).toContain('.Count');
  });
});
