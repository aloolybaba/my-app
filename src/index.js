import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { readdir } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from './utils/env.js';
import { log } from './utils/logger.js';

loadEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

const commandsDir = path.resolve('./src/commands');
for (const file of await readdir(commandsDir)) {
  if (!file.endsWith('.js')) continue;
  const { default: command } = await import(pathToFileURL(path.join(commandsDir, file)));
  client.commands.set(command.data.name, command);
}

const eventsDir = path.resolve('./src/events');
for (const file of await readdir(eventsDir)) {
  if (!file.endsWith('.js')) continue;
  const { default: event } = await import(pathToFileURL(path.join(eventsDir, file)));
  client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args, client));
}

client.login(process.env.DISCORD_TOKEN);
log.info('Logging in to Discord');
