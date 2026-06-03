import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { refreshPanel } from '../handlers/panelHandler.js';
import { basicEmbed, COLORS } from '../utils/embeds.js';
import { isStaff } from '../handlers/ticketHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('panel-refresh')
    .setDescription('Post or refresh the schematic submission panel.'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !isStaff(interaction.member)) {
      await interaction.reply({ content: 'You need a staff role or Manage Server permission to refresh the panel.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await refreshPanel(interaction.guild);
    await interaction.editReply({ embeds: [basicEmbed('Panel refreshed.', 'The schematic submission panel has been posted.', COLORS.success)] });
  },
};
