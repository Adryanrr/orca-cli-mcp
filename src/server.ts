#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { callTool, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from './handler.js';
import { createOrcaRunner } from './runner.js';
import { createTools } from './tools.js';

const ORCA_BIN_CANDIDATES = ['/usr/local/bin/orca', '/Applications/Orca.app/Contents/Resources/bin/orca'];

const resolveOrcaBin = (): string =>
  process.env.ORCA_BIN || ORCA_BIN_CANDIDATES.find((candidate) => existsSync(candidate)) || 'orca';

const resolveTimeout = (): number => {
  const parsed = Number(process.env.ORCA_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
};

async function main(): Promise<void> {
  const bin = resolveOrcaBin();
  const timeoutMs = resolveTimeout();
  const allowExec = process.env.ORCA_MCP_ALLOW_EXEC === '1';
  const run = createOrcaRunner({ bin, timeoutMs });
  const server = new McpServer({ name: 'orca', version: '0.1.0' });

  for (const tool of createTools({ allowExec })) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.readOnly,
          destructiveHint: tool.destructive,
          idempotentHint: tool.readOnly,
          openWorldHint: false,
        },
      },
      (input: unknown, extra: { signal: AbortSignal }) => callTool(tool, input, run, timeoutMs, extra.signal),
    );
  }

  await server.connect(new StdioServerTransport());
  console.error(`orca-cli-mcp ready: orca=${bin} timeout=${timeoutMs}ms allowExec=${allowExec}`);
}

main().catch((error: unknown) => {
  console.error('orca-cli-mcp failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
