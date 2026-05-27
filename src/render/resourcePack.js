import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import extract from "extract-zip";
import { logger } from "../logger.js";

const githubTextureSource = {
  owner: "InventivetalentDev",
  repo: "minecraft-assets",
  branch: "26.1.2",
  blockPath: "assets/minecraft/textures/block/",
  blockstatesPath: "assets/minecraft/blockstates/",
  blockModelsPath: "assets/minecraft/models/block/"
};

const criticalTextureFiles = [
  "furnace_side.png",
  "furnace_top.png",
  "hopper_outside.png",
  "hopper_inside.png",
  "hopper_top.png",
  "observer_side.png",
  "observer_front.png",
  "observer_top.png",
  "dispenser_front.png",
  "dispenser_front_vertical.png",
  "dropper_front.png",
  "dropper_front_vertical.png",
  "piston_side.png",
  "piston_top.png",
  "piston_bottom.png",
  "piston_inner.png",
  "redstone_dust_dot.png",
  "redstone_dust_line0.png",
  "redstone_dust_line1.png",
  "redstone_dust_overlay.png",
  "redstone_torch.png",
  "redstone_torch_off.png",
  "iron_bars.png",
  "smooth_stone.png",
  "repeater.png",
  "repeater_on.png",
  "comparator.png",
  "comparator_on.png"
];

const minimumTextureCount = 500;

const criticalModelFiles = [
  ["blockstates", "hopper.json"],
  ["blockstates", "observer.json"],
  ["blockstates", "dispenser.json"],
  ["blockstates", "dropper.json"],
  ["blockstates", "piston.json"],
  ["blockstates", "sticky_piston.json"],
  ["blockstates", "repeater.json"],
  ["blockstates", "comparator.json"],
  ["blockstates", "redstone_wire.json"],
  ["models", "block", "hopper.json"],
  ["models", "block", "hopper_side.json"],
  ["models", "block", "observer.json"],
  ["models", "block", "dispenser.json"],
  ["models", "block", "dropper.json"],
  ["models", "block", "template_piston.json"],
  ["models", "block", "piston.json"],
  ["models", "block", "repeater_1tick.json"],
  ["models", "block", "comparator.json"],
  ["models", "block", "redstone_dust_dot.json"],
  ["models", "block", "redstone_dust_side.json"],
  ["models", "block", "redstone_dust_side_alt.json"],
  ["models", "block", "redstone_dust_side0.json"],
  ["models", "block", "redstone_dust_side_alt0.json"],
  ["models", "block", "redstone_dust_side1.json"],
  ["models", "block", "redstone_dust_side_alt1.json"],
  ["models", "block", "redstone_dust_up.json"],
  ["models", "block", "orientable.json"],
  ["models", "block", "orientable_vertical.json"]
];

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

async function countPngFiles(dir) {
  try {
    const entries = await fsp.readdir(dir);
    return entries.filter((entry) => entry.toLowerCase().endsWith(".png")).length;
  } catch {
    return 0;
  }
}

async function hasCriticalTextures(dir) {
  return criticalTextureFiles.every((file) => fs.existsSync(path.join(dir, file)));
}

