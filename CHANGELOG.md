# Changelog

## 0.1.0 — 2026-10-29

First public release.

- 18 tools over the official `orca` CLI: 11 read tools (status, repos, projects, worktrees, terminals, tasks, inbox, automations, search) and 7 actions (create worktree, launch agent, create/send terminal, run automation).
- `execFile` with no shell, `--flag=value` arguments, zod-validated inputs, minimal child environment.
- `destructiveHint` on every action; arbitrary commands gated behind `ORCA_MCP_ALLOW_EXEC=1`.
- Distinct `orca_timeout`, `orca_cancelled` and `orca_output_too_large` errors; bounded output and errors; request cancellation stops the child process.
