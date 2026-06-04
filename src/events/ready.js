import { Events } from 'discord.js';
import { postOrRefreshPanel } from '../handlers/panelHandler.js';
import { log } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    log.info(`Ready as ${client.user.tag}`);

    try {
      const panelChannel = await client.channels.fetch(process.env.PANEL_CHANNEL_ID);
      if (panelChannel) {
        await postOrRefreshPanel(panelChannel, client.user.id);
        log.info('[Ready] Panel check complete.');
      }
    } catch (error) {
      log.warn('[Ready] Could not auto-post panel on startup:', error.message);
    }
  },
};
