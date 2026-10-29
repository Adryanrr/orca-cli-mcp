import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTools, TOOLS, toolArgs } from '../src/tools.js';

const byName = (name: string) => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
};

describe('TOOLS', () => {
  it('has unique names prefixed with orca_', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((n) => expect(n).toMatch(/^orca_[a-z_]+$/));
  });

  it('does not expose worktree removal or terminal close', () => {
    const commands = TOOLS.map((t) => t.command.join(' '));
    expect(commands).not.toContain('worktree rm');
    expect(commands).not.toContain('terminal close');
  });

  it('flags every action tool as destructive so hosts can ask for confirmation', () => {
    TOOLS.forEach((t) => expect(t.destructive).toBe(!t.readOnly));
  });

  it('hides arbitrary commands unless exec is allowed', () => {
    const create = (allowExec: boolean) => createTools({ allowExec }).find((t) => t.name === 'orca_terminal_create')!;
    expect(create(false).input).not.toHaveProperty('command');
    expect(create(true).input).toHaveProperty('command');
    const worktree = z.object(byName('orca_worktree_create').input);
    expect(worktree.safeParse({ name: 'x', repo: 'r', setup: 'run' }).success).toBe(false);
    const worktreeExec = z.object(createTools({ allowExec: true }).find((t) => t.name === 'orca_worktree_create')!.input);
    expect(worktreeExec.safeParse({ name: 'x', repo: 'r', setup: 'run' }).success).toBe(true);
  });

  it('rejects unsafe branch names and agent ids', () => {
    const worktree = z.object(byName('orca_worktree_create').input);
    expect(worktree.safeParse({ name: '../escape', repo: 'r' }).success).toBe(false);
    expect(worktree.safeParse({ name: 'feat x', repo: 'r' }).success).toBe(false);
    expect(worktree.safeParse({ name: 'feat/ok-1', repo: 'r', agent: 'claude; rm' }).success).toBe(false);
    expect(worktree.safeParse({ name: 'feat/ok-1', repo: 'r', agent: 'claude' }).success).toBe(true);
  });

  it('gives slow actions a longer process timeout', () => {
    expect(byName('orca_agent_launch').timeoutMs).toBeGreaterThan(60_000);
    expect(byName('orca_worktree_create').timeoutMs).toBeGreaterThan(60_000);
  });

  it('marks read tools as read-only and action tools as not', () => {
    expect(byName('orca_worktree_list').readOnly).toBe(true);
    expect(byName('orca_agent_launch').readOnly).toBe(false);
    expect(byName('orca_terminal_send').readOnly).toBe(false);
  });

  it('requires a terminal handle for terminal reads and sends', () => {
    const schema = z.object(byName('orca_terminal_send').input);
    expect(schema.safeParse({ text: 'hi' }).success).toBe(false);
    expect(schema.safeParse({ terminal: 'term_1', text: 'hi', enter: true }).success).toBe(true);
  });

  it('requires a worktree for agent launch because the server has no Orca cwd', () => {
    const schema = z.object(byName('orca_agent_launch').input);
    expect(schema.safeParse({ agent: 'claude' }).success).toBe(false);
  });

  it('requires effort to come with a model, as the CLI does', () => {
    const schema = z.object(byName('orca_agent_launch').input);
    const tool = byName('orca_agent_launch');
    const parsed = schema.parse({ agent: 'claude', worktree: 'name:x', effort: 'high' });
    expect(() => toolArgs(tool, parsed)).toThrow(/effort requires model/i);
  });

  it('requires repo or project when creating a worktree', () => {
    const tool = byName('orca_worktree_create');
    const parsed = z.object(tool.input).parse({ name: 'feat-x' });
    expect(() => toolArgs(tool, parsed)).toThrow(/repo or project/i);
  });

  it('builds CLI args for agent launch', () => {
    const tool = byName('orca_agent_launch');
    const parsed = z.object(tool.input).parse({ agent: 'claude', worktree: 'name:feat-x', prompt: 'Fix the tests' });
    expect(toolArgs(tool, parsed)).toEqual([
      'agent',
      'launch',
      '--agent=claude',
      '--worktree=name:feat-x',
      '--prompt=Fix the tests',
      '--json',
    ]);
  });

  it('passes the automation id as a flag', () => {
    const tool = byName('orca_automation_run');
    const parsed = z.object(tool.input).parse({ id: 'auto_1' });
    expect(toolArgs(tool, parsed)).toEqual(['automations', 'run', '--id=auto_1', '--json']);
  });

  it('passes the search query as a flag so queries may start with a dash', () => {
    const tool = byName('orca_search');
    const parsed = z.object(tool.input).parse({ query: '-login bug', limit: 5 });
    expect(toolArgs(tool, parsed)).toEqual(['search', '--query=-login bug', '--limit=5', '--json']);
  });

  it('caps terminal wait timeout to keep tool calls bounded', () => {
    const schema = z.object(byName('orca_terminal_wait').input);
    expect(schema.safeParse({ terminal: 't', for: 'exit', timeoutMs: 10 * 60_000 }).success).toBe(false);
  });
});
