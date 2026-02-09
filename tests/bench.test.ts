import { describe, it, expect } from 'vitest';
import { transpile } from '../src/index.js';
import { ToolAvailability } from '../src/types.js';

const noTools: ToolAvailability = { rg: false, fd: false, curl: false, jq: false };
const withTools: ToolAvailability = { rg: true, fd: true, curl: true, jq: true };

// Representative commands from each category, ordered simple → complex
const BENCH_COMMANDS = [
  // Simple pass-throughs
  'git status',
  'npm run build',
  'python script.py',
  // Builtins
  'cd frontend',
  'echo "hello world"',
  'export NODE_ENV=production',
  // Single translator
  'ls -la src/',
  'cat file.txt',
  'grep -r "pattern" src/',
  'find . -name "*.ts" -type f',
  'sed \'s/old/new/g\' file.txt',
  "awk '{print $1}' file.txt",
  'head -20 file.txt',
  'rm -rf dist',
  'mkdir -p build/output',
  'cp -r src/* dist/',
  'curl -s https://example.com',
  'wc -l file.txt',
  'sort -u file.txt',
  // Pipes
  'echo hello | grep hello',
  'cat file.txt | grep "pattern" | head -20',
  'find . -name "*.ts" | grep -v test | wc -l',
  'ls -la | grep ".ts"',
  // Chains
  'cd frontend && npm install',
  'mkdir -p dist && cp -r src/* dist/',
  'export NODE_ENV=production && node app.js',
  // Complex multi-step (real agent patterns)
  'cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -40',
  'git add . && git commit -m "update"',
  'rm -rf dist ; mkdir dist ; cp -r src/* dist/',
];

function bench(label: string, fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 100); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  return elapsed;
}

describe('performance', () => {
  const ITERATIONS = 10_000;

  it(`transpiles ${BENCH_COMMANDS.length} commands × ${ITERATIONS} iterations under budget`, () => {
    const totalMs = bench('all commands', () => {
      for (const cmd of BENCH_COMMANDS) {
        transpile(cmd, { availableTools: noTools });
      }
    }, ITERATIONS);

    const totalOps = BENCH_COMMANDS.length * ITERATIONS;
    const usPerOp = (totalMs * 1000) / totalOps;
    const opsPerSec = Math.round(totalOps / (totalMs / 1000));

    console.log(`\n  Total: ${totalMs.toFixed(1)}ms for ${totalOps.toLocaleString()} transpilations`);
    console.log(`  Per-op: ${usPerOp.toFixed(2)}µs`);
    console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec`);

    // Budget: each transpilation should be under 50µs on average
    expect(usPerOp).toBeLessThan(50);
  });

  it('individual command category timings', () => {
    const categories: Record<string, string[]> = {
      'pass-through': ['git status', 'npm run build', 'python script.py'],
      'builtins': ['cd frontend', 'echo "hello world"', 'export NODE_ENV=production'],
      'translators': [
        'ls -la src/', 'cat file.txt', 'grep -r "pattern" src/',
        'find . -name "*.ts" -type f', 'sed \'s/old/new/g\' file.txt',
        "awk '{print $1}' file.txt", 'head -20 file.txt',
      ],
      'pipes': [
        'cat file.txt | grep "pattern" | head -20',
        'find . -name "*.ts" | grep -v test | wc -l',
      ],
      'chains': [
        'cd frontend && npm install',
        'cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -40',
      ],
    };

    console.log('\n  Category breakdown (µs/op):');
    for (const [name, cmds] of Object.entries(categories)) {
      const ms = bench(name, () => {
        for (const cmd of cmds) transpile(cmd, { availableTools: noTools });
      }, ITERATIONS);
      const usPerOp = (ms * 1000) / (cmds.length * ITERATIONS);
      console.log(`    ${name.padEnd(15)} ${usPerOp.toFixed(2)}µs`);
    }
  });

  it('with-tools path is not slower than no-tools', () => {
    const dualPathCmds = [
      'grep -r "pattern" src/',
      'find . -name "*.ts"',
      'curl -s https://example.com',
    ];

    const noToolsMs = bench('no-tools', () => {
      for (const cmd of dualPathCmds) transpile(cmd, { availableTools: noTools });
    }, ITERATIONS);

    const withToolsMs = bench('with-tools', () => {
      for (const cmd of dualPathCmds) transpile(cmd, { availableTools: withTools });
    }, ITERATIONS);

    const noToolsUs = (noToolsMs * 1000) / (dualPathCmds.length * ITERATIONS);
    const withToolsUs = (withToolsMs * 1000) / (dualPathCmds.length * ITERATIONS);

    console.log(`\n  no-tools:   ${noToolsUs.toFixed(2)}µs/op`);
    console.log(`  with-tools: ${withToolsUs.toFixed(2)}µs/op`);

    // with-tools should not be more than 2x slower
    expect(withToolsMs).toBeLessThan(noToolsMs * 2);
  });
});
