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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createJitter(min = 1200, max = 2800) {
  return Math.floor(min + Math.random() * (max - min));
}

async function findPanelMessages(channel, client, limit = 100) {
  const recent = await channel.messages.fetch({ limit });
  return recent.filter((message) => {
    const embed = message.embeds?.[0];
    return message.author.id === client.user.id && embed?.title === "Publish Schematic";
  });
}

function newestMessage(messages) {
  return [...messages.values()].sort(
    (left, right) => {
      const timeDiff = right.createdTimestamp - left.createdTimestamp;
      if (timeDiff !== 0) return timeDiff;
      return BigInt(right.id) > BigInt(left.id) ? 1 : -1;
    }
  )[0];
}

async function cleanupDuplicatePanels(channel, client) {
  const panels = await findPanelMessages(channel, client);
  if (panels.size === 0) return { keep: null, removed: 0 };
  const keep = newestMessage(panels);
  const stale = panels.filter((message) => message.id !== keep.id);
  await Promise.all(stale.map((message) => message.delete().catch(() => {})));
  return { keep, removed: stale.size };
}

async function editExistingPanel(channel, client, payload) {
  const panels = await findPanelMessages(channel, client);
  if (panels.size === 0) return null;
  const newest = newestMessage(panels);
  await newest.edit(payload);
  queries.setSetting.run("panelMessageId", newest.id);
  const { removed } = await cleanupDuplicatePanels(channel, client);
  logger.info("Panel refreshed", { messageId: newest.id, removed });
  return newest;
}

export async function refreshPanel(client) {
  const channel = await client.channels.fetch(config.panelChannelId);
  const payload = buildPanel();
  const existing = await editExistingPanel(channel, client, payload);
  if (existing) {
    setTimeout(() => {
      cleanupDuplicatePanels(channel, client).catch((error) =>
        logger.warn("Delayed panel cleanup failed", { error: error.message })
      );
    }, 2500);
    return existing;
  }

  await delay(createJitter());
  const rechecked = await editExistingPanel(channel, client, payload);
  if (rechecked) return rechecked;

  const message = await channel.send(payload);
  queries.setSetting.run("panelMessageId", message.id);
  setTimeout(() => {
    cleanupDuplicatePanels(channel, client).catch((error) =>
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

