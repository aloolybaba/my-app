import { SlashCommandBuilder } from 'discord.js';
import { processLitematicAttachment } from '../handlers/schematicHandler.js';
import { basicEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('render')
    .setDescription('Render a .litematic schematic file.')
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('The .litematic file to render')
        .setRequired(true),
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('file', false);
    if (!attachment) {
      await interaction.reply({
        content: 'Please use `/render file:<your .litematic>` after the slash commands are refreshed.',
        ephemeral: true,
      });
      return;
    }

    if (!attachment.name?.toLowerCase().endsWith('.litematic')) {
      await interaction.reply({ content: 'Please attach a `.litematic` file.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: false });
    const result = await processLitematicAttachment(attachment, interaction.id, {});
    const shortEmbed = result.embeds[0];
    shortEmbed.setTitle('Rendered Schematic');

    if (!result.files?.length) {
      await interaction.editReply(result);
      return;
    }

    await interaction.editReply({
      embeds: [shortEmbed, basicEmbed('Render Complete', 'Attached below as `preview.png`.')],
      files: result.files,
    });
  },
};
