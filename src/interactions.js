import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import { config } from "./config.js";
import { queries } from "./database/db.js";
import { ids, buildTicketControls, refreshPanel } from "./panel.js";
import {
  buildDetailsSubmissionModal,
  buildMainSubmissionModal,
  modalIds
} from "./modals.js";
import { logger } from "./logger.js";

const cooldowns = new Map();

function optionalField(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
}

function field(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
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
    await interaction.reply({
      content: `You already have an open ticket: <#${existing.channel_id}>`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const guild = interaction.guild;
  const channelName = `schematic-${cleanChannelName(interaction.user.username)}`;
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
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

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.categoryId || undefined,
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
    .setColor(0x2ecc71)
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
  const ticket = queries.getTicketByChannel.get(interaction.channelId);
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
      field(interaction, "schematicName"),
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
      field(interaction, "schematicName"),
      optionalField(interaction, "designers"),
      optionalField(interaction, "credits"),
      optionalField(interaction, "rates"),
      optionalField(interaction, "stats"),
      now,
      now
    );
  }

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

  const ticket = queries.getTicketByChannel.get(interaction.channelId);
  if (!ticket) {
    await interaction.reply({
      content: "This button only works inside a schematic ticket.",
      flags: MessageFlags.Ephemeral
    });
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
    setTimeout(() => interaction.channel.delete("Ticket closed").catch(() => {}), 10000);
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
    queries.updateSubmissionDetails.run(
      field(interaction, "positives"),
      field(interaction, "negatives"),
      field(interaction, "instructions"),
      Date.now(),
      ticketId
    );
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
    const ticket = queries.getTicketByChannel.get(interaction.channelId);
    if (!ticket) {
      await interaction.reply({
        content: "This is not a schematic ticket channel.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    queries.closeTicket.run(Date.now(), interaction.channelId);
    await interaction.reply("Ticket closed. This channel will be deleted in 10 seconds.");
    setTimeout(() => interaction.channel.delete("Ticket closed").catch(() => {}), 10000);
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
