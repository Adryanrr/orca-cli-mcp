// Smoke test: starts the built server over stdio and calls read-only tools against the real Orca.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'] }));
const { tools } = await client.listTools();
console.log(`tools (${tools.length}):`, tools.map((t) => t.name).join(', '));
for (const [name, args] of [['orca_status', {}], ['orca_repo_list', {}], ['orca_worktree_list', { limit: 3 }], ['orca_terminal_list', { limit: 3 }], ['orca_worktree_show', { worktree: 'name:nao-existe' }]]) {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n## ${name} ${res.isError ? '(error)' : ''}\n${res.content[0].text.slice(0, 500)}`);
}
await client.close();
