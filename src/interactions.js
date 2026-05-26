import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { config } from "./config.js";
import { queries } from "./database/db.js";
import { brand, ids, buildTicketControls, refreshPanel } from "./panel.js";
import {
  buildDetailsSubmissionModal,
  buildMainSubmissionModal,
  modalIds
} from "./modals.js";
import { logger } from "./logger.js";

const cooldowns = new Map();

function optionalField(interaction, id) {
  return (interaction.fields.getTextInputValue(id) || "").trim();
}

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isStaff(member) {
  return config.staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function buildTicketOverwrites(guild, creatorId) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: creatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    ...config.staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }))
  ];
}

async function findOpenTicketChannel(guild, creatorId) {
  const channels = await guild.channels.fetch();
  return channels.find(
    (channel) =>
      channel?.type === ChannelType.GuildText &&
      channel.name?.startsWith("schematic-") &&
      channel.topic?.includes(`(${creatorId})`)
  );
}

async function createTicketCategory(guild, creator, overwrites) {
  if (!config.createTicketCategories) return null;
  return guild.channels.create({
    name: `schematic-ticket-${cleanChannelName(creator.username)}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: `Schematic ticket category for ${creator.tag}`
  });
}

async function deleteTicketChannelAndCategory(channel) {
  const parent = channel.parent;
  await channel.delete("Ticket closed").catch(() => {});
  if (
    config.createTicketCategories &&
    parent?.type === ChannelType.GuildCategory &&
    parent.name?.startsWith("schematic-ticket-") &&
    parent.children.cache.size === 0
  ) {
    await parent.delete("Ticket category closed").catch(() => {});
  }
}

function ticketFromChannel(channel) {
  const saved = queries.getTicketByChannel.get(channel.id);
  if (saved) return saved;
  const match = channel.topic?.match(/\((\d{17,22})\)/);
  if (!match || !channel.name?.startsWith("schematic-")) return null;
  const now = Date.now();
  queries.createTicketOrIgnore.run(channel.guild.id, channel.id, match[1], now);
  const ticket = queries.getTicketByChannel.get(channel.id);
  if (ticket && !queries.getSubmissionByTicket.get(ticket.id)) {
    queries.createSubmission.run(ticket.id, null, null, null, null, null, now, now);
  }
  return ticket;
}

function formatBlock(text) {
  return text?.trim() || "_Not provided_";
}

function buildSubmissionInfoEmbed(submission, creatorId) {
  return new EmbedBuilder()
    .setColor(brand.gold)
    .setTitle(submission?.schematic_name || "Schematic Information")
    .setDescription(
      [
        `**Designers**\n${formatBlock(submission?.designers || `<@${creatorId}>`)}`,
        `**Credits**\n${formatBlock(submission?.credits)}`,
        `**Rates**\n${formatBlock(submission?.rates)}`,
        `**Stats**\n${formatBlock(submission?.stats)}`,
        `**Positives**\n${formatBlock(submission?.positives)}`,
        `**Negatives**\n${formatBlock(submission?.negatives)}`,
        `**Instructions**\n${formatBlock(submission?.instructions)}`
      ].join("\n\n")
    )
    .setFooter({ text: "Updates automatically when ticket information changes." })
    .setTimestamp();
}

function buildRenderedSubmissionEmbed(submission, creatorId) {
  return new EmbedBuilder()
    .setColor(brand.gold)
    .setTitle(submission?.schematic_name || "Schematic Submission")
    .setDescription(
      [
        `**Designers**\n${formatBlock(submission?.designers || `<@${creatorId}>`)}`,
        `**Credits**\n${formatBlock(submission?.credits)}`,
        `**Rates**\n${formatBlock(submission?.rates)}`,
        `**Stats**\n${formatBlock(submission?.stats)}`,
        `**Positives**\n${formatBlock(submission?.positives)}`,
        `**Negatives**\n${formatBlock(submission?.negatives)}`,
        `**Instructions**\n${formatBlock(submission?.instructions)}`,
        `**Size & Volume**\nSize: \`${submission?.width || 0} x ${submission?.height || 0} x ${submission?.length || 0}\`\nVolume: \`${submission?.non_air_volume || 0}/${submission?.bounding_volume || 0}\``
      ].join("\n\n")
    )
    .setImage("attachment://render.png")
    .setTimestamp();
}

