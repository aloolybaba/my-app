import { Events } from 'discord.js';
import { handleLitematicMessage } from '../handlers/schematicHandler.js';
import { log } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      await handleLitematicMessage(message);
    } catch (error) {
      log.error('messageCreate failed', error);
    }
  },
};
