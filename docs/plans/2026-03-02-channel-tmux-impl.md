# channel-tmux Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Discord bot that bridges Discord threads to tmux sessions, with intelligent Claude Code interactivity (permission buttons, streaming output updates).

**Architecture:** Single Node.js process using discord.js v14 for Discord gateway + slash commands. All terminal I/O through tmux CLI (`send-keys`, `capture-pane`, `kill-session`). Output polling with diff detection and Discord message editing for streaming updates. Mode detection parses pane text to identify Claude Code permission prompts and generate Discord buttons.

**Tech Stack:** TypeScript, Node.js 22, discord.js v14, pnpm, tmux 3.2a, vitest for tests.

**Security Note:** All subprocess calls MUST use `execFile` (not `exec`) to prevent shell injection. Arguments passed as arrays.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/index.ts`
- Create: `CLAUDE.md`

**Step 1: Initialize pnpm project and install dependencies**

```bash
cd /home/ubuntu/channel-tmux
pnpm init
pnpm add discord.js dotenv
pnpm add -D typescript @types/node vitest
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
data/
logs/
.env
```

**Step 4: Create .env.example**

```
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
DISCORD_GUILD_ID=your-guild-id-here
WORKSPACE_ROOT=/home/ubuntu/aigneous_millionwhys
```

**Step 5: Create minimal src/index.ts**

```ts
import { Client, GatewayIntentBits } from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
```

**Step 6: Create CLAUDE.md**

```markdown
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
```

**Step 7: Add scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "npx tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy-commands": "npx tsx src/deploy-commands.ts"
  }
}
```

**Step 8: Verify build**

```bash
pnpm build
```
Expected: compiles without errors, creates `dist/index.js`.

**Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .gitignore .env.example src/index.ts CLAUDE.md
git commit -m "feat: project scaffold with discord.js, typescript, pnpm"
```

---

### Task 2: Auth — User Allowlist

**Files:**
- Create: `src/auth/allowlist.ts`
- Create: `src/auth/allowlist.test.ts`

**Step 1: Write the failing test**

```ts
// src/auth/allowlist.test.ts
import { describe, it, expect } from "vitest";
import { isAllowed } from "./allowlist.js";