function newestMessage(messages) {
  return [...messages.values()].sort((left, right) => {
    const timeDiff = right.createdTimestamp - left.createdTimestamp;
    if (timeDiff !== 0) return timeDiff;
    return BigInt(right.id) > BigInt(left.id) ? 1 : -1;
  })[0];
}

async function findSubmissionInfoMessages(channel) {
  const recent = await channel.messages.fetch({ limit: 100 });
  return recent.filter((message) => {
    const embed = message.embeds?.[0];
    return (
      message.author.id === channel.client.user.id &&
      embed?.footer?.text === "Updates automatically when ticket information changes."
    );
  });
}

async function cleanupSubmissionInfoMessages(channel) {
  const messages = await findSubmissionInfoMessages(channel);
  if (messages.size === 0) return null;
  const keep = newestMessage(messages);
  const stale = messages.filter((message) => message.id !== keep.id);
  await Promise.all(stale.map((message) => message.delete().catch(() => {})));
  return keep;
}

async function upsertSubmissionInfoMessage(channel, ticket) {
  const submission = queries.getSubmissionByTicket.get(ticket.id);
  const payload = {
    embeds: [buildSubmissionInfoEmbed(submission, ticket.creator_id)]
  };
  const key = `ticketInfoMessage:${ticket.id}`;
  const saved = queries.getSetting.get(key)?.value;
  let existing = null;

  if (saved) {
    existing = await channel.messages.fetch(saved).catch(() => null);
  }

  if (!existing) {
    existing = await cleanupSubmissionInfoMessages(channel);
  }

  if (existing) {
    await existing.edit(payload);
    queries.setSetting.run(key, existing.id);
    setTimeout(() => {
      cleanupSubmissionInfoMessages(channel).catch((error) =>
        logger.warn("Delayed submission info cleanup failed", { error: error.message })
      );
    }, 2500);
    return existing;
  }

  const message = await channel.send(payload);
  queries.setSetting.run(key, message.id);
  setTimeout(() => {
    cleanupSubmissionInfoMessages(channel).catch((error) =>
      logger.warn("Delayed submission info cleanup failed", { error: error.message })
    );
  }, 2500);
  return message;
}

async function updateRenderedSubmissionMessage(channel, ticket) {
  const submission = queries.getSubmissionByTicket.get(ticket.id);
  if (!submission?.render_path) return null;

  const key = `renderMessage:${ticket.id}`;
  const saved = queries.getSetting.get(key)?.value;
  if (!saved) return null;

  const message = await channel.messages.fetch(saved).catch(() => null);
  if (!message) return null;

  try {
    const file = new AttachmentBuilder(submission.render_path, { name: "render.png" });
    await message.edit({
      embeds: [buildRenderedSubmissionEmbed(submission, ticket.creator_id)],
      files: [file]
    });
    return message;
  } catch (error) {
    logger.warn("Rendered submission message could not be refreshed", {
      ticketId: ticket.id,
      error: error.message
    });
    return null;
  }
}

