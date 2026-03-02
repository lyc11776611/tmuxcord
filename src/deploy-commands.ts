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
