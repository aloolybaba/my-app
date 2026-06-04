import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { postOrRefreshPanel } from '../handlers/panelHandler.js';
import { log } from '../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('panel-refresh')
    .setDescription('Post or refresh the schematic submission panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const staffRoleIds = process.env.STAFF_ROLE_IDS?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
    const hasStaffRole = staffRoleIds.length === 0 ||
      interaction.member.roles.cache.some(role => staffRoleIds.includes(role.id));

    if (!hasStaffRole) {
      await interaction.reply({
        content: '\u274C You do not have permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const panelChannel = await client.channels.fetch(process.env.PANEL_CHANNEL_ID);
      if (!panelChannel) {
        await interaction.editReply('\u274C Could not find the panel channel. Check `PANEL_CHANNEL_ID`.');
        return;
      }

      await postOrRefreshPanel(panelChannel, client.user.id);
      await interaction.editReply('\u2705 Panel refreshed successfully.');
    } catch (error) {
      log.error('[panel-refresh] Error:', error);
      await interaction.editReply(`\u274C Failed to refresh the panel: \`${error.message}\``);
    }
  },
};
