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
const renderJobFooterPrefix = "render-job:";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function sendTicketNotice(message, content) {
  await message.channel.send(content).catch((error) => {
    logger.warn("Failed to send ticket notice", {
      channelId: message.channelId,
      error: error.message
    });
  });
}

function attachmentLooksLikeLitematic(attachment) {
  const values = [
    attachment.name,
    attachment.url,
    attachment.proxyURL,
    attachment.contentType
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => value.includes(".litematic"));
}

function attachmentLabel(attachment) {
  return attachment.name || attachment.url || attachment.id || "unknown attachment";
}

function oldestMessage(messages) {
  return [...messages.values()].sort((left, right) => {
    const timeDiff = left.createdTimestamp - right.createdTimestamp;
    if (timeDiff !== 0) return timeDiff;
    return BigInt(left.id) > BigInt(right.id) ? 1 : -1;
  })[0];
}

async function findRenderJobMessages(channel, attachmentId) {
  const footerText = `${renderJobFooterPrefix}${attachmentId}`;
  const recent = await channel.messages.fetch({ limit: 100 });
  return recent.filter((message) => {
    const embed = message.embeds?.[0];
    return (
      message.author.id === channel.client.user.id &&
      embed?.footer?.text === footerText
    );
  });
}

async function claimRenderJob(message, attachment) {
  const marker = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(brand.gold)
        .setTitle("Rendering Preview")
        .setDescription(`Queued \`${attachment.name || "schematic.litematic"}\`.`)
        .setFooter({ text: `${renderJobFooterPrefix}${attachment.id}` })
        .setTimestamp()
    ]
  });

  await delay(1250);
  const markers = await findRenderJobMessages(message.channel, attachment.id);
  const keep = oldestMessage(markers);
  const stale = markers.filter((item) => item.id !== keep?.id);
  await Promise.all(stale.map((item) => item.delete().catch(() => {})));

  return keep?.id === marker.id ? marker : null;
}

export async function handleMessageCreate(message, renderQueue) {
  if (message.author.bot || !message.guild) return;

  let ticket = queries.getTicketByChannel.get(message.channelId);
  if (!ticket && message.channel.name?.startsWith("schematic-")) {
    const match = message.channel.topic?.match(/\((\d{17,22})\)/);
    if (match) {
      const now = Date.now();
      queries.createTicketOrIgnore.run(message.guild.id, message.channelId, match[1], now);
      ticket = queries.getTicketByChannel.get(message.channelId);
      if (ticket && !queries.getSubmissionByTicket.get(ticket.id)) {
        queries.createSubmission.run(ticket.id, null, null, null, null, null, now, now);
      }
    }
  }
  if (!ticket || ticket.status !== "open") return;

  const attachments = [...message.attachments.values()];
  if (attachments.length > 0) {
    logger.info("Ticket upload message received", {
      channelId: message.channelId,
      attachmentCount: attachments.length,
      attachmentNames: attachments.map(attachmentLabel)
    });
  }

  const litematics = attachments.filter(attachmentLooksLikeLitematic);
  if (litematics.length === 0) {
    if (attachments.length > 0) {
      await message.reply(
        "I saw your upload, but it was not detected as a `.litematic` file. Please make sure the filename ends with `.litematic`."
      );
      await sendLog(
        message,
        `Attachment ignored in <#${message.channelId}>: ${attachments
          .map(attachmentLabel)
          .join(", ")}`
      );
    }
    return;
  }

  if (!queries.getSubmissionByTicket.get(ticket.id)) {
    queries.createSubmission.run(ticket.id, null, null, null, null, null, Date.now(), Date.now());
  }

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(renderDir, { recursive: true });

  for (const attachment of litematics) {
    if (attachment.size > config.maxUploadBytes) {
      await message.reply(`Upload is too large. Limit is ${config.maxUploadBytes} bytes.`);
      continue;
    }

    try {
      const marker = await claimRenderJob(message, attachment);
      if (!marker) {
        logger.info("Skipped duplicate render handler", {
          channelId: message.channelId,
          attachmentId: attachment.id
        });
        continue;
      }

      const buffer = await download(attachment.url);
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const duplicate = queries.getUploadByHash.get(ticket.id, sha256);
      if (duplicate) {
        await marker.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(brand.darkGold)
              .setTitle("Duplicate Upload")
              .setDescription("That `.litematic` was already uploaded in this ticket.")
              .setFooter({ text: `${renderJobFooterPrefix}${attachment.id}` })
              .setTimestamp()
          ]
        });
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

      await marker.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(brand.gold)
            .setTitle("Rendering Preview")
            .setDescription(`Rendering \`${attachment.name || "schematic.litematic"}\` now...`)
            .setFooter({ text: `${renderJobFooterPrefix}${attachment.id}` })
            .setTimestamp()
        ]
      });
      await sendLog(
        message,
        `Rendering queued in <#${message.channelId}> for ${message.author}: \`${attachment.name}\``
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
          const renderMessage = await message.channel.send({
            embeds: [buildSubmissionEmbed(submission, ticket.creator_id)],
            files: [file]
          });
          await marker.delete().catch(() => {});
          queries.setSetting.run(`renderMessage:${ticket.id}`, renderMessage.id);
          await sendLog(
            message,
            `Render complete in <#${message.channelId}> for \`${attachment.name}\``
          );
        },
        onError: async (error) => {
          queries.updateUploadStatus.run("failed", error.message, attachment.id);
          await marker.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(brand.danger)
                .setTitle("Rendering Failed")
                .setDescription(`Rendering failed for \`${attachment.name}\`:\n${error.message}`)
                .setFooter({ text: `${renderJobFooterPrefix}${attachment.id}` })
                .setTimestamp()
            ]
          });
          await sendLog(
            message,
            `Render failed in <#${message.channelId}> for \`${attachment.name}\`: ${error.message}`
          );
        }
      });
    } catch (error) {
      logger.error("Upload handling failed", error);
      await sendTicketNotice(message, `Upload failed: ${error.message}`);
    }
  }
}
