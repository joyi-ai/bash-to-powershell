import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('cut', () => {
  it('cut -d: -f1 (single field)', () => {
    const result = transpile('cut -d: -f1', { availableTools: noTools });
    expect(result).toContain('-split');
    expect(result).toContain('[0]');
  });

  it('cut -d, -f2 file.csv', () => {
    const result = transpile('cut -d, -f2 file.csv', { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain('-split');
    expect(result).toContain('[1]');
  });

  it('cut -c1-5 (character range)', () => {
    const result = transpile('cut -c1-5', { availableTools: noTools });
    expect(result).toContain('Substring');
  });

  it('cut -c3 (single character)', () => {
    const result = transpile('cut -c3', { availableTools: noTools });
    expect(result).toContain('[2]');
  });

  it('cut with tab delimiter (default)', () => {
    const result = transpile('cut -f1', { availableTools: noTools });
    expect(result).toContain('-split');
  });
});

describe('mktemp', () => {
  it('bare mktemp', () => {
    const result = transpile('mktemp', { availableTools: noTools });
    expect(result).toContain('New-TemporaryFile');
  });

  it('mktemp -d (directory)', () => {
    const result = transpile('mktemp -d', { availableTools: noTools });
    expect(result).toContain('New-Item');
    expect(result).toContain('Directory');
  });
});

describe('nohup', () => {
  it('nohup node server.js', () => {
    const result = transpile('nohup node server.js', { availableTools: noTools });
    expect(result).toContain('Start-Process');
    expect(result).toContain('-NoNewWindow');
    expect(result).toContain('node');
  });

  it('nohup with no args', () => {
    const result = transpile('nohup', { availableTools: noTools });
    expect(result).toContain('# nohup');
  });
});

describe('sudo', () => {
  it('sudo rm -rf /tmp/cache (strips sudo)', () => {
    const result = transpile('sudo rm -rf /tmp/cache', { availableTools: noTools });
    expect(result).not.toContain('sudo');
    expect(result).toContain('Remove-Item');
  });

  it('sudo apt-get install (strips sudo, passes command)', () => {
    const result = transpile('sudo apt-get install curl', { availableTools: noTools });
    expect(result).not.toContain('sudo');
    expect(result).toContain('apt-get');
  });
});

describe('seq', () => {
  it('seq 10', () => {
    const result = transpile('seq 10', { availableTools: noTools });
    expect(result).toBe('1..10');
  });

  it('seq 5 20', () => {
    const result = transpile('seq 5 20', { availableTools: noTools });
    expect(result).toBe('5..20');
  });

  it('seq 1 2 10 (with step)', () => {
    const result = transpile('seq 1 2 10', { availableTools: noTools });
    expect(result).toContain('for');
    expect(result).toContain('+= 2');
  });
});
