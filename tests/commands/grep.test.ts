import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };
const withTools: ToolAvailability = { rg: true, fd: true, curl: true, jq: true };

describe('grep with rg', () => {
  it('basic grep', () => {
    const result = transpile('grep "pattern" file.txt', { availableTools: withTools });
    expect(result).toContain('rg');
    expect(result).toContain("'pattern'");
  });

  it('-i (case insensitive)', () => {
    const result = transpile('grep -i "todo" src/', { availableTools: withTools });
    expect(result).toContain('rg');
    expect(result).toContain('-i');
  });

  it('-rn (recursive + line numbers)', () => {
    const result = transpile('grep -rn "TODO" .', { availableTools: withTools });
    expect(result).toContain('rg');
    expect(result).toContain('-n');
  });

  it('-l (files-with-matches)', () => {
    const result = transpile('grep -rl "TODO" .', { availableTools: withTools });
    expect(result).toContain('-l');
  });

  it('-v (invert match)', () => {
    const result = transpile('grep -v "test" file.txt', { availableTools: withTools });
    expect(result).toContain('-v');
  });

  it('-c (count)', () => {
    const result = transpile('grep -c "err" log.txt', { availableTools: withTools });
    expect(result).toContain('-c');
  });

  it('-o (only matching)', () => {
    const result = transpile('grep -o "[0-9]+" file.txt', { availableTools: withTools });
    expect(result).toContain('-o');
  });

  it('-F (fixed strings)', () => {
    const result = transpile('grep -F "literal.string" file.txt', { availableTools: withTools });
    expect(result).toContain('-F');
  });

  it('-m 5 (max count)', () => {
    const result = transpile('grep -m 5 "x" file.txt', { availableTools: withTools });
    expect(result).toContain('-m');
    expect(result).toContain('5');
  });

  it('-A 3 (after context)', () => {
    const result = transpile('grep -A 3 "x" file.txt', { availableTools: withTools });
    expect(result).toContain('-A');
    expect(result).toContain('3');
  });

  it('--include file filter', () => {
    const result = transpile('grep -r "TODO" --include="*.ts" src/', { availableTools: withTools });
    expect(result).toContain('-g');
    expect(result).toContain("'*.ts'");
  });

  it('--exclude file filter', () => {
    const result = transpile('grep -r "TODO" --exclude="*.js" .', { availableTools: withTools });
    expect(result).toContain('-g');
    expect(result).toContain("'!*.js'");
  });

  it('reports no fallback', () => {
    const meta = transpileWithMeta('grep "x" file.txt', { availableTools: withTools });
    expect(meta.usedFallbacks).toBe(false);
  });
});

describe('grep fallback (Select-String)', () => {
  it('basic grep', () => {
    const result = transpile('grep "pattern" file.txt', { availableTools: noTools });
    expect(result).toContain('Select-String');
    expect(result).toContain('-Pattern');
  });

  it('-r (recursive) uses Get-ChildItem', () => {
    const result = transpile('grep -r "TODO" src/', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('-Recurse');
    expect(result).toContain('Select-String');
  });

  it('-v (invert) uses -NotMatch', () => {
    const result = transpile('grep -v "test" file.txt', { availableTools: noTools });
    expect(result).toContain('-NotMatch');
  });

  it('-F uses -SimpleMatch', () => {
    const result = transpile('grep -F "literal" file.txt', { availableTools: noTools });
    expect(result).toContain('-SimpleMatch');
  });

  it('-l uses Select-Object -Unique -ExpandProperty Path', () => {
    const result = transpile('grep -rl "TODO" .', { availableTools: noTools });
    expect(result).toContain('Select-Object -Unique -ExpandProperty Path');
  });

  it('reports fallback used', () => {
    const meta = transpileWithMeta('grep "x" file.txt', { availableTools: noTools });
    expect(meta.usedFallbacks).toBe(true);
  });
});

describe('egrep/fgrep', () => {
  it('egrep treated as grep', () => {
    const result = transpile('egrep "a|b" file.txt', { availableTools: withTools });
    expect(result).toContain('rg');
  });

  it('fgrep treated as fixed strings grep', () => {
    const result = transpile('fgrep "literal" file.txt', { availableTools: noTools });
    expect(result).toContain('Select-String');
  });
});
