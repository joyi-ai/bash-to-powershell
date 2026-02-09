import { TranspileOptions, TranspileResult, ToolAvailability } from './types.js';
import { lex } from './lexer.js';
import { parse } from './parser.js';
import { translateScript, translateWord } from './transformer.js';
import { TransformContext } from './types.js';
import { detectTools } from './commands/fallback.js';

export { TranspileOptions, TranspileResult, ToolAvailability } from './types.js';

/**
 * Transpile a bash command string to PowerShell.
 * Returns just the PowerShell string.
 */
export function transpile(bash: string, options?: TranspileOptions): string {
  return transpileWithMeta(bash, options).powershell;
}

/**
 * Transpile with full metadata (warnings, fallback info).
 */
export function transpileWithMeta(
  bash: string,
  options: TranspileOptions = {},
): TranspileResult {
  if (!bash || !bash.trim()) {
    return { powershell: '', usedFallbacks: false, warnings: [], unsupported: [] };
  }

  const tools = options.availableTools ?? detectTools();
  const ctx: TransformContext = {
    tools,
    options: {
      preferNativeTools: true,
      psVersion: '5.1',
      ...options,
    },
    warnings: [],
    unsupported: [],
    usedFallbacks: false,
  };

  try {
    const tokens = lex(bash);
    const ast = parse(tokens);
    const powershell = translateScript(ast, ctx);

    return {
      powershell,
      usedFallbacks: ctx.usedFallbacks,
      warnings: ctx.warnings,
      unsupported: ctx.unsupported,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      powershell: `# TRANSPILE ERROR: ${message}\n# Original: ${bash}`,
      usedFallbacks: false,
      warnings: [`Transpilation failed: ${message}`],
      unsupported: [bash],
    };
  }
}
