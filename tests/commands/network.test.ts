import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };
const withTools: ToolAvailability = { rg: true, fd: true, curl: true, jq: true };

describe('curl', () => {
  it('with curl.exe available passes through', () => {
    const result = transpile('curl https://api.example.com', { availableTools: withTools });
    expect(result).toContain('curl.exe');
  });

  it('fallback to Invoke-WebRequest', () => {
    const result = transpile('curl https://api.example.com', { availableTools: noTools });
    expect(result).toContain('Invoke-WebRequest');
    expect(result).toContain('-Uri');
  });

  it('-s (silent) returns .Content', () => {
    const result = transpile('curl -s https://api.example.com', { availableTools: noTools });
    expect(result).toContain('.Content');
  });

  it('-o output file', () => {
    const result = transpile('curl -o out.json https://api.example.com', { availableTools: noTools });
    expect(result).toContain('-OutFile');
    expect(result).toContain("'out.json'");
  });

  it('-X POST uses Invoke-RestMethod', () => {
    const result = transpile('curl -X POST https://api.example.com', { availableTools: noTools });
    expect(result).toContain('Invoke-RestMethod');
    expect(result).toContain('-Method POST');
  });

  it('-H (header)', () => {
    const result = transpile('curl -H "Authorization: Bearer token" https://api.example.com', { availableTools: noTools });
    expect(result).toContain('-Headers');
  });

  it('-d (data) uses Invoke-RestMethod', () => {
    const result = transpile("curl -d '{\"key\":\"val\"}' https://api.example.com", { availableTools: noTools });
    expect(result).toContain('Invoke-RestMethod');
    expect(result).toContain('-Body');
  });

  it('-k (insecure)', () => {
    const result = transpile('curl -k https://self-signed.example.com', { availableTools: noTools });
    expect(result).toContain('-SkipCertificateCheck');
  });

  it('-m timeout', () => {
    const result = transpile('curl -m 30 https://api.example.com', { availableTools: noTools });
    expect(result).toContain('-TimeoutSec 30');
  });

  it('reports no fallback when curl.exe available', () => {
    const meta = transpileWithMeta('curl https://api.example.com', { availableTools: withTools });
    expect(meta.usedFallbacks).toBe(false);
  });
});

describe('wget', () => {
  it('with curl.exe available uses curl.exe', () => {
    const result = transpile('wget https://example.com/file.zip', { availableTools: withTools });
    expect(result).toContain('curl.exe');
    expect(result).toContain('-L');
  });

  it('fallback to Invoke-WebRequest', () => {
    const result = transpile('wget https://example.com/file.zip', { availableTools: noTools });
    expect(result).toContain('Invoke-WebRequest');
    expect(result).toContain('-OutFile');
  });

  it('-O output file', () => {
    const result = transpile('wget -O myfile.zip https://example.com/file.zip', { availableTools: noTools });
    expect(result).toContain('-OutFile');
    expect(result).toContain("'myfile.zip'");
  });
});
