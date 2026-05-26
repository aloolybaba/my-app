import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import extract from "extract-zip";
import { logger } from "../logger.js";

function findZipCandidates(textureRoot) {
  const root = process.cwd();
  return [
    path.join(root, textureRoot, "block.zip"),
    path.join(root, "assets", "resource-pack", "assets", "minecraft", "textures", "block.zip"),
    path.join(root, "block.zip")
  ];
}

async function downloadZip(url, outputPath) {
  if (!url || String(url).toLowerCase() === "false") return null;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Texture zip download failed: HTTP ${response.status}`);
  }
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(outputPath, buffer);
  return outputPath;
}

async function hasPngFiles(dir) {
  try {
    const entries = await fsp.readdir(dir);
    return entries.some((entry) => entry.toLowerCase().endsWith(".png"));
  } catch {
    return false;
  }
}

async function findPngDirectory(dir, depth = 0) {
  if (depth > 8) return null;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))) {
    return dir;
  }

  const preferred = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => {
      const leftScore = left.name === "block" || left.name === "textures" ? -1 : 0;
      const rightScore = right.name === "block" || right.name === "textures" ? -1 : 0;
      return leftScore - rightScore;
    });

  for (const entry of preferred) {
    const found = await findPngDirectory(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function flattenPngDirectory(sourceDir, targetDir) {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) return;
  const entries = await fsp.readdir(sourceDir);
  await Promise.all(
    entries
      .filter((entry) => entry.toLowerCase().endsWith(".png"))
      .map((entry) =>
        fsp.copyFile(path.join(sourceDir, entry), path.join(targetDir, entry))
      )
  );
}

export async function prepareResourcePack(textureRoot, textureZipUrl) {
  const targetDir = path.resolve(process.cwd(), textureRoot);
  if (await hasPngFiles(targetDir)) {
    logger.info("Texture folder ready", { targetDir });
    return;
  }

  let zipPath = findZipCandidates(textureRoot).find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!zipPath) {
    const downloadedZip = path.join(process.cwd(), "data", "resource-pack.zip");
    try {
      zipPath = await downloadZip(textureZipUrl, downloadedZip);
      if (zipPath) {
        logger.info("Downloaded texture zip", { zipPath, textureZipUrl });
      }
    } catch (error) {
      logger.warn("Texture zip download failed; renderer will use fallback materials.", {
        error: error.message,
        textureZipUrl,
        targetDir
      });
      return;
    }
  }

  if (!zipPath) {
    logger.warn("No block textures found; renderer will use generated fallback materials.", {
      targetDir
    });
    return;
  }

  await fsp.mkdir(targetDir, { recursive: true });
  await extract(zipPath, { dir: targetDir });

  if (!(await hasPngFiles(targetDir))) {
    const pngDir = await findPngDirectory(targetDir);
    if (pngDir) {
      await flattenPngDirectory(pngDir, targetDir);
    }
  }

  if (!(await hasPngFiles(targetDir))) {
    logger.warn("Texture zip was found, but no PNG block textures were inside it.", {
      zipPath,
      targetDir
    });
    return;
  }

  logger.info("Extracted block texture zip", { zipPath, targetDir });
}
