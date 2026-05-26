import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config.json");

function readJsonConfig() {
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function csv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const fileConfig = readJsonConfig();

export const config = {
  token: process.env.DISCORD_TOKEN || fileConfig.token,
  clientId: process.env.DISCORD_CLIENT_ID || fileConfig.clientId,
  guildId: process.env.DISCORD_GUILD_ID || fileConfig.guildId,
  panelChannelId:
    process.env.PANEL_CHANNEL_ID ||
    fileConfig.panelChannelId ||
    "1508792877701140521",
  staffRoleIds:
    csv(process.env.STAFF_ROLE_IDS).length > 0
      ? csv(process.env.STAFF_ROLE_IDS)
      : fileConfig.staffRoleIds || [],
  categoryId: process.env.CATEGORY_ID || fileConfig.categoryId || null,
  minecraftVersion:
    process.env.MINECRAFT_VERSION || fileConfig.minecraftVersion || "1.20.4",
  maxConcurrentRenderJobs: Number(
    process.env.MAX_RENDER_JOBS || fileConfig.maxConcurrentRenderJobs || 2
  ),
  ticketCooldownSeconds: Number(
    process.env.TICKET_COOLDOWN_SECONDS || fileConfig.ticketCooldownSeconds || 60
  ),
  maxUploadBytes: Number(
    process.env.MAX_UPLOAD_BYTES || fileConfig.maxUploadBytes || 50 * 1024 * 1024
  ),
  textureRoot:
    process.env.TEXTURE_ROOT ||
    fileConfig.textureRoot ||
    "assets/resource-pack/assets/minecraft/textures/block"
};

export function validateConfig() {
  const missing = [];
  if (!config.token) missing.push("DISCORD_TOKEN");
  if (!config.clientId) missing.push("DISCORD_CLIENT_ID");
  if (!config.guildId) missing.push("DISCORD_GUILD_ID");
  if (!config.panelChannelId) missing.push("PANEL_CHANNEL_ID");
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }
}
