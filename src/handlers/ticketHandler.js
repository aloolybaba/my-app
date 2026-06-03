import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { basicEmbed, buildTicketButtons, buildWelcomeEmbed, COLORS } from '../utils/embeds.js';
import { getStaffRoleIds } from '../utils/env.js';
import { log } from '../utils/logger.js';

export const ticketData = new Map();

export function channelNameFor(user) {
  const clean = user.username
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return `schematic-${clean || user.id}`;
}

export function isStaff(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    getStaffRoleIds().some(roleId => member.roles.cache.has(roleId));
}

export async function openTicket(interaction) {
  const name = channelNameFor(interaction.user);
  const existing = interaction.guild.channels.cache.find(channel => channel.name === name);
  if (existing) {
    await interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const parent = await getTicketCategory(interaction.guild);
  const staffRoleIds = getStaffRoleIds();
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    ...staffRoleIds.map(id => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  const channel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic: `opener:${interaction.user.id}`,
    permissionOverwrites: overwrites,
  });

  ticketData.set(channel.id, defaultTicketData(interaction.user.id));
  await channel.send({
    content: `${interaction.user}`,
    embeds: [buildWelcomeEmbed(interaction.user)],
    components: [buildTicketButtons()],
  });
  await logChannel(interaction.guild, 'Ticket Opened', `${interaction.user} opened ${channel}.`);
  await interaction.editReply(`Ticket opened: ${channel}`);
}

export async function showStartInfoModal(interaction) {
  await interaction.showModal(new ModalBuilder()
    .setCustomId('modal_start_info')
    .setTitle('Schematic Details')
    .addComponents(
      inputRow('designers', 'Designer(s)', TextInputStyle.Short, true),
      inputRow('credits', 'Credits (optional)', TextInputStyle.Short, false),
      inputRow('rates', 'Rates (e.g. Free / Paid)', TextInputStyle.Short, false),
      inputRow('stats', 'Stats / Technical Info', TextInputStyle.Paragraph, false),
    ));
}

export async function showExtraDetailsModal(interaction) {
  await interaction.showModal(new ModalBuilder()
    .setCustomId('modal_extra_details')
    .setTitle('Additional Details')
    .addComponents(
      inputRow('positives', 'Positives', TextInputStyle.Paragraph, false),
      inputRow('negatives', 'Negatives', TextInputStyle.Paragraph, false),
      inputRow('instructions', 'Instructions / How to use', TextInputStyle.Paragraph, false),
    ));
}

export async function handleModalSubmit(interaction) {
  const current = ticketData.get(interaction.channelId) ?? defaultTicketData(getOpenerId(interaction.channel));
  const fields = {};
  for (const [key, component] of interaction.fields.fields) {
    fields[key] = component.value || null;
  }
  ticketData.set(interaction.channelId, { ...current, ...fields });
  await interaction.reply({
    embeds: [basicEmbed('Details Saved', 'Your schematic details have been stored for this ticket.', COLORS.success)],
    ephemeral: true,
  });
}

export async function toggleClaim(interaction) {
  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
    return;
  }
  const topic = interaction.channel.topic ?? '';
  const claimedBy = topic.match(/claimed:(\d+)/)?.[1];
  const nextTopic = claimedBy === interaction.user.id
    ? topic.replace(/\s*claimed:\d+/, '')
    : `${topic.replace(/\s*claimed:\d+/, '')} claimed:${interaction.user.id}`.trim();

  await interaction.channel.setTopic(nextTopic);
  const action = claimedBy === interaction.user.id ? 'unclaimed' : 'claimed';
  await logChannel(interaction.guild, 'Ticket Claim Updated', `${interaction.user} ${action} ${interaction.channel}.`);
  await interaction.reply({ content: `Ticket ${action}.`, ephemeral: true });
}

export async function askCloseConfirmation(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Yes, close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('No').setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    embeds: [basicEmbed('Close Ticket?', 'This will save a transcript and delete the channel.', COLORS.error)],
    components: [row],
    ephemeral: true,
  });
}

