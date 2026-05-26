import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { config } from "./config.js";
import { queries } from "./database/db.js";
import { logger } from "./logger.js";

export const brand = {
  gold: 0xd4a017,
  darkGold: 0x8a5a13,
  danger: 0xb33a2f
};

export const ids = {
  startSubmission: "schematic:start",
  information: "schematic:information",
  closeTicket: "schematic:close",
  claimTicket: "schematic:claim",
  detailsContinue: "schematic:details"
};

export function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(brand.gold)
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
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function findPanelMessages(channel, client, limit = 100) {
  const recent = await channel.messages.fetch({ limit });
  return recent.filter((message) => {
    const embed = message.embeds?.[0];
    return message.author.id === client.user.id && embed?.title === "Publish Schematic";
  });
}

async function cleanupDuplicatePanels(channel, client, keepId) {
  const panels = await findPanelMessages(channel, client);
  const stale = panels.filter((message) => message.id !== keepId);
  await Promise.all(stale.map((message) => message.delete().catch(() => {})));
  return stale.size;
}

export async function refreshPanel(client) {
  const channel = await client.channels.fetch(config.panelChannelId);
  const payload = buildPanel();
  const saved = queries.getSetting.get("panelMessageId")?.value;
  const panels = await findPanelMessages(channel, client);

  if (panels.size > 0) {
    const sorted = [...panels.values()].sort(
      (left, right) => right.createdTimestamp - left.createdTimestamp
    );
    const newest = sorted.find((message) => message.id === saved) || sorted[0];
    await newest.edit(payload);
    queries.setSetting.run("panelMessageId", newest.id);
    const removed = await cleanupDuplicatePanels(channel, client, newest.id);
    setTimeout(() => {
      cleanupDuplicatePanels(channel, client, newest.id).catch((error) =>
        logger.warn("Delayed panel cleanup failed", { error: error.message })
      );
    }, 2500);
    logger.info("Panel refreshed", { messageId: newest.id, removed });
    return newest;
  }

  const message = await channel.send(payload);
  queries.setSetting.run("panelMessageId", message.id);
  setTimeout(() => {
    cleanupDuplicatePanels(channel, client, message.id).catch((error) =>
      logger.warn("Delayed panel cleanup failed", { error: error.message })
    );
  }, 2500);
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

