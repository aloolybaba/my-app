import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { log } from '../utils/logger.js';

const PANEL_BUTTON_ID = 'open_schematic_ticket';

async function findExistingPanel(channel, botUserId) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });

    return messages.find(message => {
      if (message.author.id !== botUserId) return false;
      return message.components?.some(row =>
        row.components?.some(component => component.customId === PANEL_BUTTON_ID),
      );
    }) ?? null;
  } catch (error) {
    log.warn('[PanelHandler] Could not fetch messages to find existing panel:', error.message);
    return null;
  }
}

function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle('\u{1F4CB} Schematic Submissions')
    .setDescription(
      'Click the button below to open a submission ticket and publish your schematic.\n' +
      'You will be able to add details, credits, and instructions after uploading.',
    )
    .setColor(0xF5A623)
    .setFooter({
      text: 'Crackers Schematics',
      iconURL: guild?.iconURL() ?? undefined,
    });
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PANEL_BUTTON_ID)
      .setLabel('Publish a Schematic')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('\u{1F4E6}'),
  );
}

export async function postOrRefreshPanel(channel, botUserId) {
  if (!channel?.isTextBased()) {
    throw new Error('PANEL_CHANNEL_ID does not point to a text channel');
  }

  const payload = {
    embeds: [buildPanelEmbed(channel.guild)],
    components: [buildPanelRow()],
  };

  const existing = await findExistingPanel(channel, botUserId);
  if (existing) {
    try {
      const editedPanel = await existing.edit(payload);
      log.info(`[PanelHandler] Edited existing panel (message ${existing.id})`);
      return editedPanel;
    } catch (error) {
      log.warn('[PanelHandler] Could not edit old panel; posting fresh:', error.message);
    }
  } else {
    log.info('[PanelHandler] No existing panel found; posting fresh.');
  }

  const newPanel = await channel.send(payload);

  log.info(`[PanelHandler] Panel posted (message ${newPanel.id})`);
  return newPanel;
}