export async function closeTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  const openerId = getOpenerId(interaction.channel);
  const transcript = await saveTranscript(channel, interaction.user);

  if (openerId) {
    const opener = await interaction.client.users.fetch(openerId).catch(() => null);
    if (opener) {
      const dmAttachment = new AttachmentBuilder(Buffer.from(transcript.text, 'utf8'), {
        name: `${channel.name}-transcript.txt`,
      });
      const dmEmbed = new EmbedBuilder()
        .setTitle('Your ticket has been closed')
        .setColor(COLORS.amber)
        .setDescription(`Your schematic submission ticket **#${channel.name}** was closed.\nThe full transcript is attached below.`)
        .addFields(
          { name: 'Closed by', value: interaction.user.toString(), inline: true },
          { name: 'Closed at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        )
        .setFooter({ text: 'Crackers Schematics' });

      await opener.send({ embeds: [dmEmbed], files: [dmAttachment] }).catch(() => {
        log.warn(`Could not DM transcript to ${opener.tag}; DMs may be closed.`);
      });
    }
  }

  await logChannel(interaction.guild, 'Ticket Closed', `${interaction.user} closed ${channel}. Transcript saved with ${transcript.messageCount} message(s).`);
  ticketData.delete(interaction.channelId);
  await interaction.editReply('Ticket closed. This channel will be deleted in 5 seconds.');
  setTimeout(() => interaction.channel.delete('Ticket closed').catch(err => log.warn('Failed to delete ticket', err)), 5000);
}

async function getTicketCategory(guild) {
  if (process.env.TICKET_CATEGORY_ID) {
    const category = await guild.channels.fetch(process.env.TICKET_CATEGORY_ID).catch(() => null);
    if (category?.type === ChannelType.GuildCategory) return category;
    log.warn(`TICKET_CATEGORY_ID ${process.env.TICKET_CATEGORY_ID} was not found or is not a category`);
  }

  if (process.env.CREATE_TICKET_CATEGORIES !== 'true') return null;
  const existing = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory && channel.name === process.env.TICKET_CATEGORY_NAME
  );
  if (existing) return existing;
  return guild.channels.create({ name: process.env.TICKET_CATEGORY_NAME, type: ChannelType.GuildCategory });
}

function inputRow(id, label, style, required) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required),
  );
}

function defaultTicketData(openerId) {
  return {
    openerId,
    designers: null,
    credits: null,
    rates: null,
    stats: null,
    positives: null,
    negatives: null,
    instructions: null,
    renderedAt: null,
  };
}

function getOpenerId(channel) {
  return channel.topic?.match(/opener:(\d+)/)?.[1] ?? null;
}

async function logChannel(guild, title, description) {
  const channel = await guild.channels.fetch(process.env.LOGS_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [basicEmbed(title, description)] }).catch(err => log.warn('Log send failed', err));
  }
}

async function saveTranscript(channel, closedBy) {
  const transcriptText = await buildTranscript(channel);
  const messageCount = Number(transcriptText.match(/End of transcript - (\d+) message\(s\)/)?.[1] ?? 0);
  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf8'), {
    name: `${channel.name}-transcript.txt`,
    description: `Transcript for ${channel.name}`,
  });
  const transcriptChannel = await channel.guild.channels.fetch(process.env.TRANSCRIPTS_CHANNEL_ID);
  if (!transcriptChannel?.isTextBased()) return { message: null, text: transcriptText, messageCount };

  const transcriptEmbed = new EmbedBuilder()
    .setTitle('Ticket Transcript')
    .setColor(COLORS.amber)
    .addFields(
      { name: 'Channel', value: `#${channel.name}`, inline: true },
      { name: 'Closed by', value: closedBy.toString(), inline: true },
      { name: 'Messages', value: `${messageCount}`, inline: true },
      { name: 'Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    )
    .setFooter({ text: 'Crackers Schematics' });

  const message = await transcriptChannel.send({ embeds: [transcriptEmbed], files: [attachment] });
  return { message, text: transcriptText, messageCount };
}

async function buildTranscript(channel) {
  const messages = [];
  let before;
  while (messages.length < 500) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, 500 - messages.length), before });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
  }

  const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [];

  lines.push('============================================================');
  lines.push('  SCHEMATIC TICKET TRANSCRIPT');
  lines.push(`  Channel : #${channel.name}`);
  lines.push(`  Server  : ${channel.guild.name}`);
  lines.push(`  Date    : ${new Date().toUTCString()}`);
  lines.push('============================================================');
  lines.push('');

  for (const msg of sorted) {
    const time = msg.createdAt.toUTCString();
    const author = msg.author.username;
    const isBot = msg.author.bot ? ' [BOT]' : '';

    lines.push(`-- ${author}${isBot} | ${time}`);

    if (msg.content) {
      let content = msg.content;
      for (const [id, member] of msg.mentions.members ?? []) {
        content = content.replaceAll(`<@${id}>`, `@${member.displayName}`);
        content = content.replaceAll(`<@!${id}>`, `@${member.displayName}`);
      }
      lines.push(`   ${content}`);
    }

    for (const embed of msg.embeds) {
      lines.push(`   [Embed] ${embed.title ?? '(no title)'}`);
      if (embed.description) {
        lines.push(`     ${embed.description.split('\n').join('\n     ')}`);
      }
      for (const field of embed.fields ?? []) {
        lines.push(`     - ${field.name}: ${field.value}`);
      }
    }

    for (const att of msg.attachments.values()) {
      lines.push(`   [Attachment] ${att.name} (${(att.size / 1024).toFixed(1)} KB)`);
      lines.push(`   ${att.url}`);
    }

    lines.push('------------------------------------------------------------');
    lines.push('');
  }

  lines.push('============================================================');
  lines.push(`  End of transcript - ${sorted.length} message(s)`);
  lines.push('============================================================');

  return lines.join('\n');
}
