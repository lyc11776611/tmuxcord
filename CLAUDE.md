# channel-tmux

Discord <-> tmux bridge bot with Claude Code interactivity.

## Commands
- `pnpm build` - compile TypeScript
- `pnpm dev` - run with tsx watch
- `pnpm test` - run vitest
- `pnpm deploy-commands` - register slash commands with Discord

## Architecture
- All terminal I/O through tmux CLI (send-keys / capture-pane)
- State persisted to data/sessions.json
- Allowlisted users only (IDs in src/auth/allowlist.ts)
- All subprocess calls use execFile (not exec) to prevent injection

## Key Constraint
- Must `unset CLAUDECODE` before launching Claude Code in tmux sessions
