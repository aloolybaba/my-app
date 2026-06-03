import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import { AttachmentBuilder } from 'discord.js';
import { parseLitematic } from '../renderer/litematicParser.js';
import { renderIsometric } from '../renderer/isometricRenderer.js';
import { basicEmbed, buildSchematicEmbed, COLORS } from '../utils/embeds.js';
import { ticketData } from './ticketHandler.js';

const MAX_RENDER_VOLUME = 200_000;

export async function handleLitematicMessage(message) {
  if (message.author.bot || !/^schematic-/.test(message.channel.name)) return;
  const attachment = message.attachments.find(file => file.name?.toLowerCase().endsWith('.litematic'));
  if (!attachment) return;

  const status = await message.reply({ embeds: [basicEmbed('Processing schematic...', 'Parsing and rendering your litematic.')] });
  try {
    const result = await processLitematicAttachment(attachment, message.id, ticketData.get(message.channelId));
    await status.edit(result);
  } catch (error) {
    await status.edit({ embeds: [basicEmbed('Render Failed', error.message, COLORS.error)], files: [], components: [] });
  }
}

export async function processLitematicAttachment(attachment, id, data = {}) {
  const tempPath = path.join(os.tmpdir(), `${id}.litematic`);
  await downloadFile(attachment.url, tempPath);

  try {
    const parsed = await parseLitematic(tempPath);
    const shouldRender = parsed.volume.total <= MAX_RENDER_VOLUME;
    const embed = buildSchematicEmbed(data, parsed, shouldRender);

    if (!shouldRender) {
      embed.setDescription('This schematic is larger than 200,000 blocks, so rendering was skipped.');
      return { embeds: [embed], files: [] };
    }

    const buffer = await renderIsometric(parsed);
    const file = new AttachmentBuilder(buffer, { name: 'preview.png' });
    return { embeds: [embed], files: [file] };
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => null);
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}
