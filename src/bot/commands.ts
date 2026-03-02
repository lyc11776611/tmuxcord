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
    .setName("ctrlcc")
    .setDescription("Send Ctrl+C twice (to exit Claude Code)"),

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
