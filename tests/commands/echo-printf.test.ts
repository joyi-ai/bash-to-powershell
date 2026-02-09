import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('echo', () => {
  it('simple string', () => {
    const result = transpile('echo hello', { availableTools: noTools });
    expect(result).toContain('Write-Output');
    expect(result).toContain('hello');
  });

  it('quoted string', () => {
    const result = transpile('echo "hello world"', { availableTools: noTools });
    expect(result).toContain('Write-Output');
    expect(result).toContain('hello world');
  });

  it('-n (no newline)', () => {
    const result = transpile('echo -n "hello"', { availableTools: noTools });
    expect(result).toContain('Write-Host');
    expect(result).toContain('-NoNewline');
  });

  it('-e with single-quoted escapes', () => {
    const result = transpile("echo -e 'line1\\nline2'", { availableTools: noTools });
    expect(result).toContain('`n');
  });

  it('-e with double-quoted string converts escapes', () => {
    const result = transpile('echo -e "line1\\nline2"', { availableTools: noTools });
    expect(result).toContain('Write-Output');
    expect(result).toContain('`n');
  });

  it('-ne (combined) with single-quoted escapes', () => {
    const result = transpile("echo -ne 'hello\\t'", { availableTools: noTools });
    expect(result).toContain('Write-Host');
    expect(result).toContain('-NoNewline');
    expect(result).toContain('`t');
  });

  it('no args', () => {
    const result = transpile('echo', { availableTools: noTools });
    expect(result).toContain('Write-Output');
  });

  it('-E (suppress escapes, default)', () => {
    const result = transpile('echo -E "line1\\nline2"', { availableTools: noTools });
    expect(result).toContain('Write-Output');
  });
});

describe('printf', () => {
  it('simple format %s', () => {
    const result = transpile('printf "%s %s" hello world', { availableTools: noTools });
    expect(result).toContain('Write-Host');
    expect(result).toContain('-NoNewline');
    expect(result).toContain('{0}');
    expect(result).toContain('{1}');
  });

  it('with \\n', () => {
    const result = transpile('printf "line1\\nline2"', { availableTools: noTools });
    expect(result).toContain('`n');
  });

  it('%d format', () => {
    const result = transpile('printf "%d items" 42', { availableTools: noTools });
    expect(result).toContain('{0}');
    expect(result).toContain('-f');
  });

  it('%% (escaped percent)', () => {
    const result = transpile('printf "100%%"', { availableTools: noTools });
    expect(result).toContain('100%');
  });

  it('no args', () => {
    const result = transpile('printf', { availableTools: noTools });
    expect(result).toContain("Write-Host");
  });
});
