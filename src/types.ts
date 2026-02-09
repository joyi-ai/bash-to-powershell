// ============================================================
// TOKEN TYPES
// ============================================================

export enum TokenType {
  Word = 'Word',
  SingleQuoted = 'SingleQuoted',
  DoubleQuoted = 'DoubleQuoted',
  DollarSingleQuoted = 'DollarSingleQuoted',

  Pipe = 'Pipe',
  And = 'And',
  Or = 'Or',
  Semi = 'Semi',
  Newline = 'Newline',

  RedirectOut = 'RedirectOut',
  RedirectAppend = 'RedirectAppend',
  RedirectIn = 'RedirectIn',
  HereDoc = 'HereDoc',
  HereString = 'HereString',

  LeftParen = 'LeftParen',
  RightParen = 'RightParen',

  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  /** For redirects: the file descriptor number (e.g. 2 in 2>&1) */
  fd?: number;
  /** For redirects like 2>&1: the target fd */
  targetFd?: number;
}

// ============================================================
// AST NODE TYPES
// ============================================================

export interface ScriptNode {
  type: 'Script';
  body: StatementNode[];
}

export type StatementNode = PipelineNode | LogicalExprNode | AssignmentStatementNode;

export interface PipelineNode {
  type: 'Pipeline';
  commands: CommandNode[];
  negated: boolean;
}

export interface LogicalExprNode {
  type: 'LogicalExpr';
  operator: '&&' | '||' | ';';
  left: StatementNode;
  right: StatementNode;
}

export type CommandNode = SimpleCommandNode | SubshellNode;

export interface SimpleCommandNode {
  type: 'SimpleCommand';
  assignments: AssignmentNode[];
  name: WordNode | null;
  args: WordNode[];
  redirects: RedirectNode[];
}

export interface SubshellNode {
  type: 'Subshell';
  body: ScriptNode;
  redirects: RedirectNode[];
}

export interface AssignmentNode {
  type: 'Assignment';
  name: string;
  value: WordNode | null;
}

export interface AssignmentStatementNode {
  type: 'AssignmentStatement';
  assignments: AssignmentNode[];
}

export interface RedirectNode {
  type: 'Redirect';
  op: '>' | '>>' | '<' | '<<<';
  fd: number;
  target: WordNode;
  /** For fd-to-fd redirects like 2>&1 */
  targetFd?: number;
}

// ============================================================
// WORD NODES (handle quoting/expansion)
// ============================================================

export interface WordNode {
  type: 'Word';
  parts: WordPart[];
}

export type WordPart =
  | LiteralPart
  | VariablePart
  | CommandSubstitutionPart
  | GlobPart;

export interface LiteralPart {
  type: 'Literal';
  value: string;
  quoting: 'unquoted' | 'single' | 'double' | 'dollar-single';
}

export interface VariablePart {
  type: 'Variable';
  name: string;
  braced: boolean;
}

export interface CommandSubstitutionPart {
  type: 'CommandSubstitution';
  /** The raw command string inside $(...) */
  command: string;
}

export interface GlobPart {
  type: 'Glob';
  pattern: string;
}

// ============================================================
// TRANSPILER OPTIONS
// ============================================================

export interface TranspileOptions {
  availableTools?: ToolAvailability;
  preferNativeTools?: boolean;
  psVersion?: '5.1' | '7';
}

export interface ToolAvailability {
  rg: boolean;
  fd: boolean;
  curl: boolean;
  jq: boolean;
}

export interface TranspileResult {
  powershell: string;
  usedFallbacks: boolean;
  warnings: string[];
  unsupported: string[];
}

export interface TransformContext {
  tools: ToolAvailability;
  options: TranspileOptions;
  warnings: string[];
  unsupported: string[];
  usedFallbacks: boolean;
}
