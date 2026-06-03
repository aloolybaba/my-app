# Minecraft Renderer Worker

This worker is the HTTP side of the pixel-accurate renderer.

The Discord bot sends a `.litematic` here. The worker parses every block into exact Minecraft blockstate strings and creates a job folder. The Fabric bridge mod running inside your Minecraft profile watches that folder, places each block into a real Minecraft world, asks Simple Image Renderer to render the region, and writes `output.png`.

## Run

```bash
cd renderer-worker
npm install
set RENDER_WORKER_TOKEN=make-a-long-random-password
set RENDER_WORKER_JOBS_DIR=C:\Users\ddum1\Documents\Codex\schematic-render-jobs
npm start
```

Expose the worker to Railway with a tunnel or VPS URL, then set these Railway variables:

```env
RENDER_WORKER_URL=https://your-worker-url
RENDER_WORKER_TOKEN=the-same-password
RENDER_ALLOW_JS_FALLBACK=false
RENDER_WORKER_TIMEOUT_MS=1800000
```
