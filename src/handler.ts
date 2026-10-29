import { z } from 'zod';
import type { FlagValue } from './args.js';
import { OrcaCliError, type OrcaRunner } from './runner.js';
import { toolArgs, type ToolSpec } from './tools.js';

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TIMEOUT_MS = 600_000;
export const MAX_OUTPUT_CHARS = 60_000;
const MAX_ERROR_CHARS = 4_000;
const WAIT_MARGIN_MS = 15_000;

export interface TextResult {
  [key: string]: unknown;
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
}

const text = (value: string, isError = false): TextResult => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
});

const truncate = (value: string, max: number): string =>
  value.length <= max
    ? value
    : `${value.slice(0, max)}\n…[truncated ${value.length - max} chars; narrow the request with limit or cursor]`;

const describeError = (error: unknown): string => {
  if (error instanceof OrcaCliError) {
    const steps = error.nextSteps.length ? `\nNext steps:\n- ${error.nextSteps.join('\n- ')}` : '';
    return `Orca error [${error.code}]: ${error.message}${steps}`;
  }
  if (error instanceof z.ZodError) {
    return `Invalid input: ${error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`;
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
};

/** Picks the process timeout: tool override, a wait's own timeout plus a margin, or the default. */
export const callTimeoutMs = (tool: ToolSpec, input: Record<string, FlagValue>, defaultMs: number): number => {
  if (tool.timeoutMs !== undefined) return Math.max(tool.timeoutMs, defaultMs);
  return typeof input.timeoutMs === 'number' ? input.timeoutMs + WAIT_MARGIN_MS : defaultMs;
};

export async function callTool(
  tool: ToolSpec,
  rawInput: unknown,
  run: OrcaRunner,
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<TextResult> {
  try {
    const input = z.object(tool.input).strict().parse(rawInput ?? {}) as Record<string, FlagValue>;
    const args = toolArgs(tool, input);
    const result = await run(args, { timeoutMs: callTimeoutMs(tool, input, defaultTimeoutMs), signal });
    const shaped = tool.compact ? tool.compact(result) : result;
    return text(truncate(JSON.stringify(shaped ?? null), MAX_OUTPUT_CHARS));
  } catch (error) {
    return text(truncate(describeError(error), MAX_ERROR_CHARS), true);
  }
}
