# Design: channel-tmux (Discord ↔ tmux Bridge with Claude Code Support)

## 1. Architecture

Single Node.js process. All terminal interaction through tmux `send-keys` / `capture-pane`.

```
Discord Thread  ←→  Bot (Node.js)  ←→  tmux session
     │                    │                   │
  messages/buttons   OutputParser         capture-pane
  slash commands     ModeDetector         send-keys
                     SessionManager       kill-session
```

## 2. Core Components

### 2.1 SessionManager
- Maps `threadId → tmuxSessionName`
- Persists to `data/sessions.json`
- Handles create/close/reconcile on restart
- Tracks `lastActivityAt` for idle cleanup

### 2.2 InputBridge
- Non-slash Discord messages → `tmux send-keys <session> '<text>' Enter`
- Discord button clicks → `tmux send-keys <session> '<key>'` (for `y`/`n`/number)

### 2.3 OutputBridge
- Polls `tmux capture-pane -t <session> -p` at 200ms intervals
- Strips ANSI escape sequences
- Diffs against last captured content to find new output
- Posts/edits Discord messages with new content
- Stability detection: 3 consecutive identical captures → output complete

### 2.4 ModeDetector
Parses capture-pane content to detect current state:

| Signal | Detection |
|--------|-----------|
| Shell prompt | `$` or `#` at line start/after user@host |
| Claude Code active | `❯` prompt character or `Claude Code` header box |
| Permission prompt | Lines containing `Allow`, `Deny`, `Yes/No` patterns |
| Choice list | Numbered options (`1.`, `2.`, `3.`) in Claude Code context |
| Processing | Spinner/activity indicators, no prompt visible |

### 2.5 InteractionRelay
When ModeDetector finds prompts/choices:
1. Parse the options from captured text
2. Create Discord message with `ButtonBuilder` components
3. On button interaction → `send-keys` corresponding key to tmux
4. Timeout after 5 minutes → send notification

## 3. Discord Commands

| Command | Action |
|---------|--------|
| `/new` | Create tmux session bound to thread |
| `/status` | Show session info, idle time, current program |
| `/ctrlc` | `send-keys -t <session> C-c` |
| `/close` | `kill-session -t <session>`, remove binding |
| `/claude [dir]` | Run `cd <dir> && unset CLAUDECODE && claude` in session |
| Non-slash text | Forward as terminal input |

## 4. Output Display Strategy

```
Input received → start polling (200ms)
  → new output detected?
    → yes: edit same Discord message (last 1800 chars + header)
    → no: 3x stable → send final message, stop polling
  → > 30s elapsed? → post current + "still running..." marker
  → permission/choice detected? → generate buttons, pause text updates
```

Discord message format:
```
📟 Terminal Output
```
<output here, truncated to 1800 chars>
```
⏳ Running... | 🔲 Waiting for input
```

## 5. Security

- User allowlist: hardcoded Discord user IDs
- All commands + input bridge check allowlist before execution
- One thread ↔ one session, strict isolation
- `unset CLAUDECODE` required before launching Claude Code in tmux
- Bot token stored in `.env`, never committed

## 6. Data Model

```ts
interface SessionBinding {
  threadId: string;
  tmuxSession: string;
  ownerUserId: string;
  cwd: string;
  createdAt: number;
  lastActivityAt: number;
  lastCaptureHash: string; // for diff detection
}
```

## 7. Idle Cleanup

- Cron-style interval check every 10 minutes
- If `Date.now() - lastActivityAt > 24h` → kill session + notify thread + remove binding

## 8. Restart Recovery

On startup:
1. Load `data/sessions.json`
2. Run `tmux list-sessions` to get actual sessions
3. Remove bindings for sessions that no longer exist
4. Resume polling for sessions that still exist

## 9. Key Technical Notes

- `tmux capture-pane -p` (no `-e`) gives clean text without escape codes
- Claude Code sets `CLAUDECODE` env var → must unset before nested launch
- Claude Code uses alternate screen → capture gets current viewport only
- Discord message edit rate limit: ~5 edits per 5 seconds per message
- Chunk long output: split at 1800 chars to leave room for formatting

## 10. Project Structure

```
channel-tmux/
├── src/
│   ├── index.ts              # Entry point, bot setup
│   ├── bot/
│   │   ├── commands.ts       # Slash command definitions
│   │   └── handlers.ts       # Command + message handlers
│   ├── tmux/
│   │   ├── session.ts        # SessionManager
│   │   ├── input.ts          # InputBridge (send-keys)
│   │   └── output.ts         # OutputBridge (capture-pane + polling)
│   ├── detection/
│   │   └── mode.ts           # ModeDetector
│   ├── discord/
│   │   └── interaction.ts    # InteractionRelay (buttons)
│   ├── store/
│   │   └── json-store.ts     # JSON file persistence
│   ├── auth/
│   │   └── allowlist.ts      # User allowlist check
│   └── utils/
│       ├── ansi.ts           # ANSI stripping
│       └── logger.ts         # Structured audit logging
├── data/                     # Runtime data (gitignored)
├── logs/                     # Audit logs (gitignored)
├── docs/
│   └── plans/
├── .env                      # Discord token (gitignored)
├── package.json
├── tsconfig.json
└── CLAUDE.md
```
