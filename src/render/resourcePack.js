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

async function hasPngFiles(dir) {
  try {
    const entries = await fsp.readdir(dir);
    return entries.some((entry) => entry.toLowerCase().endsWith(".png"));
  } catch {
    return false;
  }
}

export async function prepareResourcePack(textureRoot) {
  const targetDir = path.resolve(process.cwd(), textureRoot);
  if (await hasPngFiles(targetDir)) {
    logger.info("Texture folder ready", { targetDir });
    return;
  }

  const zipPath = findZipCandidates(textureRoot).find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!zipPath) {
    logger.warn("No block textures found; renderer will use generated fallback materials.", {
      targetDir
    });
    return;
  }

  await fsp.mkdir(targetDir, { recursive: true });
  await extract(zipPath, { dir: targetDir });

  const nestedBlockDir = path.join(targetDir, "block");
  if (fs.existsSync(nestedBlockDir) && !(await hasPngFiles(targetDir))) {
    const entries = await fsp.readdir(nestedBlockDir);
    await Promise.all(
      entries.map((entry) =>
        fsp.rename(path.join(nestedBlockDir, entry), path.join(targetDir, entry))
      )
    );
    await fsp.rm(nestedBlockDir, { recursive: true, force: true });
  }

  logger.info("Extracted block texture zip", { zipPath, targetDir });
}
