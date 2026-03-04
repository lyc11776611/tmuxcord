import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { join } from "node:path";
import { SessionStore } from "./store/json-store.js";
import { AuditLogger } from "./utils/logger.js";
import { TmuxSession } from "./tmux/session.js";
import { createHandlers } from "./bot/handlers.js";
import "dotenv/config";

process.on("unhandledRejection", (err) => {
  console.error("[FATAL] Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

const store = new SessionStore(join(__dirname, "..", "data", "sessions.json"));
const logger = new AuditLogger(join(__dirname, "..", "logs", "audit.jsonl"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const handlers = createHandlers(store, logger);

// --- Ready: reconcile stale bindings ---
client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  try {
    const allBindings = store.getAll();
    const liveSessions = await TmuxSession.listSessions();
    const liveSet = new Set(liveSessions);

    for (const [threadId, binding] of Object.entries(allBindings)) {
      if (!liveSet.has(binding.tmuxSession)) {
        console.log(
          `Removing stale binding: ${threadId} -> ${binding.tmuxSession}`
        );
        store.delete(threadId);
      }
    }
  } catch (err) {
    console.error("Error reconciling stale bindings:", err);
  }
});

// --- Interaction handler ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case "new":
          await handlers.handleNew(interaction);
          break;
        case "status":
          await handlers.handleStatus(interaction);
          break;
        case "ctrlc":
          await handlers.handleCtrlC(interaction);
          break;
        case "ctrlcc":
          await handlers.handleCtrlCC(interaction);
          break;
        case "close":
          await handlers.handleClose(interaction);
          break;
        case "claude":
          await handlers.handleClaude(interaction);
          break;
        case "peek":
          await handlers.handlePeek(interaction);
          break;
        case "scroll":
          await handlers.handleScroll(interaction);
          break;
      }
    } else if (interaction.isButton()) {
      await handlers.handleButton(interaction);
    }
  } catch (err) {
    console.error("[interaction] Error:", err);
    try {
      const msg = `**Internal error:** \`${err instanceof Error ? err.message : String(err)}\``;
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: msg, flags: 64 });
        } else {
          await interaction.reply({ content: msg, flags: 64 });
        }
      }
    } catch {
      // Last resort — nothing we can do
    }
  }
});

// --- Message handler ---
client.on(Events.MessageCreate, async (message) => {
  if (!message.author.bot) {
    console.log(`[msg] from=${message.author.id} channel=${message.channelId} content="${message.content.slice(0, 50)}"`);
  }
  await handlers.handleMessage(message);
});

// --- Idle cleanup: every 10 minutes, kill sessions idle > 24h ---
const IDLE_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MAX_IDLE_TIME = 24 * 60 * 60 * 1000; // 24 hours

setInterval(async () => {
  const allBindings = store.getAll();
  const now = Date.now();

  for (const [threadId, binding] of Object.entries(allBindings)) {
    if (now - binding.lastActivityAt > MAX_IDLE_TIME) {
      console.log(
        `Idle cleanup: killing session ${binding.tmuxSession} (thread ${threadId})`
      );

      handlers.stopPoller(threadId);

      try {
        await TmuxSession.kill(binding.tmuxSession);
      } catch {
        // Session may already be dead
      }

      store.delete(threadId);

      logger.log({
        actor: "system",
        threadId,
        action: "idle-cleanup",
        result: "ok",
        detail: binding.tmuxSession,
      });
    }
  }
}, IDLE_CHECK_INTERVAL);

client.login(process.env.DISCORD_TOKEN);
