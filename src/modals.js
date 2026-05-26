import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

export const modalIds = {
  submissionMain: "schematic:modal:main",
  submissionDetails: "schematic:modal:details"
};

function input(id, label, style = TextInputStyle.Paragraph, required = true) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setMaxLength(style === TextInputStyle.Short ? 120 : 1800)
  );
}

export function buildMainSubmissionModal() {
  return new ModalBuilder()
    .setCustomId(modalIds.submissionMain)
    .setTitle("Publish Schematic")
    .addComponents(
      input("schematicName", "Schematic Name", TextInputStyle.Short),
      input("designers", "Designers"),
      input("credits", "Credits"),
      input("rates", "Rates"),
      input("stats", "Stats")
    );
}

export function buildDetailsSubmissionModal(ticketId) {
  return new ModalBuilder()
    .setCustomId(`${modalIds.submissionDetails}:${ticketId}`)
    .setTitle("Extra Schematic Details")
    .addComponents(
      input("positives", "Positives"),
      input("negatives", "Negatives"),
      input("instructions", "Instructions")
    );
}
