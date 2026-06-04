import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { parseLitematic } from '../renderer/litematicParser.js';
import { renderIsometric } from '../renderer/isometricRenderer.js';
import { basicEmbed, buildSchematicEmbed } from '../utils/embeds.js';
import { ticketData } from './ticketHandler.js';
import { log } from '../utils/logger.js';

const RENDER_CACHE_TTL_MS = 30 * 60 * 1000;
const RENDER_CACHE_LIMIT = 25;
const RENDER_ANGLES = ['auto', '0', '90', '180', '270'];
const renderCache = new Map();

export async function handleLitematicMessage(message) {
  if (message.author.bot || !/^schematic-/.test(message.channel.name)) return;
  const attachment = message.attachments.find(file => file.name?.toLowerCase().endsWith('.litematic'));
  if (!attachment) return;

  const status = await message.reply({ embeds: [basicEmbed('Processing schematic...', 'Parsing and rendering your litematic.')] });
  try {
    const result = await processLitematicAttachment(attachment, message.id, ticketData.get(message.channelId));
    await status.edit(result);
  } catch (error) {
    log.error('Schematic processing failed:', error);
    await status.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle('Rendering Failed')
          .setColor(0xFF4444)
          .setDescription(
            `Could not process \`${attachment.name}\`.\n\n` +
            `**Error:** \`${error.message ?? String(error)}\``,
          )
          .setFooter({ text: 'Check the file is a valid .litematic and try again.' }),
      ],
      files: [],
      components: [],
    });
  }
}

export async function processLitematicAttachment(attachment, id, data = {}, options = {}) {
  const tempPath = path.join(os.tmpdir(), `${id}.litematic`);
  await downloadFile(attachment.url, tempPath);

  try {
    const parsed = await parseLitematic(tempPath);
    const key = rememberRender(id, parsed, data, options.title ?? 'Schematic Submission');
    return await buildRenderPayload(key, parsed, data, 'auto', options.title ?? 'Schematic Submission');
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => null);
  }
}

export async function handleRenderAngleButton(interaction) {
  const [, key, angle] = interaction.customId.split(':');
  const cached = renderCache.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    renderCache.delete(key);
    await interaction.reply({
      content: 'That render preview expired. Upload the `.litematic` again to make fresh angle buttons.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  const payload = await buildRenderPayload(key, cached.parsed, cached.data, angle, cached.title);
  await interaction.message.edit({ ...payload, attachments: [] });
}

async function buildRenderPayload(key, parsed, data, angle, title) {
  const selectedAngle = RENDER_ANGLES.includes(String(angle)) ? String(angle) : 'auto';
  const fileName = previewFileName(selectedAngle);
  const embed = buildSchematicEmbed(data, parsed, true, fileName).setTitle(title);
  const buffer = await renderIsometric(parsed, { angle: selectedAngle });
  const file = new AttachmentBuilder(buffer, { name: fileName });

  return {
    embeds: [embed],
    files: [file],
    components: [buildRenderAngleButtons(key, selectedAngle)],
  };
}

function buildRenderAngleButtons(key, selectedAngle) {
  return new ActionRowBuilder().addComponents(
    ...RENDER_ANGLES.map(angle => new ButtonBuilder()
      .setCustomId(`render_angle:${key}:${angle}`)
      .setLabel(angle === 'auto' ? 'Auto' : angle)
      .setStyle(angle === selectedAngle ? ButtonStyle.Primary : ButtonStyle.Secondary)),
  );
}

function rememberRender(id, parsed, data, title) {
  cleanupRenderCache();
  const key = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `${Date.now()}`;
  renderCache.set(key, {
    parsed,
    data,
    title,
    expiresAt: Date.now() + RENDER_CACHE_TTL_MS,
  });
  cleanupRenderCache();
  return key;
}

function cleanupRenderCache() {
  const now = Date.now();
  for (const [key, value] of renderCache.entries()) {
    if (value.expiresAt < now) renderCache.delete(key);
  }

  while (renderCache.size > RENDER_CACHE_LIMIT) {
    renderCache.delete(renderCache.keys().next().value);
  }
}

function previewFileName(angle) {
  return `preview-${angle}.png`;
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}
