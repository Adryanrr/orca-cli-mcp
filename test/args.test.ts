import { describe, expect, it } from 'vitest';
import { buildArgs } from '../src/args.js';

describe('buildArgs', () => {
  it('appends --json after the command path', () => {
    expect(buildArgs(['repo', 'list'], {})).toEqual(['repo', 'list', '--json']);
  });

  it('renders values as --kebab=value so values starting with a dash stay values', () => {
    expect(buildArgs(['terminal', 'send'], { terminal: 'term_1', text: '--rm -rf' })).toEqual([
      'terminal',
      'send',
      '--terminal=term_1',
      '--text=--rm -rf',
      '--json',
    ]);
  });

  it('converts camelCase keys to kebab-case flags', () => {
    expect(buildArgs(['terminal', 'wait'], { timeoutMs: 5000 })).toEqual([
      'terminal',
      'wait',
      '--timeout-ms=5000',
      '--json',
    ]);
  });

  it('renders true as a bare flag and drops false and undefined', () => {
    expect(buildArgs(['terminal', 'send'], { enter: true, interrupt: false, text: undefined })).toEqual([
      'terminal',
      'send',
      '--enter',
      '--json',
    ]);
  });

  it('rejects values containing NUL bytes', () => {
    expect(() => buildArgs(['terminal', 'send'], { text: 'a\u0000b' })).toThrow(/NUL/);
  });

  it('does not mutate the input objects', () => {
    const flags = Object.freeze({ limit: 5 });
    const command = Object.freeze(['worktree', 'list']);
    expect(buildArgs(command, flags)).toEqual(['worktree', 'list', '--limit=5', '--json']);
  });
});
