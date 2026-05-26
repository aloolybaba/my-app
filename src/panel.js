import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { config } from "./config.js";
import { queries } from "./database/db.js";
import { logger } from "./logger.js";

export const ids = {
  startSubmission: "schematic:start",
  information: "schematic:information",
  closeTicket: "schematic:close",
  claimTicket: "schematic:claim",
  detailsContinue: "schematic:details"
};

export function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Publish Schematic")
    .setDescription(
      "Share your schematic details and a reviewer will be with you shortly."
    )
    .setFooter({ text: "Schematic Publishing" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ids.startSubmission)
      .setLabel("Start Submission")
      .setEmoji("📦")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

export async function refreshPanel(client) {
  const channel = await client.channels.fetch(config.panelChannelId);
  const payload = buildPanel();
  const saved = queries.getSetting.get("panelMessageId")?.value;

  if (saved) {
    try {
      const message = await channel.messages.fetch(saved);
      await message.edit(payload);
      logger.info("Panel refreshed", { messageId: message.id });
      return message;
    } catch {
      logger.warn("Saved panel message not found, sending a new one.");
    }
  }

  const message = await channel.send(payload);
  queries.setSetting.run("panelMessageId", message.id);
  logger.info("Panel sent", { messageId: message.id });
  return message;
}

export function buildTicketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ids.information)
      .setLabel("Start Information")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(ids.detailsContinue)
      .setLabel("Add Extra Details")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(ids.claimTicket)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ids.closeTicket)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );
}
