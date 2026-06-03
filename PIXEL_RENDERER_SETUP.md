# Pixel Renderer Setup

The JavaScript renderer can get close, but it cannot be pixel-identical to a Minecraft render mod. For that, the bot now supports a Minecraft renderer worker:

```text
Discord bot on Railway -> renderer-worker HTTP server -> Fabric bridge mod -> Simple Image Renderer -> PNG
```

The important part is that every schematic block is placed into a real Minecraft client world, and the installed Simple Image Renderer mod renders that actual world region.

## 1. Start The Worker

On the PC that will run Minecraft:

```powershell
cd C:\Users\ddum1\Documents\Codex\2026-05-26\how-do-i-link-my-github\renderer-worker
npm install
$env:RENDER_WORKER_TOKEN="make-a-long-random-password"
$env:RENDER_WORKER_JOBS_DIR="C:\Users\ddum1\Documents\Codex\schematic-render-jobs"
npm start
```

## 2. Expose It To Railway

Railway needs a public URL to reach the worker. Use a tunnel or a VPS.

Set these Railway variables:

```env
RENDER_WORKER_URL=https://your-public-worker-url
RENDER_WORKER_TOKEN=make-a-long-random-password
RENDER_ALLOW_JS_FALLBACK=false
RENDER_WORKER_TIMEOUT_MS=1800000
```

`RENDER_ALLOW_JS_FALLBACK=false` is important. If the Minecraft renderer is offline, the bot should fail clearly instead of posting a lower-quality fake render.

## 3. Build The Fabric Bridge

I already copied your installed Simple Image Renderer jar into:

```text
C:\Users\ddum1\Documents\Codex\2026-05-26\how-do-i-link-my-github\renderer-bridge-fabric\libs\simple-image-renderer-1.1.0+1.21.11.jar
```

The bridge has also already been built successfully. The jar is here:

```text
C:\Users\ddum1\Documents\Codex\2026-05-26\how-do-i-link-my-github\renderer-bridge-fabric\build\libs\schematic-render-bridge-1.0.0.jar
```

And I copied it into your Modrinth profile:

```text
C:\Users\ddum1\AppData\Roaming\ModrinthApp\profiles\1.21.11\mods\schematic-render-bridge-1.0.0.jar
```

If you edit the bridge later, rebuild it with:

```powershell
cd C:\Users\ddum1\Documents\Codex\2026-05-26\how-do-i-link-my-github\renderer-bridge-fabric
.\gradlew.bat build
```

## 4. Run Minecraft

Open the Modrinth profile that has:

- Fabric API
- Litematica
- MaLiLib
- Simple Image Renderer
- Schematic Render Bridge

Open a singleplayer world and stand somewhere with room nearby. The bridge places schematics near your player, renders them, and clears them after output.

Launch Minecraft with this JVM property so the bridge and worker use the same job folder:

```text
-Dschematic.render.jobs=C:\Users\ddum1\Documents\Codex\schematic-render-jobs
```

## 5. Test

Use Discord:

```text
/render schematic:<upload a .litematic>
```

If it works, ticket uploads will use the same renderer automatically.
