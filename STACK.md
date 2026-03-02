# channel-tmux Stack (v1)

## Runtime
- **Language:** TypeScript (Node.js 22 LTS)
- **Process model:** Single long-running bot process (systemd)
- **Package manager:** pnpm

## Discord Layer
- **Library:** discord.js v14
- **Mode:** Gateway events + slash commands
- **Scope:** Only operate inside allowlisted thread/channel IDs

## Terminal Layer
- **Session backend:** tmux (one session per Discord thread)
- **Control:** `tmux new-session`, `send-keys`, `capture-pane`, `kill-session`
- **Output strategy:** Incremental pane capture + chunked reply to Discord

## State & Persistence
- **Store (v1):** local JSON file (`data/sessions.json`)
- **Mapping:** `threadId -> tmuxSessionName`
- **Metadata:** owner, cwd, lastActivityAt, createdAt

## Security (v1 mandatory)
- **User allowlist:**
  - `883495629970636860` (yanshroom)
  - `1424947766060126313` (luckyQuqi)
- **Thread/session isolation:** strict `1 thread <-> 1 tmux session`
- **Idle cleanup:** auto close after 24h inactivity
- **Filesystem scope:** fixed workspace root (configurable, default `~/aigneous_millionwhys`)

## Commands (v1)
- `/new` create session for current thread
- `/status` show binding + idle time
- `/ctrlc` send Ctrl+C to bound session
- `/close` close bound session
- Non-slash text => sent as terminal input + Enter

## Deployment
- **Host:** existing OpenClaw host
- **Service:** systemd unit (`channel-tmux.service`)
- **Logs:** journalctl + local structured audit log (`logs/audit.jsonl`)

## Future (v2+)
- DB persistence (SQLite/Postgres)
- Multi-pane / file upload bridge
- Better terminal diffing/stream protocol
- Optional command policy engine
