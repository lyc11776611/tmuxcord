# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm build` — compile TypeScript to `dist/`
- `pnpm dev` — run with tsx watch (hot reload)
- `pnpm test` — run all vitest tests once
- `pnpm test:watch` — vitest in watch mode
- `pnpm test -- src/tmux/output.test.ts` — run a single test file
- `pnpm deploy-commands` — register slash commands with Discord

## Architecture

Discord ↔ tmux bridge: users interact with terminal sessions through Discord threads.

```
Discord interaction → handlers.ts → SessionStore (data/sessions.json)
                                   → TmuxSession (execFile to tmux CLI)
                                   → OutputPoller (capture-pane polling + diff)
                                   → detectMode() → Discord buttons or text
```

**Module responsibilities:**

- `src/index.ts` — Bot startup, stale session reconciliation, 10-min idle cleanup interval
- `src/bot/handlers.ts` — All Discord interaction handling (~700 lines). Creates pollers, manages scroll state, builds button rows. This is the main orchestration file.
- `src/bot/commands.ts` — Slash command definitions (8 commands)
- `src/tmux/session.ts` — Thin wrapper over tmux CLI. `sendKeys` (literal + Enter), `sendRaw` (raw key codes), `capturePane`/`capturePaneAnsi`/`capturePaneFull`
- `src/tmux/output.ts` — `OutputPoller` tracks baseline screen content, `diff()` uses suffix-prefix matching to return only new lines. Detects and ignores spinner/cursor redraws.
- `src/detection/mode.ts` — Regex-based detection of 5 terminal states: shell, claude, permission, choice, processing. Permission/choice modes trigger Discord buttons.
- `src/store/json-store.ts` — `SessionStore` persists thread↔tmux bindings to JSON file with in-memory cache
- `src/auth/allowlist.ts` — Hardcoded Discord user IDs, `isAllowed()` check
- `src/utils/logger.ts` — Append-only JSONL audit log to `logs/audit.jsonl`

## Key Constraints

- **Must `unset CLAUDECODE`** before launching Claude Code in tmux sessions (env var inheritance breaks CC)
- **All subprocess calls use `execFile`** (not `exec`) with argument arrays to prevent shell injection
- **Two capture modes**: plain text (for diff logic and mode detection) and ANSI (for Discord display). Never mix them.
- **Polling cycle**: 300ms interval, 30s max, stops after 3 consecutive identical captures
- **Discord limits**: messages capped at 1800 chars, 5 buttons per row, button labels truncated to 77 chars
- **Buttons use `sendRaw`** (no Enter appended), regular messages use `sendKeys` (literal flag + Enter)
