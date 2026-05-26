import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { config, validateConfig } from "./config.js";
import { logger } from "./logger.js";
import { handleInteraction } from "./interactions.js";
import { handleMessageCreate } from "./uploads.js";
import { RenderQueue } from "./render/queue.js";
import { registerGuildCommands } from "./commands.js";
import { prepareResourcePack } from "./render/resourcePack.js";

validateConfig();

const renderQueue = new RenderQueue();
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];

if (config.useMessageContentIntent) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({
  intents,
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, async () => {
  try {
    logger.info("Bot online", { tag: client.user.tag });
    await prepareResourcePack(config.textureRoot);
    await registerGuildCommands();
  } catch (error) {
    logger.error("Startup task failed", error);
    process.exit(1);
  }
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
  process.exit(1);
});

await client.login(config.token);
