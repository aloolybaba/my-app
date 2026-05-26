[README.md](https://github.com/user-attachments/files/28262121/README.md)
# Publish Schematic Discord Bot

A Node.js + discord.js v14 ticket bot for schematic submissions. It creates a professional publish panel, private ticket channels, two-step modals for submission metadata, SQLite storage, `.litematic` upload detection, duplicate upload prevention, and a worker-thread isometric renderer.

## Important Discord Limitation

Discord modals only allow 5 text inputs per modal. This bot keeps all 8 requested fields by splitting the form into:

1. Schematic Name, Designers, Credits, Rates, Stats
2. Positives, Negatives, Instructions

## Setup

1. Copy `config.example.json` to `config.json`.
2. Fill `guildId`, `staffRoleIds`, and optionally `categoryId`.
3. In Railway variables, add:

```txt
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_server_id
PANEL_CHANNEL_ID=1508792877701140521
STAFF_ROLE_IDS=role_id_1,role_id_2
CATEGORY_ID=optional_category_id
```

4. Install locally if testing:

```bash
npm install
npm run commands
npm start
```

Railway will run `npm start`.

## Discord Permissions

Invite the bot with:

- `bot`
- `applications.commands`

Recommended bot permissions:

- Manage Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Use Slash Commands
- Manage Messages

## Minecraft Textures

The renderer supports real Minecraft/resource-pack block textures. Put PNG files here:

```txt
assets/resource-pack/assets/minecraft/textures/block
```

For example:

```txt
stone.png
oak_planks.png
redstone_block.png
```

If a texture is missing, the renderer falls back to a material color so the job still completes. For best “Isometric Renders mod” style output, provide a full vanilla or custom resource-pack texture folder.

## Commands

- `/panel-refresh` - refreshes the Publish Schematic panel
- `/ticket-close` - closes the current ticket
- `/render-status` - shows render queue status

## Files

```txt
src/index.js
src/config.js
src/database/db.js
src/database/init.js
src/deployCommands.js
src/panel.js
src/interactions.js
src/uploads.js
src/render/queue.js
src/render/worker.js
src/render/litematic.js
src/render/isometric.js
src/render/textures.js
schema.sql
```
