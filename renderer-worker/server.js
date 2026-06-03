import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLitematic } from "./litematic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.RENDER_WORKER_PORT || 8787);
const token = process.env.RENDER_WORKER_TOKEN || "";
const jobsDir = path.resolve(
  process.env.RENDER_WORKER_JOBS_DIR || path.join(__dirname, "jobs")
);
const requestLimitBytes = Number(
  process.env.RENDER_WORKER_MAX_BODY_BYTES || 120 * 1024 * 1024
);
const jobTimeoutMs = Number(process.env.RENDER_WORKER_JOB_TIMEOUT_MS || 25 * 60 * 1000);
const pollMs = Number(process.env.RENDER_WORKER_POLL_MS || 1000);

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function unauthorized(req) {
  if (!token) return false;
  const header = req.headers.authorization || "";
  return header !== `Bearer ${token}`;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > requestLimitBytes) {
      throw new Error(`Request body is too large. Limit is ${requestLimitBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function blockStateString(block) {
  const name = block.name.includes(":") ? block.name : `minecraft:${block.name}`;
  const entries = Object.entries(block.properties || {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (entries.length === 0) return name;
  return `${name}[${entries.map(([key, value]) => `${key}=${value}`).join(",")}]`;
}

function serializeBlocks(schematic) {
  const { minX, minY, minZ } = schematic.bounds;
  return schematic.blocks.map((block) => ({
    x: block.x - minX,
    y: block.y - minY,
    z: block.z - minZ,
    state: blockStateString(block)
  }));
}

async function waitForJob(jobDir, startedAt) {
  const statusPath = path.join(jobDir, "status.json");
  const outputPath = path.join(jobDir, "output.png");

  while (Date.now() - startedAt < jobTimeoutMs) {
    const status = await readJson(statusPath).catch(() => null);
    if (status?.status === "done") {
      if (!(await exists(outputPath))) {
        throw new Error("Bridge marked job done but output.png was not written.");
      }
      return {
        status,
        imageBuffer: await fs.readFile(outputPath)
      };
    }
    if (status?.status === "error") {
      throw new Error(status.error || "Bridge renderer failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  await writeJson(statusPath, {
    status: "error",
    error: `Renderer bridge timed out after ${Math.round(jobTimeoutMs / 1000)} seconds.`,
    updatedAt: new Date().toISOString()
  }).catch(() => {});
  throw new Error(`Renderer bridge timed out after ${Math.round(jobTimeoutMs / 1000)} seconds.`);
}

async function handleRender(req, res) {
  if (unauthorized(req)) {
    json(res, 401, { error: "Unauthorized renderer request." });
    return;
  }

  const body = await readJsonBody(req);
  if (!body?.schematicBase64) {
    json(res, 400, { error: "Missing schematicBase64." });
    return;
  }

  const inputBuffer = Buffer.from(body.schematicBase64, "base64");
  const jobId = `${Date.now()}-${crypto
    .createHash("sha256")
    .update(inputBuffer)
    .digest("hex")
    .slice(0, 16)}`;
  const jobDir = path.join(jobsDir, jobId);
  const inputPath = path.join(jobDir, "input.litematic");
  const blocksPath = path.join(jobDir, "blocks.json");
  const statusPath = path.join(jobDir, "status.json");
  const startedAt = Date.now();

  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(inputPath, inputBuffer);

  const schematic = await parseLitematic(inputPath);
  await writeJson(blocksPath, {
    jobId,
    filename: body.filename || "schematic.litematic",
    bounds: schematic.bounds,
    size: schematic.size,
    nonAirVolume: schematic.nonAirVolume,
    boundingVolume: schematic.boundingVolume,
    blocks: serializeBlocks(schematic),
    settings: {
      width: Number(body.width || process.env.RENDER_IMAGE_WIDTH || 1024),
      height: Number(body.height || process.env.RENDER_IMAGE_HEIGHT || 1024),
      renderEdge: body.renderEdge ?? true,
      ignoreLighting: body.ignoreLighting ?? false,
      cleanup: body.cleanup ?? true
    }
  });

  await writeJson(statusPath, {
    status: "pending",
    jobId,
    filename: body.filename || "schematic.litematic",
    createdAt: new Date(startedAt).toISOString()
  });

  const { imageBuffer } = await waitForJob(jobDir, startedAt);
  json(res, 200, {
    ok: true,
    renderer: "minecraft-simple-image-renderer",
    jobId,
    size: schematic.size,
    nonAirVolume: schematic.nonAirVolume,
    boundingVolume: schematic.boundingVolume,
    imageBase64: imageBuffer.toString("base64")
  });
}

async function handleRequest(req, res) {
  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, {
        ok: true,
        jobsDir,
        bridge: "waiting-for-fabric-bridge"
      });
      return;
    }

    if (req.method === "POST" && req.url === "/render") {
      await handleRender(req, res);
      return;
    }

    json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message });
  }
}

await fs.mkdir(jobsDir, { recursive: true });
http.createServer(handleRequest).listen(port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "Minecraft renderer worker listening",
      port,
      jobsDir
    })
  );
});
