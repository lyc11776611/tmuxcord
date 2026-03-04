import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  Message,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { isAllowed } from "../auth/allowlist.js";
import { SessionStore, SessionBinding } from "../store/json-store.js";
import { TmuxSession } from "../tmux/session.js";
import { OutputPoller } from "../tmux/output.js";
import { detectMode } from "../detection/mode.js";
import { stripAnsi } from "../utils/strip-ansi.js";
import { AuditLogger } from "../utils/logger.js";

function formatOutput(raw: string): string {
  let text = raw.trim();
  if (text.length > 1800) {
    text = "...(truncated)\n" + text.slice(-1780);
  }
  return "```ansi\n" + text + "\n```";
}

function buildButtonRows(
  threadId: string,
  buttons: { label: string; key: string }[]
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const btn of buttons.slice(i, i + 5)) {
      const style =
        btn.label === "Allow"
          ? ButtonStyle.Success
          : btn.label === "Deny"
            ? ButtonStyle.Danger
            : ButtonStyle.Secondary;
      const label = btn.label.length > 77 ? btn.label.slice(0, 77) + "..." : btn.label;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tmux-btn:${threadId}:${btn.key}`)
          .setLabel(label)
          .setStyle(style)
      );
    }
    rows.push(row);
  }
  return rows;
}

interface ScrollState {
  chunks: string[];    // chunks[0]=current screen, [1]=just above, [2]=further back...
  msgIds: string[];    // tracked Discord message IDs, ordered top to bottom
  depth: number;       // how many chunks revealed so far
}

export function createHandlers(store: SessionStore, logger: AuditLogger) {
  const activeTimers = new Map<string, ReturnType<typeof setInterval>>();
  const pollers = new Map<string, OutputPoller>();
  const scrollStates = new Map<string, ScrollState>();

  function stopPoller(threadId: string): void {
    const timer = activeTimers.get(threadId);
    if (timer) {
      clearInterval(timer);
      activeTimers.delete(threadId);
    }
  }

  function getOrCreatePoller(threadId: string): OutputPoller {
    let poller = pollers.get(threadId);
    if (!poller) {
      poller = new OutputPoller();
      pollers.set(threadId, poller);
    }
    return poller;
  }

  function removePoller(threadId: string): void {
    stopPoller(threadId);
    pollers.delete(threadId);
  }

  function startPoller(
    threadId: string,
    tmuxName: string,
    channel: TextChannel | ThreadChannel
  ): void {
    // Stop existing timer but KEEP the poller's diff state
    stopPoller(threadId);
    // Invalidate scroll state since terminal content is changing
    scrollStates.delete(threadId);

    const poller = getOrCreatePoller(threadId);
    poller.resetStability();
    const startTime = Date.now();
    const POLL_INTERVAL = 300;
    const MAX_DURATION = 30_000;

    let lastMessageId: string | undefined;

    const timer = setInterval(async () => {
      try {
        // Stop after 30s
        if (Date.now() - startTime > MAX_DURATION) {
          console.log(`[poller:${threadId}] Timeout, stopping`);
          stopPoller(threadId);
          return;
        }

        // Stop if stable
        if (poller.isStable()) {
          console.log(`[poller:${threadId}] Stable, stopping`);
          stopPoller(threadId);
          return;
        }

        // Plain capture for diff and detection
        const raw = await TmuxSession.capturePane(tmuxName);
        const newContent = poller.diff(raw);

        if (!newContent) return;

        console.log(`[poller:${threadId}] New content (${newContent.length} chars)`);

        // Update activity
        store.touch(threadId);

        const detection = detectMode(raw);

        // Get colored version — extract matching new lines from end
        const ansiRaw = await TmuxSession.capturePaneAnsi(tmuxName);
        const newLineCount = newContent.trimEnd().split("\n").length;
        const ansiLines = ansiRaw.trimEnd().split("\n");
        const displayContent = ansiLines.slice(-newLineCount).join("\n");

        if (
          (detection.mode === "permission" || detection.mode === "choice") &&
          detection.buttons
        ) {
          // Stop poller while waiting for button input
          stopPoller(threadId);

          await channel.send({
            content: formatOutput(displayContent),
            components: buildButtonRows(threadId, detection.buttons),
          });

          // Stop and wait for button press — button handler restarts poller
          return;
        }

        // Regular output — only new content, with ANSI colors
        const formatted = formatOutput(displayContent);

        if (lastMessageId) {
          try {
            const msg = await channel.messages.fetch(lastMessageId);
            await msg.edit(formatted);
          } catch {
            // Message may have been deleted, send new one
            const sent = await channel.send(formatted);
            lastMessageId = sent.id;
          }
        } else {
          const sent = await channel.send(formatted);
          lastMessageId = sent.id;
        }
      } catch (err) {
        console.error(`[poller:${threadId}] Error:`, err);
        stopPoller(threadId);
        const errMsg = err instanceof Error ? err.message : String(err);
        const short = errMsg.length > 200 ? errMsg.slice(0, 200) + "..." : errMsg;
        channel.send(`**Poller error:** \`${short}\``).catch(() => {});
      }
    }, POLL_INTERVAL);

    activeTimers.set(threadId, timer);
  }

  async function handleNew(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const existing = store.get(threadId);
    if (existing) {
      await interaction.reply({
        content: `Session \`${existing.tmuxSession}\` is already bound to this thread.`,
        flags: 64,
      });
      return;
    }

    const tmuxName = `ct-${threadId.slice(-8)}`;
    const cwd = process.env.DEFAULT_CWD || process.cwd();

    try {
      await TmuxSession.create(tmuxName, cwd);
    } catch (err) {
      await interaction.reply({
        content: `Failed to create tmux session: ${err}`,
        flags: 64,
      });
      return;
    }

    const binding: SessionBinding = {
      threadId,
      tmuxSession: tmuxName,
      ownerUserId: userId,
      cwd,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      lastCaptureHash: "",
    };

    store.set(threadId, binding);

    logger.log({
      actor: userId,
      threadId,
      action: "new",
      result: "ok",
      detail: tmuxName,
    });

    await interaction.reply(
      `Terminal session \`${tmuxName}\` created and bound to this thread.`
    );

    const channel = interaction.channel as TextChannel | ThreadChannel;
    startPoller(threadId, tmuxName, channel);
  }

  async function handleStatus(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    const alive = await TmuxSession.exists(binding.tmuxSession);
    const idleMs = Date.now() - binding.lastActivityAt;
    const idleMin = Math.floor(idleMs / 60_000);

    await interaction.reply(
      [
        `**Session:** \`${binding.tmuxSession}\``,
        `**Status:** ${alive ? "alive" : "dead"}`,
        `**Owner:** <@${binding.ownerUserId}>`,
        `**CWD:** \`${binding.cwd}\``,
        `**Idle:** ${idleMin} minutes`,
      ].join("\n")
    );
  }

  async function handleCtrlC(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    await TmuxSession.sendCtrlC(binding.tmuxSession);
    store.touch(threadId);

    logger.log({
      actor: userId,
      threadId,
      action: "ctrlc",
      result: "ok",
    });

    await interaction.reply("Sent Ctrl+C.");
  }

  async function handleCtrlCC(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    await TmuxSession.sendCtrlC(binding.tmuxSession);
    await new Promise(r => setTimeout(r, 200));
    await TmuxSession.sendCtrlC(binding.tmuxSession);
    store.touch(threadId);

    logger.log({
      actor: userId,
      threadId,
      action: "ctrlcc",
      result: "ok",
    });

    await interaction.reply("Sent Ctrl+C x2.");

    const channel = interaction.channel as TextChannel | ThreadChannel;
    startPoller(threadId, binding.tmuxSession, channel);
  }

  async function handleClose(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    removePoller(threadId);

    try {
      await TmuxSession.kill(binding.tmuxSession);
    } catch {
      // Session may already be dead
    }

    store.delete(threadId);

    logger.log({
      actor: userId,
      threadId,
      action: "close",
      result: "ok",
      detail: binding.tmuxSession,
    });

    await interaction.reply(
      `Session \`${binding.tmuxSession}\` closed and binding removed.`
    );
  }

  async function handleClaude(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread. Use `/new` first.",
        flags: 64,
      });
      return;
    }

    const dir = interaction.options.getString("dir");
    let cmd = "unset CLAUDECODE && claude";
    if (dir) {
      cmd = `cd ${dir} && ${cmd}`;
    }

    await TmuxSession.sendKeys(binding.tmuxSession, cmd);
    store.touch(threadId);

    logger.log({
      actor: userId,
      threadId,
      action: "claude",
      result: "ok",
      detail: dir ?? undefined,
    });

    // Reset poller fully so CC's initial screen shows as new content
    const poller = getOrCreatePoller(threadId);
    poller.reset();

    await interaction.reply(
      `Starting Claude Code${dir ? ` in \`${dir}\`` : ""}...`
    );

    // Delay before polling — give CC time to render its TUI
    const channel = interaction.channel as TextChannel | ThreadChannel;
    setTimeout(() => {
      startPoller(threadId, binding.tmuxSession, channel);
    }, 2000);
  }

  async function handlePeek(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    // Defer immediately to avoid 3s timeout
    await interaction.deferReply();

    const alive = await TmuxSession.exists(binding.tmuxSession);
    if (!alive) {
      await interaction.editReply(
        "Session is dead. Use `/close` then `/new` to start fresh."
      );
      return;
    }

    try {
      // Capture full screen with ANSI colors
      const ansiRaw = await TmuxSession.capturePaneAnsi(binding.tmuxSession);
      const raw = await TmuxSession.capturePane(binding.tmuxSession);

      // Update poller baseline so next poll doesn't repeat this content
      const poller = getOrCreatePoller(threadId);
      poller.diff(raw); // advance baseline

      const detection = detectMode(raw);
      store.touch(threadId);

      if (
        (detection.mode === "permission" || detection.mode === "choice") &&
        detection.buttons
      ) {
        await interaction.editReply({
          content: formatOutput(ansiRaw.trimEnd()),
          components: buildButtonRows(threadId, detection.buttons),
        });
        return;
      }

      await interaction.editReply(formatOutput(ansiRaw.trimEnd()));

      // Restart poller to catch new changes
      const channel = interaction.channel as TextChannel | ThreadChannel;
      startPoller(threadId, binding.tmuxSession, channel);
    } catch (err) {
      console.error(`[peek:${threadId}] Error:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const short = errMsg.length > 200 ? errMsg.slice(0, 200) + "..." : errMsg;
      await interaction.editReply(`**Peek error:** \`${short}\``).catch(() => {});
    }
  }

  async function handleScroll(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const threadId = interaction.channelId;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    await interaction.deferReply();

    try {
      let state = scrollStates.get(threadId);

      if (!state) {
        // First scroll: capture full scrollback, split into chunks
        const fullAnsi = await TmuxSession.capturePaneFull(binding.tmuxSession);
        const lines = fullAnsi.trimEnd().split("\n");

        // Build chunks from bottom up, ~1700 chars each (room for ```ansi wrapper)
        const chunks: string[] = [];
        let currentChunk: string[] = [];
        let currentLen = 0;

        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (currentLen + line.length + 1 > 1700 && currentChunk.length > 0) {
            chunks.push(currentChunk.reverse().join("\n"));
            currentChunk = [];
            currentLen = 0;
          }
          currentChunk.push(line);
          currentLen += line.length + 1;
        }
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.reverse().join("\n"));
        }
        // chunks[0] = bottom (current screen), [1] = just above, [N] = top (oldest)

        if (chunks.length <= 1) {
          await interaction.editReply("No scrollback beyond current screen.");
          return;
        }

        state = { chunks, msgIds: [], depth: 0 };
        scrollStates.set(threadId, state);
      }

      state.depth++;

      if (state.depth >= state.chunks.length) {
        await interaction.editReply("No more scrollback.");
        return;
      }

      const d = state.depth;
      const channel = interaction.channel as TextChannel | ThreadChannel;

      // Edit existing scroll messages: msg[i] shifts to show chunks[d - i]
      for (let i = 0; i < state.msgIds.length; i++) {
        const chunkIdx = d - i;
        try {
          const msg = await channel.messages.fetch(state.msgIds[i]);
          await msg.edit(formatOutput(state.chunks[chunkIdx]));
        } catch {
          // Message may have been deleted
        }
      }

      // This deferred reply becomes the new bottom scroll message: chunks[1]
      const reply = await interaction.editReply(formatOutput(state.chunks[1]));
      state.msgIds.push(reply.id);

      store.touch(threadId);
    } catch (err) {
      console.error(`[scroll:${threadId}] Error:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const short = errMsg.length > 200 ? errMsg.slice(0, 200) + "..." : errMsg;
      await interaction.editReply(`**Scroll error:** \`${short}\``).catch(() => {});
    }
  }

  async function handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check authorization
    if (!isAllowed(message.author.id)) return;

    const threadId = message.channelId;
    const binding = store.get(threadId);
    if (!binding) return;

    await TmuxSession.sendKeys(binding.tmuxSession, message.content);
    store.touch(threadId);

    logger.log({
      actor: message.author.id,
      threadId,
      action: "message",
      result: "ok",
      detail: message.content.slice(0, 100),
    });

    const channel = message.channel as TextChannel | ThreadChannel;
    startPoller(threadId, binding.tmuxSession, channel);
  }

  async function handleButton(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;

    if (!isAllowed(userId)) {
      await interaction.reply({ content: "Not authorized.", flags: 64 });
      return;
    }

    const parts = interaction.customId.split(":");
    if (parts.length !== 3 || parts[0] !== "tmux-btn") {
      return;
    }

    const threadId = parts[1];
    const key = parts[2];

    const binding = store.get(threadId);
    if (!binding) {
      await interaction.reply({
        content: "No session bound to this thread.",
        flags: 64,
      });
      return;
    }

    await TmuxSession.sendRaw(binding.tmuxSession, key);
    store.touch(threadId);

    logger.log({
      actor: userId,
      threadId,
      action: "button",
      result: "ok",
      detail: key,
    });

    const label =
      "label" in interaction.component
        ? (interaction.component.label as string | null)
        : null;

    await interaction.update({
      content: `Button pressed: **${label ?? key}**`,
      components: [],
    });

    const channel = interaction.channel as TextChannel | ThreadChannel;
    if (channel) {
      startPoller(threadId, binding.tmuxSession, channel);
    }
  }

  function getActivePollers(): Map<string, ReturnType<typeof setInterval>> {
    return activeTimers;
  }

  return {
    handleNew,
    handleStatus,
    handleCtrlC,
    handleCtrlCC,
    handleClose,
    handleClaude,
    handlePeek,
    handleScroll,
    handleMessage,
    handleButton,
    stopPoller,
    getActivePollers,
  };
}
