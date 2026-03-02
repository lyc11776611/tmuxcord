# channel-tmux

Discord ↔ tmux bridge bot with Claude Code interactivity support.

Control terminal sessions directly from Discord threads — type commands, see colored output, and interact with Claude Code's permission prompts via Discord buttons.

Discord ↔ tmux 桥接机器人，支持 Claude Code 交互。

在 Discord 线程中直接控制终端会话——输入命令、查看彩色输出，并通过 Discord 按钮与 Claude Code 的权限提示交互。

## Features / 功能

- **Thread-to-session binding** — Each Discord thread maps to one tmux session / 每个 Discord 线程绑定一个 tmux 会话
- **Colored terminal output** — ANSI colors rendered in Discord via `ansi` code blocks / 终端彩色输出通过 `ansi` 代码块渲染
- **Smart diff polling** — Only new output is shown, no duplication / 智能差异轮询，只显示新输出
- **Claude Code support** — Permission prompts and choice dialogs become Discord buttons / Claude Code 权限提示和选择对话框变为 Discord 按钮
- **User allowlist** — Only authorized Discord users can interact / 用户白名单授权
- **24h idle cleanup** — Inactive sessions auto-close / 24小时空闲自动清理
- **Audit logging** — All actions logged to JSONL / 所有操作记录到 JSONL 日志

## Commands / 命令

| Command | Description | 说明 |
|---------|-------------|------|
| `/new` | Create a terminal session in this thread | 在当前线程创建终端会话 |
| `/claude [dir]` | Launch Claude Code (optionally in a directory) | 启动 Claude Code（可指定目录） |
| `/status` | Show session info and idle time | 显示会话信息和空闲时间 |
| `/ctrlc` | Send Ctrl+C | 发送 Ctrl+C |
| `/ctrlcc` | Send Ctrl+C twice (exit Claude Code) | 发送两次 Ctrl+C（退出 Claude Code） |
| `/close` | Kill session and remove binding | 关闭会话并移除绑定 |

Any non-slash message in a bound thread is sent to the terminal as input.

在绑定的线程中发送的任何非斜杠消息都会作为终端输入发送。

## Setup / 安装

### Prerequisites / 前置要求

- Node.js >= 22
- pnpm
- tmux

### Installation / 安装步骤

```bash
git clone https://github.com/yanshroom/channel-tmux.git
cd channel-tmux
pnpm install
```

### Configuration / 配置

Create a `.env` file:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-app-id
DISCORD_GUILD_ID=your-server-id
```

Edit `src/auth/allowlist.ts` to add authorized Discord user IDs.

编辑 `src/auth/allowlist.ts` 添加授权的 Discord 用户 ID。

### Deploy commands / 部署命令

```bash
npx tsx src/deploy-commands.ts
```

### Run / 运行

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

### Discord Bot Permissions / 机器人权限

Required permissions / 需要的权限:
- Send Messages
- Send Messages in Threads
- Read Message History
- Use Slash Commands

Invite URL template / 邀请链接模板:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=326417525760
```

## Architecture / 架构

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

## Tech Stack / 技术栈

- TypeScript, Node.js 22
- discord.js v14
- tmux CLI (`capture-pane`, `send-keys`, `new-session`, `kill-session`)
- Vitest for testing
- pnpm

## License

[MIT](LICENSE)
