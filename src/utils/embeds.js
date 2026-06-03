import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export const COLORS = {
  amber: 0xF5A623,
  error: 0xD94A4A,
  success: 0x35A66A,
};

export function buildPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle('Schematic Submissions')
    .setDescription('Click the button below to open a submission ticket and publish your schematic.\nYou will be able to add details, credits, and instructions after uploading.')
    .setColor(COLORS.amber)
    .setFooter({ text: 'Crackers Schematics', iconURL: guild?.iconURL() ?? undefined });
}

export function buildPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_schematic_ticket')
      .setLabel('Publish a Schematic')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📦'),
  );
}

export function buildWelcomeEmbed(user) {
  return new EmbedBuilder()
    .setTitle('Schematic Submission')
    .setDescription(`Welcome ${user}.\n\nClick **Start Information** when you are ready to fill out schematic details.\nUse **Add Extra Details** after that for positives, negatives, and instructions.\nUpload your \`.litematic\` file in this channel.\nThe bot will parse the file, render an isometric preview, and generate the publish embed automatically.`)
    .setColor(COLORS.amber)
    .setFooter({ text: new Date().toISOString() });
}

export function buildTicketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_start_info').setLabel('Start Information').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_extra_details').setLabel('Add Extra Details').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
  );
}

export function buildSchematicEmbed(data, parsed, withImage = true) {
  const value = key => data?.[key] || 'Not provided';
  const embed = new EmbedBuilder()
    .setTitle('Schematic Submission')
    .setColor(COLORS.amber)
    .addFields(
      { name: 'Designers', value: value('designers'), inline: true },
      { name: 'Credits', value: value('credits'), inline: true },
      { name: 'Rates', value: value('rates'), inline: true },
      { name: 'Stats', value: value('stats') },
      { name: 'Positives', value: value('positives') },
      { name: 'Negatives', value: value('negatives') },
      { name: 'Instructions', value: value('instructions') },
      {
        name: 'Size & Volume',
        value: `Size: ${parsed.size.x} x ${parsed.size.y} x ${parsed.size.z}\nVolume: ${parsed.volume.filled}/${parsed.volume.total}`,
      },
    )
    .setFooter({ text: new Date().toISOString() });

  if (withImage) embed.setImage('attachment://preview.png');
  return embed;
}

export function basicEmbed(title, description, color = COLORS.amber) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}
