# Crackers Schematics Bot

Discord.js v14 bot for schematic submission tickets and `.litematic` rendering.

## Railway Setup

Add these variables in Railway:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
PANEL_CHANNEL_ID=
STAFF_ROLE_IDS=
LOGS_CHANNEL_ID=
TRANSCRIPTS_CHANNEL_ID=
CREATE_TICKET_CATEGORIES=false
TICKET_CATEGORY_NAME=Schematic Tickets
```

`STAFF_ROLE_IDS` can be one role ID or multiple IDs separated by commas.

## Deploy

Railway will use the included `Dockerfile` and `railway.toml`.

The Dockerfile uses `node:20-bookworm-slim` because `canvas` is much more reliable on Debian-based images than Alpine.

After deployment, register slash commands once:

```bash
npm run deploy
```

Then start the bot:

```bash
npm start
```

On Railway, the start command is already configured as:

```bash
node src/index.js
```

## Bot Permissions

Invite the bot with permissions for:

- Manage Channels
- View Channels
- Send Messages
- Attach Files
- Read Message History
- Manage Messages
- Use Slash Commands

The bot also needs the `Message Content Intent` enabled in the Discord Developer Portal because it watches ticket channels for `.litematic` uploads.