async function hasModelFiles(textureRoot) {
  const minecraftRoot = path.resolve(process.cwd(), textureRoot, "..", "..");
  return criticalModelFiles.every((parts) => fs.existsSync(path.join(minecraftRoot, ...parts)));
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

function inferGithubBranch(textureZipUrl) {
  const value = String(textureZipUrl || "");
  const branchMatch =
    value.match(/\/heads\/(.+?)\.zip(?:$|\?)/) ||
    value.match(/\/tree\/([^/]+)(?:\/|$)/);
  return branchMatch?.[1] || githubTextureSource.branch;
}

function rawGithubUrl(owner, repo, branch, assetPath) {
  const encodedPath = assetPath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`;
}

function isDefaultGithubArchive(textureZipUrl) {
  return String(textureZipUrl || "").includes(
    "github.com/InventivetalentDev/minecraft-assets/archive"
  );
}

async function mapWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function downloadGithubRenderAssets(targetDir, textureZipUrl) {
  const branch = inferGithubBranch(textureZipUrl);
  const { owner, repo, blockPath, blockstatesPath, blockModelsPath } = githubTextureSource;
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const response = await fetch(treeUrl, {
    headers: {
      "User-Agent": "publish-schematic-bot"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub texture tree failed: HTTP ${response.status}`);
  }

  const body = await response.json();
  const assets = (body.tree || []).filter(
    (entry) =>
      entry.type === "blob" &&
      ((entry.path?.startsWith(blockPath) && entry.path.toLowerCase().endsWith(".png")) ||
        (entry.path?.startsWith(blockstatesPath) && entry.path.toLowerCase().endsWith(".json")) ||
        (entry.path?.startsWith(blockModelsPath) && entry.path.toLowerCase().endsWith(".json")))
  );

  if (assets.length === 0) {
    throw new Error("GitHub asset tree did not contain render assets.");
  }

  let saved = 0;
  await fsp.mkdir(targetDir, { recursive: true });
  await mapWithConcurrency(assets, 12, async (entry) => {
    const relative = entry.path.replace(/^assets\/minecraft\//, "");
    const output = entry.path.startsWith(blockPath)
      ? path.join(targetDir, path.basename(entry.path))
      : path.join(path.resolve(targetDir, "..", ".."), relative);
    if (fs.existsSync(output)) {
      saved += 1;
      return;
    }

    const asset = await fetch(rawGithubUrl(owner, repo, branch, entry.path), {
      headers: {
        "User-Agent": "publish-schematic-bot"
      }
    });
    if (!asset.ok) return;
    await fsp.mkdir(path.dirname(output), { recursive: true });
    await fsp.writeFile(output, Buffer.from(await asset.arrayBuffer()));
    saved += 1;
  });

  if (saved === 0) {
    throw new Error("GitHub render assets were found but none could be downloaded.");
  }

  logger.info("Downloaded render assets", {
    targetDir,
    branch,
    saved,
    available: assets.length
  });
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
  const texturesReady = await hasPngFiles(targetDir);
  const textureCount = await countPngFiles(targetDir);
  const criticalTexturesReady = texturesReady && (await hasCriticalTextures(targetDir));
  const modelsReady = await hasModelFiles(textureRoot);
  if (criticalTexturesReady && textureCount >= minimumTextureCount && modelsReady) {
    logger.info("Texture folder ready", { targetDir, textureCount });
    return;
  }

  if (texturesReady && (!modelsReady || !criticalTexturesReady || textureCount < minimumTextureCount)) {
    try {
      await downloadGithubRenderAssets(targetDir, textureZipUrl);
      const updatedTextureCount = await countPngFiles(targetDir);
      if (
        (await hasModelFiles(textureRoot)) &&
        (await hasCriticalTextures(targetDir)) &&
        updatedTextureCount >= minimumTextureCount
      ) {
        logger.info("Minecraft render assets ready", {
          targetDir,
          textureCount: updatedTextureCount
        });
        return;
      }
    } catch (error) {
      logger.warn("Minecraft render asset download failed; renderer will use fallbacks.", {
        error: error.message,
        targetDir
      });
    }
  }

  const zipPath = findZipCandidates(textureRoot).find((candidate) =>
    fs.existsSync(candidate)
  );

  if (zipPath) {
    await fsp.mkdir(targetDir, { recursive: true });
    await extract(zipPath, { dir: targetDir });

    if (!(await hasPngFiles(targetDir))) {
      const pngDir = await findPngDirectory(targetDir);
      if (pngDir) {
        await flattenPngDirectory(pngDir, targetDir);
      }
    }

    if (await hasPngFiles(targetDir)) {
      try {
        await downloadGithubRenderAssets(targetDir, textureZipUrl);
      } catch (error) {
        logger.warn("Minecraft model/blockstate download failed after texture zip extraction.", {
          error: error.message,
          targetDir
        });
      }
      logger.info("Extracted block texture zip", {
        zipPath,
        targetDir,
        textureCount: await countPngFiles(targetDir),
        modelsReady: await hasModelFiles(textureRoot)
      });
      return;
    }

    logger.warn("Texture zip was found, but no PNG block textures were inside it.", {
      zipPath,
      targetDir
    });
  }

  try {
    await downloadGithubRenderAssets(targetDir, textureZipUrl);
    if (await hasPngFiles(targetDir)) return;
  } catch (error) {
    logger.warn("GitHub render asset download failed; trying texture zip fallback.", {
      error: error.message,
      targetDir
    });
  }

  if (isDefaultGithubArchive(textureZipUrl)) {
    logger.warn("No block textures found; renderer will use generated fallback materials.", {
      targetDir
    });
    return;
  }

  const downloadedZip = path.join(process.cwd(), "data", "resource-pack.zip");
  try {
    const downloaded = await downloadZip(textureZipUrl, downloadedZip);
    if (downloaded) {
      logger.info("Downloaded texture zip", { zipPath: downloaded, textureZipUrl });
      await fsp.mkdir(targetDir, { recursive: true });
      await extract(downloaded, { dir: targetDir });
      const pngDir = await findPngDirectory(targetDir);
      if (pngDir) await flattenPngDirectory(pngDir, targetDir);
    }
  } catch (error) {
    logger.warn("Texture zip download failed; renderer will use fallback materials.", {
      error: error.message,
      textureZipUrl,
      targetDir
    });
    return;
  }

  if (await hasPngFiles(targetDir)) {
    try {
      await downloadGithubRenderAssets(targetDir, textureZipUrl);
    } catch (error) {
      logger.warn("Minecraft model/blockstate download failed after texture zip download.", {
        error: error.message,
        targetDir
      });
    }
    logger.info("Texture folder ready", {
      targetDir,
      textureCount: await countPngFiles(targetDir),
      modelsReady: await hasModelFiles(textureRoot)
    });
    return;
  }

  logger.warn("No block textures found; renderer will use generated fallback materials.", {
    targetDir
  });
}
