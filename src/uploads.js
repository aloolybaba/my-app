import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { queries } from "./database/db.js";
import { logger } from "./logger.js";
import { brand } from "./panel.js";

const uploadDir = path.join(process.cwd(), "data", "uploads");
const renderDir = path.join(process.cwd(), "data", "renders");

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download upload: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function formatBlock(text) {
  return text?.trim() || "_Not provided_";
}

function buildSubmissionEmbed(submission, creatorId) {
  return new EmbedBuilder()
    .setColor(brand.gold)
    .setTitle(submission.schematic_name || "Schematic Submission")
    .setDescription(
      [
        `**Designers**\n${formatBlock(submission.designers || `<@${creatorId}>`)}`,
        `**Credits**\n${formatBlock(submission.credits)}`,
        `**Rates**\n${formatBlock(submission.rates)}`,
        `**Stats**\n${formatBlock(submission.stats)}`,
        `**Positives**\n${formatBlock(submission.positives)}`,
        `**Negatives**\n${formatBlock(submission.negatives)}`,
        `**Instructions**\n${formatBlock(submission.instructions)}`,
        `**Size & Volume**\nSize: \`${submission.width} x ${submission.height} x ${submission.length}\`\nVolume: \`${submission.non_air_volume}/${submission.bounding_volume}\``
      ].join("\n\n")
    )
    .setImage("attachment://render.png")
    .setTimestamp();
}

async function sendLog(message, content) {
  if (!config.logsChannelId) return;
  const channel = await message.guild.channels.fetch(config.logsChannelId).catch(() => null);
  if (!channel) return;
  await channel.send(content).catch(() => {});
}

export async function handleMessageCreate(message, renderQueue) {
  if (message.author.bot || !message.guild) return;

  let ticket = queries.getTicketByChannel.get(message.channelId);
  if (!ticket && message.channel.name?.startsWith("schematic-")) {
    const match = message.channel.topic?.match(/\((\d{17,22})\)/);
    if (match) {
      const now = Date.now();
      queries.createTicket.run(message.guild.id, message.channelId, match[1], now);
      ticket = queries.getTicketByChannel.get(message.channelId);
      if (ticket && !queries.getSubmissionByTicket.get(ticket.id)) {
        queries.createSubmission.run(ticket.id, null, null, null, null, null, now, now);
      }
    }
  }
  if (!ticket || ticket.status !== "open") return;

  const litematics = [...message.attachments.values()].filter((attachment) =>
    attachment.name?.toLowerCase().endsWith(".litematic")
  );
  if (litematics.length === 0) return;

  const submission = queries.getSubmissionByTicket.get(ticket.id);
  if (!submission?.schematic_name) {
    await message.reply(
      "Please click **Start Information** and save the schematic details before uploading a `.litematic`."
    );
    return;
  }

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(renderDir, { recursive: true });

  for (const attachment of litematics) {
    if (attachment.size > config.maxUploadBytes) {
      await message.reply(`Upload is too large. Limit is ${config.maxUploadBytes} bytes.`);
      continue;
    }

    try {
      const buffer = await download(attachment.url);
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const duplicate = queries.getUploadByHash.get(ticket.id, sha256);
      if (duplicate) {
        await message.reply("That `.litematic` was already uploaded in this ticket.");
        continue;
      }

      const safeName = `${ticket.id}-${attachment.id}.litematic`;
      const inputPath = path.join(uploadDir, safeName);
      const outputPath = path.join(renderDir, `${ticket.id}-${attachment.id}.png`);
      await fs.writeFile(inputPath, buffer);

      queries.createUpload.run(
        ticket.id,
        message.id,
        attachment.id,
        attachment.name,
        sha256,
        "queued",
        Date.now()
      );

      await message.reply("`.litematic` received. Rendering preview now...");
      await sendLog(
        message,
        `📥 Rendering queued in <#${message.channelId}> for ${message.author}: \`${attachment.name}\``
      );

      renderQueue.enqueue({
        ticketId: ticket.id,
        channelId: message.channelId,
        attachmentId: attachment.id,
        inputPath,
        outputPath,
        onDone: async (result) => {
          queries.updateUploadStatus.run("rendered", null, attachment.id);
          queries.updateSubmissionRender.run(
            result.size.width,
            result.size.height,
            result.size.length,
            result.nonAirVolume,
            result.boundingVolume,
            outputPath,
            Date.now(),
            ticket.id
          );

          const submission = queries.getSubmissionByTicket.get(ticket.id);
          const file = new AttachmentBuilder(outputPath, { name: "render.png" });
          await message.channel.send({
            embeds: [buildSubmissionEmbed(submission, ticket.creator_id)],
            files: [file]
          });
          await sendLog(
            message,
            `✅ Render complete in <#${message.channelId}> for \`${attachment.name}\``
          );
        },
        onError: async (error) => {
          queries.updateUploadStatus.run("failed", error.message, attachment.id);
          await message.channel.send(
            `Rendering failed for \`${attachment.name}\`: ${error.message}`
          );
          await sendLog(
            message,
            `❌ Render failed in <#${message.channelId}> for \`${attachment.name}\`: ${error.message}`
          );
        }
      });
    } catch (error) {
      logger.error("Upload handling failed", error);
      await message.reply(`Upload failed: ${error.message}`);
    }
  }
}
