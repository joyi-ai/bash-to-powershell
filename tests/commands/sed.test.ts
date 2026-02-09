import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('sed', () => {
  it('basic substitution s/old/new/', () => {
    const result = transpile("sed 's/old/new/' file.txt", { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain("-replace");
    expect(result).toContain("'old'");
    expect(result).toContain("'new'");
  });

  it('global substitution s/old/new/g', () => {
    const result = transpile("sed 's/old/new/g' file.txt", { availableTools: noTools });
    expect(result).toContain("-replace");
  });

  it('-i (in-place)', () => {
    const result = transpile("sed -i 's/old/new/g' file.txt", { availableTools: noTools });
    expect(result).toContain('Set-Content');
    expect(result).toContain('Get-Content');
  });

  it('-i.bak (in-place with backup)', () => {
    const result = transpile("sed -i.bak 's/old/new/g' file.txt", { availableTools: noTools });
    expect(result).toContain('Copy-Item');
    expect(result).toContain('.bak');
    expect(result).toContain('Set-Content');
  });

  it('/pattern/d (delete matching lines)', () => {
    const result = transpile("sed '/^#/d' file.txt", { availableTools: noTools });
    expect(result).toContain('Where-Object');
    expect(result).toContain('-notmatch');
  });

  it('Nd (delete line N)', () => {
    const result = transpile("sed '1d' file.txt", { availableTools: noTools });
    expect(result).toContain('Where-Object');
    expect(result).toContain('ReadCount');
  });

  it('-n /pattern/p (print matching)', () => {
    const result = transpile("sed -n '/error/p' file.txt", { availableTools: noTools });
    expect(result).toContain('Where-Object');
    expect(result).toContain('-match');
  });

  it('N,Mp (line range)', () => {
    const result = transpile("sed -n '5,10p' file.txt", { availableTools: noTools });
    expect(result).toContain('Select-Object');
    expect(result).toContain('-Skip 4');
    expect(result).toContain('-First 6');
  });

  it('backreferences \\1', () => {
    const result = transpile("sed 's/\\(.*\\)/[\\1]/' file.txt", { availableTools: noTools });
    expect(result).toContain('$1');
  });

  it('-e multiple expressions', () => {
    const result = transpile("sed -e 's/a/b/' -e 's/c/d/' file.txt", { availableTools: noTools });
    expect(result).toContain('-replace');
    // Both should be in pipeline
    const replaceCount = (result.match(/-replace/g) || []).length;
    expect(replaceCount).toBe(2);
  });

  it('alternate delimiter s|old|new|', () => {
    const result = transpile("sed 's|/usr/bin|/usr/local/bin|' file.txt", { availableTools: noTools });
    expect(result).toContain('-replace');
    expect(result).toContain('/usr/bin');
    expect(result).toContain('/usr/local/bin');
  });

  it('piped input (no file)', () => {
    const result = transpile("sed 's/old/new/'", { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
    expect(result).not.toContain('Get-Content');
  });
});
