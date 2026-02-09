# bash-to-powershell

A fast, zero-dependency bash-to-PowerShell transpiler built for AI agent middleware. Converts bash commands into native PowerShell equivalents so agents can run on Windows without Git Bash.

## Why

AI coding agents generate bash commands. On Windows, this typically requires Git Bash or WSL. This library eliminates that dependency by transpiling bash to PowerShell at the middleware layer — the agent writes bash, the host runs PowerShell.

## Install

```bash
npm install bash-to-powershell
```

## Usage

```typescript
import { transpile } from 'bash-to-powershell';

transpile('ls -la src/');
// → "Get-ChildItem -Path src/ -Force | ForEach-Object { ... "$m  $s  $d  $($_.Name)" }"

transpile('grep -r "TODO" src/ | head -20');
// → "Get-ChildItem -Recurse ... | Select-String ... | ForEach-Object { "$($_.Path):$($_.Line)" } | Select-Object -First 20"

transpile('cat file.txt | grep "error" | wc -l');
// → "Get-Content file.txt | Select-String -Pattern 'error' | ForEach-Object { $_.Line } | (Measure-Object -Line).Lines"

transpile('cd frontend && npm install');
// → "Set-Location frontend; if ($?) { npm install }"

transpile('node server.js &');
// → "Start-Job -ScriptBlock { node server.js }"
```

### With native tool detection

If `rg`, `fd`, `curl.exe`, or `jq` are available on the system, the transpiler uses them instead of PowerShell fallbacks:

```typescript
import { transpile } from 'bash-to-powershell';

// With ripgrep available
transpile('grep -ri "pattern" src/', {
  availableTools: { rg: true, fd: false, curl: false, jq: false }
});
// → "rg -i -s 'pattern' src/"

// With fd available
transpile('find . -name "*.ts" -type f', {
  availableTools: { rg: false, fd: true, curl: false, jq: false }
});
// → "fd -e ts -t f"
```

### Full metadata

```typescript
import { transpileWithMeta } from 'bash-to-powershell';

const result = transpileWithMeta('rm -rf dist && mkdir -p build');
// result.powershell  → "Remove-Item -Path 'dist' -Recurse -Force; if ($?) { New-Item -Path 'build' -ItemType Directory -Force }"
// result.warnings    → []
// result.unsupported → []
// result.usedFallbacks → true
```

## Supported Commands

**51 commands** with flag-level translation:

| Category | Commands |
|----------|----------|
| File ops | `ls`, `cat`, `head`, `tail`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `ln`, `chmod` |
| Search | `grep`, `egrep`, `fgrep`, `find` (with `rg`/`fd` dual-path) |
| Text processing | `sed`, `awk`, `sort`, `uniq`, `cut`, `tr`, `tee`, `diff`, `xargs`, `wc` |
| Shell builtins | `cd`, `pwd`, `echo`, `printf`, `export`, `unset`, `env`, `test`, `[`, `true`, `false`, `source`, `seq` |
| Process management | `ps`, `kill`, `pkill`, `killall`, `pgrep`, `lsof` |
| System | `which`, `command`, `whoami`, `uname`, `date`, `sleep`, `history`, `du`, `df`, `mktemp`, `nohup`, `sudo` |
| Network | `curl`, `wget` (with `curl.exe` dual-path) |
| Archive | `zip`, `unzip` |
| Path utils | `basename`, `dirname`, `realpath`, `readlink` |

**Shell constructs:**
- Pipes (`|`), chains (`&&`, `||`, `;`), subshells (`(...)`)
- Background processes (`&` → `Start-Job`)
- Redirects (`>`, `>>`, `2>&1`, `2>/dev/null`)
- Variable expansion (`$HOME`, `${VAR}`, `$?`, `$@`, `$1`)
- Command substitution (`$(...)`)
- Quoting (`'...'`, `"..."`, `$'...'`)
- Path translation (`/dev/null` → `$null`, `/tmp` → `$env:TEMP`, `~` → `$env:USERPROFILE`)

**Output compatibility:**
- `grep` fallback formats output as `file:line:content` (matches bash grep)
- `ls -l` outputs `mode size date name` (approximates bash ls)
- `find` outputs file paths (one per line, like bash find)
- Native tool paths (`rg`, `fd`) produce identical output to Linux

**Not supported** (by design — these are uncommon in agent output):
- Control flow (`if`/`for`/`while`/`case`)
- Function definitions
- Arrays, process substitution, brace expansion, arithmetic expansion

## Performance

~1.9 microseconds per transpilation, 500K+ ops/sec on a single thread.

```
Category breakdown:
  pass-through    0.87µs
  builtins        0.83µs
  translators     1.32µs
  pipes           2.33µs
  chains          1.88µs
```

Optimized with charCode lookup tables, slice-based string extraction, WeakMap-cached flag parsing, and zero regex in hot paths.

## Architecture

```
bash string → Lexer → Tokens → Parser → AST → Transformer → PowerShell string
```

- **Lexer** (`src/lexer.ts`) — Tokenizes bash input. Handles quoting, escapes, operators, heredocs.
- **Parser** (`src/parser.ts`) — Builds AST with pipelines, logical expressions, assignments, subshells.
- **Transformer** (`src/transformer.ts`) — Walks AST, translates variables, paths, redirects, quoting.
- **Command translators** (`src/commands/*.ts`) — Per-command flag translation with shared arg parser.

## Tests

477 tests across 28 files covering every command translator, the core transformer, output compatibility, real-world agent patterns, and edge cases.

```bash
npm test            # run all tests
npm run typecheck   # type checking
```

## License

MIT
