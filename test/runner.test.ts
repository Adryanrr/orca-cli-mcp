import { describe, expect, it, vi } from 'vitest';
import { createOrcaRunner, ExecFailure, OrcaCliError, type ExecFn } from '../src/runner.js';

const okExec = (stdout: string): ExecFn => vi.fn(async () => ({ stdout, stderr: '', exitCode: 0 }));

describe('createOrcaRunner', () => {
  it('returns the result field of a successful envelope', async () => {
    const exec = okExec(JSON.stringify({ id: 'x', ok: true, result: { repos: [] } }));
    const run = createOrcaRunner({ bin: '/bin/orca', timeoutMs: 1000, exec });
    await expect(run(['repo', 'list', '--json'])).resolves.toEqual({ repos: [] });
    expect(exec).toHaveBeenCalledWith('/bin/orca', ['repo', 'list', '--json'], { timeoutMs: 1000, signal: undefined });
  });

  it('throws OrcaCliError with code and next steps when ok is false', async () => {
    const envelope = {
      ok: false,
      error: { code: 'selector_not_found', message: 'selector_not_found', data: { nextSteps: ['List worktrees first.'] } },
    };
    const exec: ExecFn = async () => ({ stdout: JSON.stringify(envelope), stderr: '', exitCode: 1 });
    const run = createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec });
    const error = await run(['worktree', 'show']).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrcaCliError);
    expect(error).toMatchObject({ code: 'selector_not_found', nextSteps: ['List worktrees first.'] });
  });

  it('throws a readable error when stdout is not JSON', async () => {
    const exec: ExecFn = async () => ({ stdout: 'boom', stderr: 'Orca runtime not reachable', exitCode: 1 });
    const run = createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec });
    await expect(run(['status', '--json'])).rejects.toThrow(/Orca runtime not reachable/);
  });

  it('wraps spawn failures such as a missing binary', async () => {
    const exec: ExecFn = async () => {
      throw Object.assign(new Error('spawn orca ENOENT'), { code: 'ENOENT' });
    };
    const run = createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec });
    await expect(run(['status', '--json'])).rejects.toMatchObject({ code: 'orca_unavailable' });
  });

  it('reports a timeout as outcome unknown, not as a missing binary', async () => {
    const exec: ExecFn = async () => {
      throw new ExecFailure('timeout', 'killed with SIGTERM');
    };
    const run = createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec });
    await expect(run(['agent', 'launch'])).rejects.toMatchObject({ code: 'orca_timeout' });
  });

  it('reports oversized output with its own code', async () => {
    const exec: ExecFn = async () => {
      throw new ExecFailure('output_too_large', 'output exceeded 16 MB');
    };
    const run = createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec });
    await expect(run(['terminal', 'read'])).rejects.toMatchObject({ code: 'orca_output_too_large' });
  });

  it('treats JSON without a boolean ok field as unexpected output', async () => {
    const run = createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec: okExec('[1,2]') });
    await expect(run(['status'])).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('forwards a per-call timeout and abort signal', async () => {
    const exec = okExec(JSON.stringify({ ok: true, result: null }));
    const signal = new AbortController().signal;
    await createOrcaRunner({ bin: 'orca', timeoutMs: 1000, exec })(['status'], { timeoutMs: 5000, signal });
    expect(exec).toHaveBeenCalledWith('orca', ['status'], { timeoutMs: 5000, signal });
  });
});
