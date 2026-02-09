import { ToolAvailability } from '../types.js';
import { execSync } from 'child_process';

let cached: ToolAvailability | null = null;

export function detectTools(): ToolAvailability {
  if (cached) return cached;
  cached = {
    rg: isAvailable('rg'),
    fd: isAvailable('fd'),
    curl: isAvailable('curl.exe'),
    jq: isAvailable('jq'),
  };
  return cached;
}

function isAvailable(cmd: string): boolean {
  try {
    execSync(`where ${cmd}`, { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Reset cache (for testing) */
export function resetToolCache(): void {
  cached = null;
}
