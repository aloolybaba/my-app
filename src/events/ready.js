import { Events } from 'discord.js';
import { log } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    log.info(`Ready as ${client.user.tag}`);
  },
};
