import { execFile, type ExecException } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export type ExecFn = (bin: string, args: string[], options: ExecOptions) => Promise<ExecResult>;

export type OrcaRunner = (args: string[], options?: Partial<ExecOptions>) => Promise<unknown>;

export class OrcaCliError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly nextSteps: readonly string[] = [],
  ) {
    super(message);
    this.name = 'OrcaCliError';
  }
}

/** Raised by nodeExec when the process could not finish; never carries argv in its message. */
export class ExecFailure extends Error {
  constructor(readonly kind: 'timeout' | 'aborted' | 'output_too_large' | 'spawn', detail: string) {
    super(detail);
    this.name = 'ExecFailure';
  }
}

const MAX_BUFFER = 16 * 1024 * 1024;
const SNIPPET = 500;
const ENV_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL'];

const childEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(ENV_ALLOWLIST.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));

const classify = (error: ExecException): ExecFailure | undefined => {
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return new ExecFailure('aborted', 'request cancelled');
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return new ExecFailure('output_too_large', 'output exceeded 16 MB');
  if (error.killed) return new ExecFailure('timeout', `killed with ${error.signal ?? 'signal'}`);
  if (typeof error.code === 'string') return new ExecFailure('spawn', error.code);
  return undefined;
};

/** Runs a binary without a shell; resolves on non-zero exit because orca prints JSON errors to stdout. */
export const nodeExec: ExecFn = (bin, args, { timeoutMs, signal }) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8', env: childEnv(), signal },
      (error, stdout, stderr) => {
        const failure = error ? classify(error) : undefined;
        if (failure) {
          reject(failure);
          return;
        }
        const exitCode = typeof error?.code === 'number' ? error.code : error ? -1 : 0;
        resolve({ stdout, stderr, exitCode });
      },
    );
    child.stdin?.end();
  });

const parseEnvelope = (stdout: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const isEnvelope =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && typeof (parsed as { ok?: unknown }).ok === 'boolean';
    return isEnvelope ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const toCliError = (error: unknown): OrcaCliError => {
  const err = (error ?? {}) as { code?: unknown; data?: { nextSteps?: unknown }; message?: unknown };
  const nextSteps = Array.isArray(err.data?.nextSteps) ? err.data.nextSteps.map(String) : [];
  const code = typeof err.code === 'string' ? err.code : 'orca_error';
  const message = typeof err.message === 'string' ? err.message : code;
  return new OrcaCliError(message, code, nextSteps);
};

const failureToCliError = (failure: unknown, bin: string): OrcaCliError => {
  const kind = failure instanceof ExecFailure ? failure.kind : 'spawn';
  switch (kind) {
    case 'timeout':
      return new OrcaCliError('The orca command timed out; its outcome is unknown.', 'orca_timeout', [
        'Check the current state (orca_worktree_list, orca_terminal_list) before retrying, to avoid duplicates.',
      ]);
    case 'aborted':
      return new OrcaCliError('The request was cancelled; its outcome is unknown.', 'orca_cancelled');
    case 'output_too_large':
      return new OrcaCliError('orca output was too large.', 'orca_output_too_large', ['Narrow the request with limit or cursor.']);
    default:
      return new OrcaCliError(`Could not start the orca CLI (${bin}).`, 'orca_unavailable', [
        'Check that Orca is installed and that ORCA_BIN points to the orca CLI.',
      ]);
  }
};

export function createOrcaRunner(options: { bin: string; timeoutMs: number; exec?: ExecFn }): OrcaRunner {
  const exec = options.exec ?? nodeExec;

  return async (args, callOptions = {}) => {
    let output: ExecResult;
    try {
      output = await exec(options.bin, args, { timeoutMs: callOptions.timeoutMs ?? options.timeoutMs, signal: callOptions.signal });
    } catch (failure) {
      throw failureToCliError(failure, options.bin);
    }

    const envelope = parseEnvelope(output.stdout);
    if (!envelope) {
      const detail = (output.stderr || output.stdout).trim().slice(0, SNIPPET);
      throw new OrcaCliError(`orca returned unexpected output (exit ${output.exitCode}): ${detail}`, 'invalid_output');
    }
    if (envelope.ok !== true) throw toCliError(envelope.error);
    return envelope.result;
  };
}
