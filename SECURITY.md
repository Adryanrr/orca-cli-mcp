# Security

`orca-cli-mcp` gives AI agents control over Orca, which can run code on your machine. Read the [trust model](README.md#trust-model-read-this) before connecting it to an agent.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting ("Report a vulnerability" in the Security tab of this repository) with steps to reproduce. You can expect a first reply within a week.

In scope: argument or flag injection into the `orca` CLI, ways to reach commands the tools do not expose, bypasses of `ORCA_MCP_ALLOW_EXEC`, and leaks of data through errors.
