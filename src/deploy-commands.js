import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from './utils/env.js';
import { log } from './utils/logger.js';

const env = loadEnv();
const commands = [];
const commandsDir = path.resolve('./src/commands');

for (const file of await readdir(commandsDir)) {
  if (!file.endsWith('.js')) continue;
  const { default: command } = await import(pathToFileURL(path.join(commandsDir, file)));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(env.token);
await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body: commands });
log.info(`Registered ${commands.length} guild slash commands`);
