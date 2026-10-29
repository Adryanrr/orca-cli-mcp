import { describe, expect, it, vi } from 'vitest';
import { callTool, callTimeoutMs, MAX_OUTPUT_CHARS } from '../src/handler.js';
import { OrcaCliError } from '../src/runner.js';
import { TOOLS } from '../src/tools.js';

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

describe('callTool', () => {
  it('runs the CLI and returns compacted JSON text', async () => {
    const run = vi.fn(async () => ({ repos: [{ id: 'r1', displayName: 'app', path: '/w/app', kind: 'git', badgeColor: '#fff' }] }));
    const result = await callTool(tool('orca_repo_list'), {}, run);
    expect(run).toHaveBeenCalledWith(['repo', 'list', '--json'], { timeoutMs: 60_000, signal: undefined });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ repos: [{ id: 'r1', name: 'app', path: '/w/app', kind: 'git' }] });
  });

  it('returns Orca errors with their next steps as tool errors', async () => {
    const run = vi.fn(async () => {
      throw new OrcaCliError('selector_not_found', 'selector_not_found', ['List worktrees first.']);
    });
    const result = await callTool(tool('orca_worktree_show'), { worktree: 'name:x' }, run);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('selector_not_found');
    expect(result.content[0].text).toContain('List worktrees first.');
  });

  it('returns validation failures as tool errors without running the CLI', async () => {
    const run = vi.fn();
    const result = await callTool(tool('orca_worktree_create'), { name: 'x' }, run);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/repo or project/i);
    expect(run).not.toHaveBeenCalled();
  });

  it('bounds error output', async () => {
    const run = vi.fn(async () => {
      throw new OrcaCliError('x'.repeat(50_000), 'boom');
    });
    const result = await callTool(tool('orca_status'), {}, run);
    expect(result.isError).toBe(true);
    expect(result.content[0].text.length).toBeLessThan(5_000);
  });

  it('truncates very large output', async () => {
    const run = vi.fn(async () => ({ blob: 'x'.repeat(MAX_OUTPUT_CHARS * 2) }));
    const result = await callTool(tool('orca_status'), {}, run);
    expect(result.content[0].text.length).toBeLessThan(MAX_OUTPUT_CHARS + 200);
    expect(result.content[0].text).toContain('truncated');
  });
});

describe('callTimeoutMs', () => {
  it('gives waits their own timeout plus a margin', () => {
    expect(callTimeoutMs(tool('orca_terminal_wait'), { timeoutMs: 45_000 }, 60_000)).toBe(60_000);
  });

  it('uses the tool override for slow actions', () => {
    expect(callTimeoutMs(tool('orca_agent_launch'), {}, 60_000)).toBe(180_000);
  });

  it('uses the default for other tools', () => {
    expect(callTimeoutMs(tool('orca_status'), {}, 60_000)).toBe(60_000);
  });
});
