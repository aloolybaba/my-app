import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

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
