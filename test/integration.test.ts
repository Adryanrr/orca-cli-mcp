import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callTool } from '../src/handler.js';
import { createOrcaRunner, nodeExec } from '../src/runner.js';
import { TOOLS } from '../src/tools.js';

/** A fake orca binary: echoes its argv back inside an Orca-style envelope. */
const fakeOrca = (body: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'fake-orca-'));
  const bin = join(dir, 'orca');
  writeFileSync(bin, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(bin, 0o755);
  return bin;
};

const echoBin = fakeOrca(
  `const args = process.argv.slice(2);
   if (args[0] === 'fail') { console.log(JSON.stringify({ ok: false, error: { code: 'bad', message: 'nope' } })); process.exit(1); }
   if (args[0] === 'sleep') { setTimeout(() => {}, 10000); }
   else console.log(JSON.stringify({ ok: true, result: { args } }));`,
);

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

describe('nodeExec + runner against a real process', () => {
  const run = createOrcaRunner({ bin: echoBin, timeoutMs: 5000, exec: nodeExec });

  it('passes argv without a shell, keeping quotes and dashes literal', async () => {
    const result = await callTool(tool('orca_terminal_send'), { terminal: 'term_1', text: `"; rm -rf ~ #`, enter: true }, run);
    expect(JSON.parse(result.content[0].text)).toEqual({
      args: ['terminal', 'send', '--terminal=term_1', '--text="; rm -rf ~ #', '--enter', '--json'],
    });
  });

  it('reads JSON errors printed with a non-zero exit code', async () => {
    await expect(run(['fail'])).rejects.toMatchObject({ code: 'bad' });
  });

  it('reports a missing binary as orca_unavailable', async () => {
    const missing = createOrcaRunner({ bin: '/nonexistent/orca', timeoutMs: 1000, exec: nodeExec });
    await expect(missing(['status'])).rejects.toMatchObject({ code: 'orca_unavailable' });
  });

  it('kills a hung process at the timeout and reports outcome unknown', async () => {
    await expect(run(['sleep'], { timeoutMs: 300 })).rejects.toMatchObject({ code: 'orca_timeout' });
  });

  it('stops the process when the request is cancelled', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    await expect(run(['sleep'], { timeoutMs: 5000, signal: controller.signal })).rejects.toMatchObject({ code: 'orca_cancelled' });
  });

  it('does not leak the argv in error messages', async () => {
    const error = await run(['sleep', '--text=SECRET_PROMPT'], { timeoutMs: 300 }).catch((e: Error) => e);
    expect((error as Error).message).not.toContain('SECRET_PROMPT');
  });
});

describe('tool validation rules', () => {
  const noRun = async () => {
    throw new Error('should not run');
  };

  it('rejects screen together with cursor on terminal read', async () => {
    const result = await callTool(tool('orca_terminal_read'), { terminal: 't', screen: true, cursor: 3 }, noRun);
    expect(result.content[0].text).toMatch(/mutually exclusive/);
  });

  it('rejects an empty terminal send', async () => {
    const result = await callTool(tool('orca_terminal_send'), { terminal: 't' }, noRun);
    expect(result.content[0].text).toMatch(/text, enter or interrupt/);
  });

  it('rejects unknown input keys', async () => {
    const result = await callTool(tool('orca_status'), { shell: 'rm -rf /' }, noRun);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid input/);
  });
});