async function createTicket(interaction) {
  const now = Date.now();
  const last = cooldowns.get(interaction.user.id) || 0;
  if (now - last < config.ticketCooldownSeconds * 1000) {
    await interaction.reply({
      content: "Please wait before creating another submission ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const existing = queries.getOpenTicketByCreator.get(interaction.user.id);
  if (existing) {
    const existingChannel = await interaction.guild.channels
      .fetch(existing.channel_id)
      .catch(() => null);
    if (!existingChannel) {
      queries.closeTicket.run(Date.now(), existing.channel_id);
    } else {
    await interaction.reply({
      content: `You already have an open ticket: <#${existing.channel_id}>`,
      flags: MessageFlags.Ephemeral
    });
    return;
    }
  }

  const guild = interaction.guild;
  const existingDiscordChannel = await findOpenTicketChannel(guild, interaction.user.id);
  if (existingDiscordChannel) {
    await interaction.reply({
      content: `You already have an open ticket: <#${existingDiscordChannel.id}>`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const channelName = `schematic-${cleanChannelName(interaction.user.username)}`;
  const overwrites = buildTicketOverwrites(guild, interaction.user.id);
  const category = await createTicketCategory(guild, interaction.user, overwrites);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category?.id || config.categoryId || undefined,
    permissionOverwrites: overwrites,
    topic: `Schematic ticket for ${interaction.user.tag} (${interaction.user.id})`
  });

  const ticketResult = queries.createTicket.run(
    guild.id,
    channel.id,
    interaction.user.id,
    now
  );
  const ticketId = Number(ticketResult.lastInsertRowid);

  queries.createSubmission.run(
    ticketId,
    null,
    null,
    null,
    null,
    null,
    now,
    now
  );

  cooldowns.set(interaction.user.id, now);

  const embed = new EmbedBuilder()
    .setColor(brand.gold)
    .setTitle("Schematic Submission")
    .setDescription(
      [
        `Welcome ${interaction.user}.`,
        "",
        "Click **Start Information** when you are ready to fill out schematic details.",
        "Use **Add Extra Details** after that for positives, negatives, and instructions.",
        "Upload your `.litematic` file in this channel.",
        "The bot will parse the file, render an isometric preview, and generate the publish embed automatically."
      ].join("\n")
    )
    .setTimestamp();

  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [embed],
    components: [buildTicketControls()]
  });

  await interaction.reply({
    content: `Your submission ticket is ready: <#${channel.id}>`,
    flags: MessageFlags.Ephemeral
  });
}

async function saveMainSubmission(interaction) {
  const ticket = ticketFromChannel(interaction.channel);
  if (!ticket) {
    await interaction.reply({
      content: "This modal can only be submitted inside a schematic ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.user.id !== ticket.creator_id && !isStaff(interaction.member)) {
    await interaction.reply({
      content: "Only the ticket creator or staff can edit submission details.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const now = Date.now();
  const submission = queries.getSubmissionByTicket.get(ticket.id);
  if (submission) {
    queries.updateSubmissionMain.run(
      optionalField(interaction, "schematicName"),
      optionalField(interaction, "designers"),
      optionalField(interaction, "credits"),
      optionalField(interaction, "rates"),
      optionalField(interaction, "stats"),
      now,
      ticket.id
    );
  } else {
    queries.createSubmission.run(
      ticket.id,
      optionalField(interaction, "schematicName"),
      optionalField(interaction, "designers"),
      optionalField(interaction, "credits"),
      optionalField(interaction, "rates"),
      optionalField(interaction, "stats"),
      now,
      now
    );
  }

  await upsertSubmissionInfoMessage(interaction.channel, ticket);
  await updateRenderedSubmissionMessage(interaction.channel, ticket);
  await interaction.reply({
    content: "Schematic information saved. Use **Add Extra Details** for positives, negatives, and instructions.",
    flags: MessageFlags.Ephemeral
  });
}

async function handleButton(interaction, renderQueue) {
  if (interaction.customId === ids.startSubmission) {
    await createTicket(interaction);
    return;
  }

  const ticket = ticketFromChannel(interaction.channel);
  if (!ticket) {
    await interaction.reply({
      content: "This button only works inside a schematic ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.customId === ids.information) {
    if (interaction.user.id !== ticket.creator_id && !isStaff(interaction.member)) {
      await interaction.reply({
        content: "Only the ticket creator or staff can edit submission details.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.showModal(buildMainSubmissionModal());
    return;
  }

  if (interaction.customId === ids.detailsContinue) {
    if (interaction.user.id !== ticket.creator_id && !isStaff(interaction.member)) {
      await interaction.reply({
        content: "Only the ticket creator or staff can edit submission details.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.showModal(buildDetailsSubmissionModal(ticket.id));
    return;
  }

  if (interaction.customId === ids.claimTicket) {
    if (!isStaff(interaction.member)) {
      await interaction.reply({
        content: "Only staff can claim tickets.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    queries.claimTicket.run(interaction.user.id, interaction.channelId);
    await interaction.reply(`${interaction.user} claimed this ticket.`);
    return;
  }

  if (interaction.customId === ids.closeTicket) {
    if (interaction.user.id !== ticket.creator_id && !isStaff(interaction.member)) {
      await interaction.reply({
        content: "Only the ticket creator or staff can close this ticket.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    queries.closeTicket.run(Date.now(), interaction.channelId);
    await interaction.reply("Ticket closed. This channel will be deleted in 10 seconds.");
    setTimeout(() => deleteTicketChannelAndCategory(interaction.channel), 10000);
    return;
  }

  logger.warn("Unhandled button interaction", { customId: interaction.customId });
}

async function handleModal(interaction) {
  if (interaction.customId === modalIds.submissionMain) {
    await saveMainSubmission(interaction);
    return;
  }

  if (interaction.customId.startsWith(`${modalIds.submissionDetails}:`)) {
    const ticketId = Number(interaction.customId.split(":").at(-1));
    const ticket = ticketFromChannel(interaction.channel);
    if (!ticket || ticket.id !== ticketId) {
      await interaction.reply({
        content: "This modal can only be submitted inside its ticket.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (interaction.user.id !== ticket.creator_id && !isStaff(interaction.member)) {
      await interaction.reply({
        content: "Only the ticket creator or staff can edit submission details.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    queries.updateSubmissionDetails.run(
      optionalField(interaction, "positives"),
      optionalField(interaction, "negatives"),
      optionalField(interaction, "instructions"),
      Date.now(),
      ticketId
    );
    await upsertSubmissionInfoMessage(interaction.channel, ticket);
    await updateRenderedSubmissionMessage(interaction.channel, ticket);
    await interaction.reply({
      content: "Extra schematic details saved.",
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleCommand(interaction, renderQueue) {
  if (interaction.commandName === "panel-refresh") {
    await refreshPanel(interaction.client);
    await interaction.reply({
      content: "Publish Schematic panel refreshed.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.commandName === "ticket-close") {
    const ticket = ticketFromChannel(interaction.channel);
    if (!ticket) {
      await interaction.reply({
        content: "This is not a schematic ticket channel.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    queries.closeTicket.run(Date.now(), interaction.channelId);
    await interaction.reply("Ticket closed. This channel will be deleted in 10 seconds.");
    setTimeout(() => deleteTicketChannelAndCategory(interaction.channel), 10000);
    return;
  }

  if (interaction.commandName === "render-status") {
    await interaction.reply({
      content: renderQueue.statusText(),
      flags: MessageFlags.Ephemeral
    });
  }
}

export async function handleInteraction(interaction, renderQueue) {
  try {
    if (interaction.isButton()) return await handleButton(interaction, renderQueue);
    if (interaction.isModalSubmit()) return await handleModal(interaction);
    if (interaction.isChatInputCommand()) {
      return await handleCommand(interaction, renderQueue);
    }
  } catch (error) {
    logger.error("Interaction failed", error, {
      customId: interaction.customId,
      commandName: interaction.commandName
    });
    const payload = {
      content: "Something went wrong. Staff have been notified in the logs.",
      flags: MessageFlags.Ephemeral
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}
