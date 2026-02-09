import { SimpleCommandNode, WordNode, WordPart, TransformContext } from '../types.js';

export interface FlagSpec {
  short?: string;
  long?: string;
  takesValue?: boolean;
}

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional: string[];
}

// Cache compiled flag maps per specs array reference
const specsCache = new WeakMap<FlagSpec[], { shortMap: Map<string, FlagSpec>; longMap: Map<string, FlagSpec> }>();

function getSpecMaps(specs: FlagSpec[]) {
  let cached = specsCache.get(specs);
  if (cached) return cached;
  const shortMap = new Map<string, FlagSpec>();
  const longMap = new Map<string, FlagSpec>();
  for (const spec of specs) {
    if (spec.short) shortMap.set(spec.short, spec);
    if (spec.long) longMap.set(spec.long, spec);
  }
  cached = { shortMap, longMap };
  specsCache.set(specs, cached);
  return cached;
}

/**
 * Parse command arguments against a flag specification.
 * Handles both -x, --long, -xyz (combined short), and --flag=value forms.
 */
export function parseArgs(
  args: string[],
  specs: FlagSpec[],
): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  const { shortMap, longMap } = getSpecMaps(specs);

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // -- stops flag parsing
    if (arg === '--') {
      i++;
      while (i < args.length) positional.push(args[i++]);
      break;
    }

    // --long-flag or --long-flag=value
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      const name = eqIdx >= 0 ? arg.slice(2, eqIdx) : arg.slice(2);
      const spec = longMap.get(name);
      if (spec) {
        const key = spec.long ?? spec.short ?? name;
        if (spec.takesValue) {
          if (eqIdx >= 0) {
            flags[key] = arg.slice(eqIdx + 1);
          } else if (i + 1 < args.length) {
            flags[key] = args[++i];
          }
        } else {
          flags[key] = true;
        }
      } else {
        // Unknown long flag — store as-is
        if (eqIdx >= 0) {
          flags[name] = arg.slice(eqIdx + 1);
        } else {
          flags[name] = true;
        }
      }
      i++;
      continue;
    }

    // -x or -xyz (combined short flags)
    if (arg.startsWith('-') && arg.length > 1 && arg[1] !== '-') {
      for (let j = 1; j < arg.length; j++) {
        const ch = arg[j];
        const spec = shortMap.get(ch);
        if (spec) {
          const key = spec.long ?? spec.short ?? ch;
          if (spec.takesValue) {
            // Rest of arg is the value, or next arg
            const rest = arg.slice(j + 1);
            if (rest) {
              flags[key] = rest;
            } else if (i + 1 < args.length) {
              flags[key] = args[++i];
            }
            break; // consumed rest of arg
          } else {
            flags[key] = true;
          }
        } else {
          flags[ch] = true;
        }
      }
      i++;
      continue;
    }

    // Positional
    positional.push(arg);
    i++;
  }

  return { flags, positional };
}

/** Helper: get raw string values of args from a SimpleCommandNode */
export function getArgStrings(
  cmd: SimpleCommandNode,
  tw: (w: WordNode, ctx: TransformContext) => string,
  ctx: TransformContext,
): string[] {
  return cmd.args.map(a => tw(a, ctx));
}

/** Helper: get the raw (untranslated) string from a word */
export function wordRawString(word: WordNode): string {
  const parts = word.parts;
  if (parts.length === 1 && parts[0].type === 'Literal') return parts[0].value;
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === 'Literal') result += p.value;
    else if (p.type === 'Variable') result += p.braced ? '${' + p.name + '}' : '$' + p.name;
    else if (p.type === 'CommandSubstitution') result += '$(' + p.command + ')';
  }
  return result;
}
