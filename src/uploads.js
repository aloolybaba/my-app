import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { config } from "./config.js";
import { queries } from "./database/db.js";
import { logger } from "./logger.js";

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
    .setColor(0xf1c40f)
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

export async function handleMessageCreate(message, renderQueue) {
  if (message.author.bot || !message.guild) return;

  const ticket = queries.getTicketByChannel.get(message.channelId);
  if (!ticket || ticket.status !== "open") return;

  const litematics = [...message.attachments.values()].filter((attachment) =>
    attachment.name?.toLowerCase().endsWith(".litematic")
  );
  if (litematics.length === 0) return;

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
        },
        onError: async (error) => {
          queries.updateUploadStatus.run("failed", error.message, attachment.id);
          await message.channel.send(
            `Rendering failed for \`${attachment.name}\`: ${error.message}`
          );
        }
      });
    } catch (error) {
      logger.error("Upload handling failed", error);
      await message.reply(`Upload failed: ${error.message}`);
    }
  }
}
