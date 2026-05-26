import {
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { config } from "./config.js";

export const commandData = [
  new SlashCommandBuilder()
    .setName("panel-refresh")
    .setDescription("Refresh the Publish Schematic panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("ticket-close")
    .setDescription("Close the current schematic ticket."),
  new SlashCommandBuilder()
    .setName("render-status")
    .setDescription("Show schematic render queue status.")
].map((command) => command.toJSON());

export async function registerGuildCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commandData
  });
}