describe("isAllowed", () => {
  it("allows yanshroom", () => {
    expect(isAllowed("883495629970636860")).toBe(true);
  });

  it("allows luckyQuqi", () => {
    expect(isAllowed("1424947766060126313")).toBe(true);
  });

  it("blocks unknown user", () => {
    expect(isAllowed("000000000000000000")).toBe(false);
  });

  it("blocks empty string", () => {
    expect(isAllowed("")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/auth/allowlist.test.ts
```
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// src/auth/allowlist.ts
const ALLOWED_USERS = new Set([
  "883495629970636860",  // yanshroom
  "1424947766060126313", // luckyQuqi
]);

export function isAllowed(userId: string): boolean {
  return ALLOWED_USERS.has(userId);
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/auth/allowlist.test.ts
```
Expected: 4 tests PASS.

**Step 5: Commit**

```bash
git add src/auth/
git commit -m "feat: user allowlist with hardcoded Discord IDs"
```

---

### Task 3: JSON Store — Session Persistence

**Files:**
- Create: `src/store/json-store.ts`
- Create: `src/store/json-store.test.ts`

**Step 1: Write the failing test**

```ts
// src/store/json-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore, SessionBinding } from "./json-store.js";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, "../../.test-data");
const TEST_FILE = join(TEST_DIR, "sessions.json");

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new SessionStore(TEST_FILE);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(store.getAll()).toEqual({});
  });

  it("sets and gets a binding", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);
    expect(store.get("t1")).toEqual(binding);
  });

  it("persists to disk", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);

    const store2 = new SessionStore(TEST_FILE);
    expect(store2.get("t1")).toEqual(binding);
  });

  it("deletes a binding", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);
    store.delete("t1");
    expect(store.get("t1")).toBeUndefined();
  });

  it("updates lastActivityAt", () => {
    const binding: SessionBinding = {
      threadId: "t1",
      tmuxSession: "ct-t1",
      ownerUserId: "u1",
      cwd: "/tmp",
      createdAt: 1000,
      lastActivityAt: 1000,
      lastCaptureHash: "",
    };
    store.set("t1", binding);
    store.touch("t1");
    const updated = store.get("t1")!;
    expect(updated.lastActivityAt).toBeGreaterThan(1000);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/store/json-store.test.ts
```
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// src/store/json-store.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface SessionBinding {
  threadId: string;
  tmuxSession: string;
  ownerUserId: string;
  cwd: string;
  createdAt: number;
  lastActivityAt: number;
  lastCaptureHash: string;
}

type Store = Record<string, SessionBinding>;

export class SessionStore {
  private data: Store;

  constructor(private filePath: string) {
    this.data = this.load();
  }

  private load(): Store {
    if (!existsSync(this.filePath)) return {};
    const raw = readFileSync(this.filePath, "utf-8");
    return JSON.parse(raw);
  }

  private save(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(threadId: string): SessionBinding | undefined {
    return this.data[threadId];
  }

  getAll(): Store {
    return { ...this.data };
  }

  set(threadId: string, binding: SessionBinding): void {
    this.data[threadId] = binding;
    this.save();
  }

  delete(threadId: string): void {
    delete this.data[threadId];
    this.save();
  }

  touch(threadId: string): void {
    if (this.data[threadId]) {
      this.data[threadId].lastActivityAt = Date.now();
      this.save();
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/store/json-store.test.ts
```
Expected: 5 tests PASS.

**Step 5: Commit**

```bash
git add src/store/
git commit -m "feat: JSON file session store with persistence"
```

---

### Task 4: Tmux Session Manager

**Files:**
- Create: `src/tmux/session.ts`
- Create: `src/tmux/session.test.ts`

**Security:** Use `execFile` with args array for all tmux commands. Never pass user input through a shell.

**Step 1: Write the failing test**

```ts
// src/tmux/session.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { TmuxSession } from "./session.js";

const TEST_PREFIX = "ct-test-";

function cleanup() {
  try {
    const sessions = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf-8" });
    for (const name of sessions.trim().split("\n")) {
      if (name.startsWith(TEST_PREFIX)) {
        execFileSync("tmux", ["kill-session", "-t", name]);
      }
    }
  } catch {
    // no sessions
  }
}

describe("TmuxSession", () => {
  afterEach(cleanup);

  it("creates a tmux session", async () => {
    const name = `${TEST_PREFIX}1`;
    await TmuxSession.create(name, "/tmp");
    const sessions = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf-8" });
    expect(sessions).toContain(name);
  });

  it("sends keys to a session", async () => {
    const name = `${TEST_PREFIX}2`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.sendKeys(name, "echo hello-test");
    await new Promise((r) => setTimeout(r, 500));
    const output = await TmuxSession.capturePane(name);
    expect(output).toContain("hello-test");
  });

  it("captures pane output", async () => {
    const name = `${TEST_PREFIX}3`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.sendKeys(name, "echo capture-works");
    await new Promise((r) => setTimeout(r, 500));
    const output = await TmuxSession.capturePane(name);
    expect(output).toContain("capture-works");
  });

  it("kills a session", async () => {
    const name = `${TEST_PREFIX}4`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.kill(name);
    const exists = await TmuxSession.exists(name);
    expect(exists).toBe(false);
  });

  it("lists active sessions", async () => {
    const name = `${TEST_PREFIX}5`;
    await TmuxSession.create(name, "/tmp");
    const list = await TmuxSession.listSessions();
    expect(list).toContain(name);
  });

  it("sends ctrl-c", async () => {
    const name = `${TEST_PREFIX}6`;
    await TmuxSession.create(name, "/tmp");
    await TmuxSession.sendCtrlC(name);
    // should not throw
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/tmux/session.test.ts
```
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```ts
// src/tmux/session.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class TmuxSession {
  static async create(name: string, cwd: string): Promise<void> {
    await execFileAsync("tmux", [
      "new-session", "-d", "-s", name, "-x", "200", "-y", "50", "-c", cwd,
    ]);
  }

  static async kill(name: string): Promise<void> {
    await execFileAsync("tmux", ["kill-session", "-t", name]);
  }

  static async sendKeys(name: string, text: string): Promise<void> {
    await execFileAsync("tmux", ["send-keys", "-t", name, text, "Enter"]);
  }

  static async sendCtrlC(name: string): Promise<void> {
    await execFileAsync("tmux", ["send-keys", "-t", name, "C-c"]);
  }

  static async sendRaw(name: string, keys: string): Promise<void> {
    await execFileAsync("tmux", ["send-keys", "-t", name, keys]);
  }

  static async capturePane(name: string): Promise<string> {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane", "-t", name, "-p", "-S", "-100",
    ]);
    return stdout;
  }

  static async exists(name: string): Promise<boolean> {
    try {
      await execFileAsync("tmux", ["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  }

  static async listSessions(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "list-sessions", "-F", "#{session_name}",
      ]);
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/tmux/session.test.ts
```
Expected: 6 tests PASS.

**Step 5: Commit**

```bash
git add src/tmux/
git commit -m "feat: tmux session manager using execFile (no shell injection)"
```

---

### Task 5: Audit Logger

**Files:**
- Create: `src/utils/logger.ts`
- Create: `src/utils/logger.test.ts`

**Step 1: Write the failing test**

```ts
// src/utils/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditLogger } from "./logger.js";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, "../../.test-logs");
const TEST_FILE = join(TEST_DIR, "audit.jsonl");

describe("AuditLogger", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    logger = new AuditLogger(TEST_FILE);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("logs an entry as JSONL", () => {
    logger.log({
      actor: "user1",
      threadId: "t1",
      action: "new",
      result: "ok",
    });
    const content = readFileSync(TEST_FILE, "utf-8");
    const line = JSON.parse(content.trim());
    expect(line.actor).toBe("user1");
    expect(line.action).toBe("new");
    expect(line.timestamp).toBeDefined();
  });

  it("appends multiple entries", () => {
    logger.log({ actor: "a", threadId: "t", action: "new", result: "ok" });
    logger.log({ actor: "b", threadId: "t", action: "close", result: "ok" });
    const lines = readFileSync(TEST_FILE, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/utils/logger.test.ts
```
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// src/utils/logger.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface AuditEntry {
  actor: string;
  threadId: string;
  action: string;
  result: string;
  detail?: string;
}

export class AuditLogger {
  constructor(private filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  log(entry: AuditEntry): void {
    const record = { ...entry, timestamp: new Date().toISOString() };
    appendFileSync(this.filePath, JSON.stringify(record) + "\n");
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/utils/logger.test.ts
```
Expected: 2 tests PASS.

**Step 5: Commit**

```bash
git add src/utils/logger.ts src/utils/logger.test.ts
git commit -m "feat: structured JSONL audit logger"
```

---

### Task 6: Mode Detector

**Files:**
- Create: `src/detection/mode.ts`
- Create: `src/detection/mode.test.ts`

**Step 1: Write the failing test**

```ts
// src/detection/mode.test.ts
import { describe, it, expect } from "vitest";
import { detectMode } from "./mode.js";

describe("detectMode", () => {
  it("detects shell prompt", () => {
    const text = "ubuntu@host:~/project$ ";
    expect(detectMode(text).mode).toBe("shell");
  });

  it("detects claude code active", () => {
    const text = `
Claude Code v2.1.63

   Welcome back Yanchong!

> `;
    expect(detectMode(text).mode).toBe("claude");
  });

  it("detects permission prompt with Allow/Deny", () => {
    const text = `
  Write  hello.txt

  Allow   Deny   Don't ask again for this session
> `;
    const result = detectMode(text);
    expect(result.mode).toBe("permission");
    expect(result.buttons).toBeDefined();
    expect(result.buttons!.length).toBeGreaterThanOrEqual(2);
  });

  it("detects choice list with numbered options", () => {
    const text = `
Which approach do you prefer?
  1. Option A
  2. Option B
  3. Option C
> `;
    const result = detectMode(text);
    expect(result.mode).toBe("choice");
    expect(result.buttons).toBeDefined();
    expect(result.buttons!.length).toBe(3);
  });

  it("detects processing state (no prompt)", () => {
    const text = `
Reading file src/index.ts...

`;
    expect(detectMode(text).mode).toBe("processing");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/detection/mode.test.ts
```
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// src/detection/mode.ts
export type PaneMode = "shell" | "claude" | "permission" | "choice" | "processing";

export interface DetectionResult {
  mode: PaneMode;
  buttons?: { label: string; key: string }[];
}

export function detectMode(paneText: string): DetectionResult {
  const trimmed = paneText.trim();

  // Check for permission prompt (Allow/Deny pattern)
  if (/\bAllow\b/.test(trimmed) && /\bDeny\b/.test(trimmed)) {
    const buttons: { label: string; key: string }[] = [
      { label: "Allow", key: "y" },
      { label: "Deny", key: "n" },
    ];
    if (/Don't ask again/.test(trimmed)) {
      buttons.push({ label: "Always Allow", key: "!" });
    }
    return { mode: "permission", buttons };
  }

  // Check for numbered choice list
  const choicePattern = /^\s*(\d+)\.\s+(.+)$/gm;
  const choices: { label: string; key: string }[] = [];
  let match;
  while ((match = choicePattern.exec(trimmed)) !== null) {
    choices.push({ label: match[2].trim(), key: match[1] });
  }
  if (choices.length >= 2) {
    return { mode: "choice", buttons: choices };
  }

  // Check for Claude Code (prompt character or header)
  if (/Claude Code/.test(trimmed)) {
    return { mode: "claude" };
  }

  // Check for shell prompt
  if (/[$#]\s*$/m.test(trimmed)) {
    return { mode: "shell" };
  }

  // Default: something is running
  return { mode: "processing" };
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/detection/mode.test.ts
```
Expected: 5 tests PASS.

**Step 5: Commit**

```bash
git add src/detection/
git commit -m "feat: pane mode detector (shell, claude, permission, choice)"
```

---

### Task 7: Output Bridge (Polling + Diff)

**Files:**
- Create: `src/tmux/output.ts`
- Create: `src/tmux/output.test.ts`

**Step 1: Write the failing test**

```ts
// src/tmux/output.test.ts
import { describe, it, expect } from "vitest";
import { OutputPoller } from "./output.js";

describe("OutputPoller", () => {
  it("detects new output via diff", () => {
    const poller = new OutputPoller();
    const diff1 = poller.diff("line1\nline2\n");
    expect(diff1).toBe("line1\nline2\n"); // first capture = all new

    const diff2 = poller.diff("line1\nline2\n");
    expect(diff2).toBeNull(); // same = no diff

    const diff3 = poller.diff("line1\nline2\nline3\n");
    expect(diff3).toBe("line3\n"); // only new line
  });

  it("detects stability after 3 identical captures", () => {
    const poller = new OutputPoller();
    poller.diff("content");
    expect(poller.isStable()).toBe(false);
    poller.diff("content"); // same 1
    expect(poller.isStable()).toBe(false);
    poller.diff("content"); // same 2
    expect(poller.isStable()).toBe(false);
    poller.diff("content"); // same 3
    expect(poller.isStable()).toBe(true);
  });

  it("resets stability on new content", () => {
    const poller = new OutputPoller();
    poller.diff("a");
    poller.diff("a");
    poller.diff("a");
    poller.diff("a");
    expect(poller.isStable()).toBe(true);
    poller.diff("b"); // new content
    expect(poller.isStable()).toBe(false);
  });

  it("truncates output to maxLength", () => {
    const poller = new OutputPoller();
    const long = "x".repeat(3000);
    const diff = poller.diff(long);
    expect(diff!.length).toBeLessThanOrEqual(1800);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/tmux/output.test.ts
```
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// src/tmux/output.ts
const MAX_LENGTH = 1800;

export class OutputPoller {
  private lastContent = "";
  private sameCount = 0;

  diff(currentContent: string): string | null {
    if (currentContent === this.lastContent) {
      this.sameCount++;
      return null;
    }

    this.sameCount = 0;
    let newContent: string;

    if (this.lastContent && currentContent.startsWith(this.lastContent)) {
      newContent = currentContent.slice(this.lastContent.length);
    } else {
      newContent = currentContent;
    }

    this.lastContent = currentContent;

    if (newContent.length > MAX_LENGTH) {
      newContent = "...(truncated)\n" + newContent.slice(-MAX_LENGTH + 20);
    }

    return newContent;
  }

  isStable(): boolean {
    return this.sameCount >= 3;
  }

  reset(): void {
    this.lastContent = "";
    this.sameCount = 0;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/tmux/output.test.ts
```
Expected: 4 tests PASS.

**Step 5: Commit**

```bash
git add src/tmux/output.ts src/tmux/output.test.ts
git commit -m "feat: output poller with diff detection and stability check"
```

---

### Task 8: Slash Command Definitions + Deploy Script

**Files:**
- Create: `src/bot/commands.ts`
- Create: `src/deploy-commands.ts`

**Step 1: Create command definitions**

```ts
// src/bot/commands.ts
import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("new")
    .setDescription("Create a new terminal session bound to this thread"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show session info and idle time"),

  new SlashCommandBuilder()
    .setName("ctrlc")
    .setDescription("Send Ctrl+C to the bound terminal session"),

  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close the terminal session and remove binding"),

  new SlashCommandBuilder()
    .setName("claude")
    .setDescription("Start Claude Code in the bound session")
    .addStringOption((opt) =>
      opt
        .setName("dir")
        .setDescription("Directory to run Claude Code in")
        .setRequired(false)
    ),
];
```

**Step 2: Create deploy script**

```ts
// src/deploy-commands.ts
import { REST, Routes } from "discord.js";
import { commands } from "./bot/commands.js";
import "dotenv/config";

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;
const guildId = process.env.DISCORD_GUILD_ID!;

const rest = new REST().setToken(token);

async function main() {
  const body = commands.map((c) => c.toJSON());
  console.log(`Deploying ${body.length} commands to guild ${guildId}...`);

  const data = await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body }
  );

  console.log(`Deployed ${(data as unknown[]).length} commands.`);
}

main().catch(console.error);
```

**Step 3: Verify build**

```bash
pnpm build
```
Expected: compiles without errors.

**Step 4: Commit**

```bash
git add src/bot/commands.ts src/deploy-commands.ts
git commit -m "feat: slash command definitions and deploy script"
```

---

### Task 9: Command Handlers + Message Bridge

**Files:**
- Create: `src/bot/handlers.ts`
- Modify: `src/index.ts`

This is the largest task. It wires all components together.

**Step 1: Create handlers**

Create `src/bot/handlers.ts` with these exports:
- `handleNew(interaction)` — creates tmux session, saves binding
- `handleStatus(interaction)` — shows session info
- `handleCtrlC(interaction)` — sends C-c to tmux
- `handleClose(interaction)` — kills session, removes binding
- `handleClaude(interaction)` — runs `unset CLAUDECODE && claude` in session
- `handleMessage(message)` — forwards non-slash text via send-keys
- `handleButton(interaction)` — handles button clicks, sends key to tmux

All handlers check `isAllowed()` first. All handlers log via AuditLogger.

The `startPoller()` internal function:
- Polls `capturePane` at 300ms intervals
- Calls `OutputPoller.diff()` for new content
- Calls `detectMode()` on raw capture
- If mode is `permission` or `choice`: creates Discord `ActionRowBuilder` with `ButtonBuilder` components, custom ID format `tmux-btn:{threadId}:{key}`
- If regular output: edits the same Discord message
- Stops after `isStable()` returns true or 30s timeout

**Step 2: Update src/index.ts**

Wire up:
- Create `SessionStore` and `AuditLogger` instances
- Create handlers via `createHandlers(store, logger)`
- `Events.InteractionCreate` → dispatch to command handlers and button handler
- `Events.MessageCreate` → `handleMessage`
- `Events.ClientReady` → reconcile stale bindings
- `setInterval` every 10min → idle cleanup (kill sessions > 24h inactive)

**Step 3: Verify build**

```bash
pnpm build
```
Expected: compiles without errors.

**Step 4: Commit**

```bash
git add src/bot/handlers.ts src/index.ts
git commit -m "feat: command handlers, message bridge, output polling, idle cleanup"
```

---

### Task 10: Integration Test — Full Flow

**Files:**
- Create: `src/integration.test.ts`

**Step 1: Write integration test**

Test the core tmux pipeline end-to-end (no Discord dependency):
1. Create tmux session via `TmuxSession.create()`
2. Save binding via `SessionStore.set()`
3. Send command via `TmuxSession.sendKeys("echo integration-ok")`
4. Wait 1s, capture via `TmuxSession.capturePane()`
5. Assert output contains "integration-ok"
6. Assert `detectMode()` returns "shell"
7. Assert `OutputPoller.diff()` returns the new content
8. Kill session, assert `exists()` returns false
9. Delete binding, assert `get()` returns undefined

**Step 2: Run integration test**

```bash
pnpm test src/integration.test.ts
```
Expected: PASS.

**Step 3: Run all tests**

```bash
pnpm test
```
Expected: All tests PASS.

**Step 4: Commit**

```bash
git add src/integration.test.ts
git commit -m "test: integration test for full tmux pipeline"
```

---

### Task 11: Systemd Unit + Final Wiring

**Files:**
- Create: `channel-tmux.service`

**Step 1: Create systemd unit file**

```ini
[Unit]
Description=channel-tmux Discord bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/channel-tmux
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Step 2: Final build and verify**

```bash
pnpm build
```
Expected: compiles cleanly.

**Step 3: Commit**

```bash
git add channel-tmux.service
git commit -m "feat: systemd service unit for production deployment"
```

---

### Task 12: Deploy + Manual Acceptance Test

This is a manual step requiring the Discord bot token.

**Step 1: Setup .env**

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
```

**Step 2: Deploy slash commands**

```bash
pnpm deploy-commands
```
Expected: "Deployed 5 commands."

**Step 3: Start bot**

```bash
pnpm dev
```
Expected: "Logged in as <bot-name>"

**Step 4: Manual acceptance test in Discord**

1. Open a thread, run `/new` -> session created message
2. Type `pwd` -> terminal output appears
3. Run `/status` -> shows session info
4. Run `/claude` -> Claude Code starts, output streams
5. If Claude asks permission -> Discord buttons appear
6. Click Allow -> command proceeds
7. Run `/ctrlc` -> sends interrupt
8. Run `/close` -> session closed

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Project scaffold | build check |
| 2 | Auth allowlist | 4 unit tests |
| 3 | JSON store | 5 unit tests |
| 4 | Tmux session manager | 6 unit tests |
| 5 | Audit logger | 2 unit tests |
| 6 | Mode detector | 5 unit tests |
| 7 | Output bridge | 4 unit tests |
| 8 | Slash commands + deploy | build check |
| 9 | Handlers + wiring | build check |
| 10 | Integration test | 1 integration test |
| 11 | Systemd unit | - |
| 12 | Deploy + manual test | manual |

**Total: 27 automated tests across 12 tasks.**
