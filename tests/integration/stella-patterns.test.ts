import { describe, it, expect } from 'vitest';
import { transpile, transpileWithMeta } from '../../src/index.js';
import { ToolAvailability } from '../../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };
const withTools: ToolAvailability = { rg: true, fd: true, curl: true, jq: true };

/**
 * Tests for real bash command patterns that Stella AI agents produce.
 * These patterns come from:
 * - Self-mod agent (typecheck, git operations)
 * - Browser agent (hera-browser commands)
 * - General agent (file ops, package managers, dev tools)
 * - Workspace skill (app scaffolding, dev servers)
 */

describe('stella agent patterns', () => {
  describe('self-mod agent', () => {
    it('typecheck with pipe chain: cd && bunx tsc 2>&1 | head', () => {
      const result = transpile(
        'cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -40',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('Set-Location');
      expect(result).toContain('if ($?)');
      expect(result).toContain('tsc');
      expect(result).toContain('2>&1');
      expect(result).toContain('Select-Object -First 40');
    });

    it('git stash push', () => {
      const result = transpile(
        "git stash push -u -m 'self-mod-prep'",
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('git');
      expect(result).toContain('stash');
      expect(result).toContain('push');
      expect(result).toContain('self-mod-prep');
    });

    it('git diff piped to head', () => {
      const result = transpile('git diff --name-only | head -20', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('git diff --name-only');
      expect(result).toContain('Select-Object -First 20');
    });

    it('npm install in directory', () => {
      const result = transpile('cd frontend && npm install', { availableTools: noTools });
      expect(result).toContain('Set-Location');
      expect(result).toContain('if ($?)');
      expect(result).toContain('npm install');
    });

    it('bun convex typecheck', () => {
      const result = transpile('cd backend && bun convex typecheck', { availableTools: noTools });
      expect(result).toContain('Set-Location');
      expect(result).toContain('bun convex typecheck');
    });

    it('git status passes through', () => {
      const result = transpile('git status', { availableTools: noTools });
      expect(result).toBe('git status');
    });
  });

  describe('browser agent', () => {
    it('hera-browser session new passes through', () => {
      const result = transpile('hera-browser session new', { availableTools: noTools });
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('hera-browser');
      expect(result).toContain('session');
      expect(result).toContain('new');
    });

    it('hera-browser session list passes through', () => {
      const result = transpile('hera-browser session list', { availableTools: noTools });
      expect(result).toContain('hera-browser session list');
    });

    it('hera-browser session reset', () => {
      const result = transpile('hera-browser session reset abc123', { availableTools: noTools });
      expect(result).toContain('hera-browser');
      expect(result).toContain('reset');
      expect(result).toContain('abc123');
    });

    it('hera-browser execute JS with double quotes', () => {
      const result = transpile(
        'hera-browser -s 1 -e "console.log(\'hello\')"',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('hera-browser');
    });

    it('hera-browser complex JS with single quotes', () => {
      const result = transpile(
        "hera-browser -s 1 -e 'await state.page.goto(\"https://example.com\")'",
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('hera-browser');
    });
  });

  describe('workspace / general agent', () => {
    it('create-app.js', () => {
      const result = transpile(
        'node frontend/workspace/create-app.js my-app',
        { availableTools: noTools },
      );
      expect(result).toContain('node');
      expect(result).toContain('create-app.js');
      expect(result).toContain('my-app');
    });

    it('cd to stella apps + bun add', () => {
      const result = transpile(
        'cd ~/.stella/apps/my-app && bun add three @react-three/fiber',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('Set-Location');
      expect(result).toContain('if ($?)');
      expect(result).toContain('bun add');
    });

    it('cd to stella apps + bunx vite', () => {
      const result = transpile(
        'cd ~/.stella/apps/my-app && bunx vite --port 5180',
        { availableTools: noTools },
      );
      expect(result).toContain('Set-Location');
      expect(result).toContain('bunx vite --port 5180');
    });

    it('bun install passes through', () => {
      const result = transpile('bun install', { availableTools: noTools });
      expect(result).toBe('bun install');
    });

    it('git clone passes through', () => {
      const result = transpile(
        'git clone https://github.com/user/repo.git',
        { availableTools: noTools },
      );
      expect(result).toContain('git clone');
    });

    it('git add + commit chain', () => {
      const result = transpile(
        'git add . && git commit -m "update"',
        { availableTools: noTools },
      );
      expect(result).toContain('git add .');
      expect(result).toContain('if ($?)');
      expect(result).toContain('git commit');
    });

    it('tsc --noEmit passes through', () => {
      const result = transpile('tsc --noEmit', { availableTools: noTools });
      expect(result).toBe('tsc --noEmit');
    });

    it('python script passes through', () => {
      const result = transpile('python script.py', { availableTools: noTools });
      expect(result).toBe('python script.py');
    });

    it('node script passes through', () => {
      const result = transpile('node script.js', { availableTools: noTools });
      expect(result).toBe('node script.js');
    });

    it('npm run build passes through', () => {
      const result = transpile('npm run build', { availableTools: noTools });
      expect(result).toBe('npm run build');
    });
  });

  describe('complex multi-step patterns', () => {
    it('cat | grep | head triple pipe', () => {
      const result = transpile(
        'cat file.txt | grep "pattern" | head -20',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('Get-Content');
      expect(result).toContain('|');
      expect(result).toContain('Select-Object -First 20');
    });

    it('export + run command', () => {
      const result = transpile(
        'export NODE_ENV=production && node app.js',
        { availableTools: noTools },
      );
      expect(result).toContain('$env:NODE_ENV');
      expect(result).toContain('if ($?)');
      expect(result).toContain('node app.js');
    });

    it('find | grep | wc -l triple pipe', () => {
      const result = transpile(
        'find . -name "*.ts" | grep -v test | wc -l',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('|');
      expect(result).toContain('Measure-Object -Line');
    });

    it('mkdir -p && cp -r chain', () => {
      const result = transpile(
        'mkdir -p dist && cp -r src/* dist/',
        { availableTools: noTools },
      );
      expect(result).toContain('New-Item');
      expect(result).toContain('if ($?)');
      expect(result).toContain('Copy-Item');
    });

    it('ls piped to grep', () => {
      const result = transpile('ls -la | grep ".ts"', { availableTools: noTools });
      expect(result).toContain('Get-ChildItem');
      expect(result).toContain('|');
    });

    it('variable in path — cat expands $HOME', () => {
      const result = transpile('cat $HOME/.bashrc', { availableTools: noTools });
      expect(result).toContain('$env:USERPROFILE');
      expect(result).toContain('Get-Content');
    });

    it('git push passes through', () => {
      const result = transpile('git push origin main', { availableTools: noTools });
      expect(result).toBe('git push origin main');
    });

    it('complex redirect chain is valid', () => {
      const result = transpile(
        'cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -40',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      // Should have all 3 stages: cd, tsc 2>&1, head
      expect(result).toContain('Set-Location');
      expect(result).toContain('2>&1');
      expect(result).toContain('Select-Object -First');
    });

    it('multiple semicolons chain', () => {
      const result = transpile(
        'rm -rf dist ; mkdir dist ; cp -r src/* dist/',
        { availableTools: noTools },
      );
      expect(result).not.toContain('TRANSPILE ERROR');
      expect(result).toContain('Remove-Item');
      expect(result).toContain('New-Item');
      expect(result).toContain('Copy-Item');
    });
  });
});
