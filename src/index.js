import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { config, validateConfig } from "./config.js";
import { migrate } from "./database/db.js";
import { logger } from "./logger.js";
import { refreshPanel } from "./panel.js";
import { handleInteraction } from "./interactions.js";
import { handleMessageCreate } from "./uploads.js";
import { RenderQueue } from "./render/queue.js";
import { registerGuildCommands } from "./commands.js";

validateConfig();
migrate();

const renderQueue = new RenderQueue();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, async () => {
  logger.info("Bot online", { tag: client.user.tag });
  await registerGuildCommands();
  await refreshPanel(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  await handleInteraction(interaction, renderQueue);
});

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message, renderQueue);
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exitCode = 1;
});

await client.login(config.token);
