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
      .setEmoji("??")
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

  const recent = await channel.messages.fetch({ limit: 50 });
  const duplicates = recent.filter((message) => {
    const embed = message.embeds?.[0];
    return message.author.id === client.user.id && embed?.title === "Publish Schematic";
  });
  if (duplicates.size > 0) {
    const newest = duplicates.first();
    await newest.edit(payload);
    queries.setSetting.run("panelMessageId", newest.id);
    const stale = duplicates.filter((message) => message.id !== newest.id);
    await Promise.all(stale.map((message) => message.delete().catch(() => {})));
    logger.info("Panel deduplicated", { messageId: newest.id, removed: stale.size });
    return newest;
  }

  const message = await channel.send(payloa
