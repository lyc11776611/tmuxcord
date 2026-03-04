# channel-tmux

Discord ↔ tmux bridge bot with Claude Code interactivity support.

Control terminal sessions directly from Discord threads — type commands, see colored output, and interact with Claude Code's permission prompts via Discord buttons.

## Why this exists

This project comes from our daily workflow at [MillionWhys](https://millionwhys.com), not a theoretical idea.

### Pain points we validated ourselves

1. **Discord is already our work hub**
   We already coordinate tasks in Discord threads. Switching to SSH/VNC/mobile terminal apps breaks flow and context.

2. **Need to continue Claude Code jobs away from desk**
   Long-running coding tasks often need quick approvals, interrupts, and follow-ups from phone.

3. **Per-thread isolation is mandatory for team sanity**
   We need strict `1 thread ↔ 1 tmux session` mapping so contexts don't mix across tasks.

4. **We need explicit lifecycle control**
   Sessions should not stay alive forever. 24h idle auto-close keeps things safe and clean.

5. **Claude Code interactivity should be native in chat**
   Permission/choice prompts should be handled in Discord directly instead of "go back to terminal" loops.

If your workflow has the same constraints, this project may fit you.

## Features

- **Thread-to-session binding** — Each Discord thread maps to one tmux session
- **Colored terminal output** — ANSI colors rendered in Discord via `ansi` code blocks
- **Smart diff polling** — Only new output is shown, no duplication
- **Claude Code support** — Permission prompts and choice dialogs become Discord buttons
- **User allowlist** — Only authorized Discord users can interact
- **24h idle cleanup** — Inactive sessions auto-close
- **Audit logging** — All actions logged to JSONL

## Commands

| Command | Description |
|---------|-------------|
| `/new` | Create a terminal session in this thread |
| `/claude [dir]` | Launch Claude Code (optionally in a directory) |
| `/status` | Show session info and idle time |
| `/ctrlc` | Send Ctrl+C |
| `/peek` | Show current terminal screen and restart polling |
| `/ctrlcc` | Send Ctrl+C twice (exit Claude Code) |
| `/close` | Kill session and remove binding |

Any non-slash message in a bound thread is sent to the terminal as input.

## Setup

### Prerequisites

- Node.js >= 22
- pnpm
- tmux

### Installation

```bash
git clone https://github.com/lyc11776611/tmuxcord.git
cd tmuxcord
pnpm install
```

### Configuration

Create a `.env` file:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-app-id
DISCORD_GUILD_ID=your-server-id
```

Edit `src/auth/allowlist.ts` to add authorized Discord user IDs.

### Deploy commands

```bash
npx tsx src/deploy-commands.ts
```

### Run

```bash
# Start
./bot.sh start

# Restart (kills all old instances cleanly)
./bot.sh restart

# Stop
./bot.sh stop

# Check status
./bot.sh status
```

### Discord Bot Permissions

Required permissions:
- Send Messages
- Send Messages in Threads
- Read Message History
- Use Slash Commands

Invite URL template:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=326417525760
```

## Architecture

```
Discord thread ←→ Bot (discord.js) ←→ tmux session
     ↑                    ↑                  ↑
  user input      poll + diff + detect    capture-pane
  button press    mode detection          send-keys
```

- **Input**: Discord messages → `tmux send-keys -l` (literal) + `Enter`
- **Output**: `tmux capture-pane -p` (plain, for diff) + `-e` (ANSI, for display)
- **Detection**: Regex-based mode detection (shell / claude / permission / choice / processing)
- **Buttons**: Permission prompts (Allow/Deny) and numbered choices become Discord buttons

## Tech Stack

- TypeScript, Node.js 22
- discord.js v14
- tmux CLI (`capture-pane`, `send-keys`, `new-session`, `kill-session`)
- Vitest for testing
- pnpm

## License

[MIT](LICENSE)
