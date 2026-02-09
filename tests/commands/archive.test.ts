import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('zip', () => {
  it('zip archive.zip file1 file2', () => {
    const result = transpile('zip archive.zip file1 file2', { availableTools: noTools });
    expect(result).toContain('Compress-Archive');
    expect(result).toContain('archive.zip');
    expect(result).toContain('file1');
    expect(result).toContain('file2');
  });

  it('zip -r output.zip dir/', () => {
    const result = transpile('zip -r output.zip dir/', { availableTools: noTools });
    expect(result).toContain('Compress-Archive');
    expect(result).toContain('output.zip');
  });

  it('zip -u existing.zip newfile', () => {
    const result = transpile('zip -u existing.zip newfile', { availableTools: noTools });
    expect(result).toContain('-Update');
  });

  it('auto-appends .zip extension', () => {
    const result = transpile('zip archive src/', { availableTools: noTools });
    expect(result).toContain('archive.zip');
  });
});

describe('unzip', () => {
  it('unzip archive.zip', () => {
    const result = transpile('unzip archive.zip', { availableTools: noTools });
    expect(result).toContain('Expand-Archive');
    expect(result).toContain('archive.zip');
  });

  it('unzip -d dest/ archive.zip', () => {
    const result = transpile('unzip -d dest/ archive.zip', { availableTools: noTools });
    expect(result).toContain('Expand-Archive');
    expect(result).toContain('dest/');
  });

  it('unzip -o archive.zip (overwrite)', () => {
    const result = transpile('unzip -o archive.zip', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('unzip -l archive.zip (list)', () => {
    const result = transpile('unzip -l archive.zip', { availableTools: noTools });
    expect(result).toContain('ZipFile');
    expect(result).toContain('FullName');
  });
});
