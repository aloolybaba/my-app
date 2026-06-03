import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

function normalizeWorkerUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

export function remoteRendererEnabled() {
  return normalizeWorkerUrl(config.renderWorkerUrl).length > 0;
}

export async function renderWithRemoteRenderer(inputPath, outputPath) {
  const baseUrl = normalizeWorkerUrl(config.renderWorkerUrl);
  if (!baseUrl) {
    throw new Error("RENDER_WORKER_URL is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1000, config.renderWorkerTimeoutMs)
  );

  try {
    const fileBuffer = await fs.readFile(inputPath);
    const response = await fetch(`${baseUrl}/render`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.renderWorkerToken
          ? { Authorization: `Bearer ${config.renderWorkerToken}` }
          : {})
      },
      body: JSON.stringify({
        filename: path.basename(inputPath),
        schematicBase64: fileBuffer.toString("base64")
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Minecraft renderer returned HTTP ${response.status}${text ? `: ${text}` : ""}`
      );
    }

    const payload = await response.json();
    if (!payload?.imageBase64) {
      throw new Error("Minecraft renderer response did not include imageBase64.");
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(payload.imageBase64, "base64"));

    return {
      size: payload.size,
      nonAirVolume: payload.nonAirVolume,
      boundingVolume: payload.boundingVolume,
      renderer: payload.renderer || "minecraft-simple-image-renderer",
      jobId: payload.jobId
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Minecraft renderer timed out after ${Math.round(
          config.renderWorkerTimeoutMs / 1000
        )} seconds.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
