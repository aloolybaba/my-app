import { buildPanelButtons, buildPanelEmbed } from '../utils/embeds.js';

export async function refreshPanel(guild) {
  const channel = await guild.channels.fetch(process.env.PANEL_CHANNEL_ID);
  if (!channel?.isTextBased()) throw new Error('PANEL_CHANNEL_ID does not point to a text channel');

  const messages = await channel.messages.fetch({ limit: 100 });
  const oldPanel = messages.find(message =>
    message.author.id === guild.client.user.id &&
    message.embeds.some(embed => embed.footer?.text === 'Crackers Schematics')
  );

  if (oldPanel) await oldPanel.delete().catch(() => null);

  return channel.send({
    embeds: [buildPanelEmbed(guild)],
    components: [buildPanelButtons()],
  });
}
