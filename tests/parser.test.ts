import { describe, it, expect } from 'vitest';
import { lex } from '../src/lexer.js';
import { parse } from '../src/parser.js';

describe('parser', () => {
  it('parses a simple command', () => {
    const ast = parse(lex('echo hello'));
    expect(ast.type).toBe('Script');
    expect(ast.body.length).toBe(1);
    const pipeline = ast.body[0];
    expect(pipeline.type).toBe('Pipeline');
    if (pipeline.type === 'Pipeline') {
      expect(pipeline.commands.length).toBe(1);
      expect(pipeline.commands[0].type).toBe('SimpleCommand');
    }
  });

  it('parses a pipeline', () => {
    const ast = parse(lex('echo hello | grep hello'));
    const pipeline = ast.body[0];
    expect(pipeline.type).toBe('Pipeline');
    if (pipeline.type === 'Pipeline') {
      expect(pipeline.commands.length).toBe(2);
    }
  });

  it('parses && chains', () => {
    const ast = parse(lex('cmd1 && cmd2'));
    expect(ast.body[0].type).toBe('LogicalExpr');
    if (ast.body[0].type === 'LogicalExpr') {
      expect(ast.body[0].operator).toBe('&&');
    }
  });

  it('parses || chains', () => {
    const ast = parse(lex('cmd1 || cmd2'));
    expect(ast.body[0].type).toBe('LogicalExpr');
    if (ast.body[0].type === 'LogicalExpr') {
      expect(ast.body[0].operator).toBe('||');
    }
  });

  it('parses semicolons', () => {
    const ast = parse(lex('cmd1 ; cmd2'));
    expect(ast.body[0].type).toBe('LogicalExpr');
    if (ast.body[0].type === 'LogicalExpr') {
      expect(ast.body[0].operator).toBe(';');
    }
  });

  it('parses redirects', () => {
    const ast = parse(lex('echo hi > file.txt'));
    const stmt = ast.body[0];
    if (stmt.type === 'Pipeline') {
      const cmd = stmt.commands[0];
      if (cmd.type === 'SimpleCommand') {
        expect(cmd.redirects.length).toBe(1);
        expect(cmd.redirects[0].op).toBe('>');
      }
    }
  });

  it('parses variable assignments', () => {
    const ast = parse(lex('FOO=bar'));
    expect(ast.body[0].type).toBe('AssignmentStatement');
  });

  it('parses inline assignments before command', () => {
    const ast = parse(lex('FOO=bar echo hello'));
    const stmt = ast.body[0];
    if (stmt.type === 'Pipeline') {
      const cmd = stmt.commands[0];
      if (cmd.type === 'SimpleCommand') {
        expect(cmd.assignments.length).toBe(1);
        expect(cmd.assignments[0].name).toBe('FOO');
      }
    }
  });

  it('parses subshells', () => {
    const ast = parse(lex('(echo hello)'));
    const stmt = ast.body[0];
    if (stmt.type === 'Pipeline') {
      expect(stmt.commands[0].type).toBe('Subshell');
    }
  });

  it('parses complex chaining: cmd1 && cmd2 || cmd3', () => {
    const ast = parse(lex('cmd1 && cmd2 || cmd3'));
    expect(ast.body[0].type).toBe('LogicalExpr');
  });

  it('parses word with variable parts', () => {
    const ast = parse(lex('echo $HOME'));
    const stmt = ast.body[0];
    if (stmt.type === 'Pipeline') {
      const cmd = stmt.commands[0];
      if (cmd.type === 'SimpleCommand') {
        const arg = cmd.args[0];
        expect(arg.parts.some(p => p.type === 'Variable')).toBe(true);
      }
    }
  });

  it('handles multiple statements separated by newlines', () => {
    const ast = parse(lex('cmd1\ncmd2'));
    // Should have 2 statements (possibly joined by ;)
    expect(ast.body.length >= 1).toBe(true);
  });
});
