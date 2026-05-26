import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

const token = process.env.MTUwODc4Njk0NjM2Mzg4NzY0Nw.GJnJB4.WT_KT-xujP8pXYeZk9xaMdf26lid_gKUlwxsXE;
const clientId = process.env.1508786946363887647;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN");
}

if (!clientId) {
  throw new Error("Missing DISCORD_CLIENT_ID");
}

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!")
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(token);

console.log("Registering slash commands...");

await rest.put(Routes.applicationCommands(clientId), {
  body: commands
});

console.log("Slash commands registered.");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Bot is online as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }
});

client.login(token);
