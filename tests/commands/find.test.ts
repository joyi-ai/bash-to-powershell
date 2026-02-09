import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };
const withTools: ToolAvailability = { rg: true, fd: true, curl: true, jq: true };

describe('find with fd', () => {
  it('-name uses -g', () => {
    const result = transpile('find . -name "*.ts"', { availableTools: withTools });
    expect(result).toContain('fd');
    expect(result).toContain('-g');
    expect(result).toContain("'*.ts'");
  });

  it('-type f', () => {
    const result = transpile('find . -type f', { availableTools: withTools });
    expect(result).toContain('fd');
    expect(result).toContain('-t f');
  });

  it('-type d', () => {
    const result = transpile('find . -type d', { availableTools: withTools });
    expect(result).toContain('-t d');
  });

  it('-maxdepth uses -d', () => {
    const result = transpile('find . -maxdepth 2 -name "*.ts"', { availableTools: withTools });
    expect(result).toContain('-d 2');
  });

  it('-iname uses -i -g', () => {
    const result = transpile('find . -iname "readme*"', { availableTools: withTools });
    expect(result).toContain('-i');
    expect(result).toContain('-g');
  });

  it('-not -path uses -E', () => {
    const result = transpile('find . -name "*.ts" -not -path "*/node_modules/*"', { availableTools: withTools });
    expect(result).toContain('-E');
  });
});

describe('find fallback (Get-ChildItem)', () => {
  it('-name uses -Filter', () => {
    const result = transpile('find . -name "*.ts"', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('-Filter');
    expect(result).toContain("'*.ts'");
  });

  it('-type f uses -File', () => {
    const result = transpile('find . -type f', { availableTools: noTools });
    expect(result).toContain('-File');
  });

  it('-type d uses -Directory', () => {
    const result = transpile('find . -type d', { availableTools: noTools });
    expect(result).toContain('-Directory');
  });

  it('-maxdepth uses -Depth', () => {
    const result = transpile('find . -maxdepth 2 -name "*.ts"', { availableTools: noTools });
    expect(result).toContain('-Depth 2');
  });

  it('-delete uses Remove-Item', () => {
    const result = transpile('find . -name "*.tmp" -delete', { availableTools: noTools });
    expect(result).toContain('Remove-Item -Force');
  });

  it('-empty uses $_.Length -eq 0', () => {
    const result = transpile('find . -empty', { availableTools: noTools });
    expect(result).toContain('$_.Length -eq 0');
  });

  it('-exec uses ForEach-Object', () => {
    const result = transpile('find . -name "*.ts" -exec wc -l {} ;', { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
  });

  it('defaults to path .', () => {
    const result = transpile('find', { availableTools: noTools });
    expect(result).toContain("'.'");
  });

  it('combined -type f -name -maxdepth', () => {
    const result = transpile('find . -type f -name "*.json" -maxdepth 1', { availableTools: noTools });
    expect(result).toContain('-File');
    expect(result).toContain('-Filter');
    expect(result).toContain('-Depth 1');
  });
});
