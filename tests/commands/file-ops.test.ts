import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('rm', () => {
  it('single file', () => {
    const result = transpile('rm file.txt', { availableTools: noTools });
    expect(result).toContain('Remove-Item');
    expect(result).toContain("'file.txt'");
  });

  it('-r (recursive)', () => {
    const result = transpile('rm -r dir/', { availableTools: noTools });
    expect(result).toContain('-Recurse');
  });

  it('-f (force)', () => {
    const result = transpile('rm -f file.txt', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('-rf (combined)', () => {
    const result = transpile('rm -rf dist/', { availableTools: noTools });
    expect(result).toContain('-Recurse');
    expect(result).toContain('-Force');
  });

  it('no args emits warning', () => {
    const meta = transpileWithMeta('rm', { availableTools: noTools });
    expect(meta.warnings).toContain('rm: no files specified');
  });
});

describe('cp', () => {
  it('source dest', () => {
    const result = transpile('cp a.txt b.txt', { availableTools: noTools });
    expect(result).toContain('Copy-Item');
    expect(result).toContain('-Path');
    expect(result).toContain('-Destination');
  });

  it('-r (recursive)', () => {
    const result = transpile('cp -r src/ dest/', { availableTools: noTools });
    expect(result).toContain('-Recurse');
  });

  it('-a (archive, implies recursive)', () => {
    const result = transpile('cp -a src/ dest/', { availableTools: noTools });
    expect(result).toContain('-Recurse');
  });

  it('missing dest emits warning', () => {
    const meta = transpileWithMeta('cp a.txt', { availableTools: noTools });
    expect(meta.warnings).toContain('cp: missing destination');
  });
});

describe('mv', () => {
  it('source dest', () => {
    const result = transpile('mv old.txt new.txt', { availableTools: noTools });
    expect(result).toContain('Move-Item');
    expect(result).toContain('-Path');
    expect(result).toContain('-Destination');
  });

  it('-f (force)', () => {
    const result = transpile('mv -f old.txt new.txt', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('missing dest emits warning', () => {
    const meta = transpileWithMeta('mv a.txt', { availableTools: noTools });
    expect(meta.warnings).toContain('mv: missing destination');
  });
});

describe('mkdir', () => {
  it('single dir', () => {
    const result = transpile('mkdir mydir', { availableTools: noTools });
    expect(result).toContain('New-Item');
    expect(result).toContain('-ItemType Directory');
    expect(result).toContain('-Force');
    expect(result).toContain("'mydir'");
  });

  it('-p (parents)', () => {
    const result = transpile('mkdir -p a/b/c', { availableTools: noTools });
    expect(result).toContain('-Force');
  });

  it('multiple dirs joined by ;', () => {
    const result = transpile('mkdir dir1 dir2', { availableTools: noTools });
    expect(result).toContain("'dir1'");
    expect(result).toContain("'dir2'");
    expect(result).toContain(';');
  });
});

describe('touch', () => {
  it('single file', () => {
    const result = transpile('touch file.txt', { availableTools: noTools });
    expect(result).toContain('Test-Path');
    expect(result).toContain('New-Item -ItemType File');
  });

  it('multiple files', () => {
    const result = transpile('touch a.txt b.txt', { availableTools: noTools });
    expect(result).toContain("'a.txt'");
    expect(result).toContain("'b.txt'");
    expect(result).toContain(';');
  });
});

describe('ln', () => {
  it('-s (symbolic link)', () => {
    const result = transpile('ln -s target link', { availableTools: noTools });
    expect(result).toContain('New-Item');
    expect(result).toContain('-ItemType SymbolicLink');
    expect(result).toContain('-Target');
  });

  it('hard link (no -s)', () => {
    const result = transpile('ln target link', { availableTools: noTools });
    expect(result).toContain('-ItemType HardLink');
  });
});

describe('chmod', () => {
  it('+x uses Unblock-File', () => {
    const result = transpile('chmod +x script.sh', { availableTools: noTools });
    expect(result).toContain('Unblock-File');
  });

  it('+x emits warning about permissions', () => {
    const meta = transpileWithMeta('chmod +x script.sh', { availableTools: noTools });
    expect(meta.warnings.length).toBeGreaterThan(0);
    expect(meta.warnings[0]).toContain('Unblock-File');
  });

  it('numeric mode suggests icacls', () => {
    const result = transpile('chmod 755 file.txt', { availableTools: noTools });
    expect(result).toContain('icacls');
  });
});
