import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('awk', () => {
  it('{print $1} extracts first field', () => {
    const result = transpile("awk '{print $1}' file.txt", { availableTools: noTools });
    expect(result).toContain('Get-Content');
    expect(result).toContain("-split");
    expect(result).toContain('[0]');
  });

  it('-F: custom separator', () => {
    const result = transpile("awk -F: '{print $2}' file.txt", { availableTools: noTools });
    expect(result).toContain("-split ':'");
    expect(result).toContain('[1]');
  });

  it('{print $1, $3} multiple fields', () => {
    const result = transpile("awk '{print $1, $3}' file.txt", { availableTools: noTools });
    expect(result).toContain('[0]');
    expect(result).toContain('[2]');
  });

  it('{print $0} prints whole line', () => {
    const result = transpile("awk '{print $0}' file.txt", { availableTools: noTools });
    expect(result).toContain('ForEach-Object { $_ }');
  });

  it('{print} prints whole line', () => {
    const result = transpile("awk '{print}' file.txt", { availableTools: noTools });
    expect(result).toContain('ForEach-Object { $_ }');
  });

  it('NR==5 selects line by number', () => {
    const result = transpile("awk 'NR==5' file.txt", { availableTools: noTools });
    expect(result).toContain('Select-Object');
    expect(result).toContain('-Skip 4');
    expect(result).toContain('-First 1');
  });

  it('/pattern/ filters by regex', () => {
    const result = transpile("awk '/error/' file.txt", { availableTools: noTools });
    expect(result).toContain('Where-Object');
    expect(result).toContain("-match");
    expect(result).toContain("'error'");
  });

  it('{print NF} prints field count', () => {
    const result = transpile("awk '{print NF}' file.txt", { availableTools: noTools });
    expect(result).toContain('.Count');
  });

  it('piped input (no file)', () => {
    const result = transpile("awk '{print $2}'", { availableTools: noTools });
    expect(result).toContain('ForEach-Object');
    expect(result).not.toContain('Get-Content');
  });

  it('complex program returns comment with warning', () => {
    const result = transpile("awk 'BEGIN{x=0} {x+=$1} END{print x}' file.txt", { availableTools: noTools });
    expect(result).toContain('#');
    expect(result).toContain('awk');
  });
});
