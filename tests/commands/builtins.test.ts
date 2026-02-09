import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };

describe('builtins', () => {
  it('true', () => {
    expect(transpile('true', { availableTools: noTools })).toContain('$true');
  });

  it('false', () => {
    expect(transpile('false', { availableTools: noTools })).toContain('$false');
  });

  it('cd with path', () => {
    const result = transpile('cd /tmp', { availableTools: noTools });
    expect(result).toContain('Set-Location');
  });

  it('cd ~ (home)', () => {
    const result = transpile('cd ~', { availableTools: noTools });
    expect(result).toContain('Set-Location');
    expect(result).toContain('$env:USERPROFILE');
  });

  it('cd - (previous dir)', () => {
    const result = transpile('cd -', { availableTools: noTools });
    expect(result).toContain('Set-Location');
    expect(result).toContain('$OLDPWD');
  });

  it('cd with no args', () => {
    const result = transpile('cd', { availableTools: noTools });
    expect(result).toContain('Set-Location');
    expect(result).toContain('$env:USERPROFILE');
  });

  it('pwd', () => {
    expect(transpile('pwd', { availableTools: noTools })).toContain('(Get-Location).Path');
  });

  it('clear', () => {
    expect(transpile('clear', { availableTools: noTools })).toContain('Clear-Host');
  });

  it('sleep N', () => {
    const result = transpile('sleep 5', { availableTools: noTools });
    expect(result).toContain('Start-Sleep');
    expect(result).toContain('-Seconds 5');
  });

  it('date with no args', () => {
    expect(transpile('date', { availableTools: noTools })).toContain('Get-Date');
  });

  it('date +%Y-%m-%d', () => {
    const result = transpile('date +%Y-%m-%d', { availableTools: noTools });
    expect(result).toContain('Get-Date');
    expect(result).toContain('-Format');
    expect(result).toContain('yyyy-MM-dd');
  });

  it('date +%H:%M:%S', () => {
    const result = transpile('date +%H:%M:%S', { availableTools: noTools });
    expect(result).toContain('Get-Date');
    expect(result).toContain('HH');
  });

  it('whoami', () => {
    const result = transpile('whoami', { availableTools: noTools });
    expect(result).toContain('WindowsIdentity');
    expect(result).toContain('GetCurrent');
  });

  it('uname', () => {
    const result = transpile('uname', { availableTools: noTools });
    expect(result).toContain('OSVersion');
  });

  it('history', () => {
    expect(transpile('history', { availableTools: noTools })).toContain('Get-History');
  });

  it('exit with code', () => {
    expect(transpile('exit 1', { availableTools: noTools })).toContain('exit 1');
  });

  it('exit with no code', () => {
    expect(transpile('exit', { availableTools: noTools })).toContain('exit 0');
  });

  it('source file', () => {
    const result = transpile('source ./env.sh', { availableTools: noTools });
    expect(result).toContain('. ');
    expect(result).toContain('env.sh');
  });

  it('du -sh dir', () => {
    const result = transpile('du -sh mydir', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('Measure-Object');
    expect(result).toContain('Sum');
  });

  it('du default', () => {
    const result = transpile('du', { availableTools: noTools });
    expect(result).toContain('Get-ChildItem');
    expect(result).toContain('Measure-Object');
  });

  it('df', () => {
    const result = transpile('df', { availableTools: noTools });
    expect(result).toContain('Get-PSDrive');
    expect(result).toContain('FileSystem');
  });
});
