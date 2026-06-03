const REQUIRED_ENV = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'PANEL_CHANNEL_ID',
  'STAFF_ROLE_IDS',
  'LOGS_CHANNEL_ID',
  'TRANSCRIPTS_CHANNEL_ID',
  'CREATE_TICKET_CATEGORIES',
  'TICKET_CATEGORY_NAME',
];

export function loadEnv() {
  process.env.CREATE_TICKET_CATEGORIES ??= 'false';
  process.env.TICKET_CATEGORY_NAME ??= 'Schematic Tickets';

  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const staffRoleIds = process.env.STAFF_ROLE_IDS.split(',').map(id => id.trim()).filter(Boolean);
  if (!staffRoleIds.length) throw new Error('STAFF_ROLE_IDS must contain at least one role ID');

  return {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    panelChannelId: process.env.PANEL_CHANNEL_ID,
    staffRoleIds,
    logsChannelId: process.env.LOGS_CHANNEL_ID,
    transcriptsChannelId: process.env.TRANSCRIPTS_CHANNEL_ID,
    createTicketCategories: process.env.CREATE_TICKET_CATEGORIES === 'true',
    ticketCategoryName: process.env.TICKET_CATEGORY_NAME,
  };
}

export function getStaffRoleIds() {
  return process.env.STAFF_ROLE_IDS.split(',').map(id => id.trim()).filter(Boolean);
}
