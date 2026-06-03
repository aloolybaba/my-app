import { Events } from 'discord.js';
import {
  askCloseConfirmation,
  closeTicket,
  handleModalSubmit,
  openTicket,
  showExtraDetailsModal,
  showStartInfoModal,
  toggleClaim,
} from '../handlers/ticketHandler.js';
import { log } from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
    } catch (error) {
      log.error('interactionCreate failed', error);
      const payload = { content: `Something went wrong: ${error.message}`, ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
  },
};

async function handleButton(interaction) {
  switch (interaction.customId) {
    case 'open_schematic_ticket':
      await openTicket(interaction);
      break;
    case 'ticket_start_info':
      await showStartInfoModal(interaction);
      break;
    case 'ticket_extra_details':
      await showExtraDetailsModal(interaction);
      break;
    case 'ticket_claim':
      await toggleClaim(interaction);
      break;
    case 'ticket_close':
      await askCloseConfirmation(interaction);
      break;
    case 'ticket_close_confirm':
      await closeTicket(interaction);
      break;
    case 'ticket_close_cancel':
      await interaction.update({ content: 'Close cancelled.', embeds: [], components: [] });
      break;
    default:
      await interaction.reply({ content: 'Unknown action.', ephemeral: true });
  }
}
