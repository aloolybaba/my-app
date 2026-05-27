import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import extract from "extract-zip";
import { logger } from "../logger.js";

const githubTextureSource = {
  owner: "InventivetalentDev",
  repo: "minecraft-assets",
  branch: "26.1.2",
  blockPath: "assets/minecraft/textures/block/"
};

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

async function downloadGithubBlockTextures(targetDir, textureZipUrl) {
  const branch = inferGithubBranch(textureZipUrl);
  const { owner, repo, blockPath } = githubTextureSource;
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
  const pngs = (body.tree || []).filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path?.startsWith(blockPath) &&
      entry.path.toLowerCase().endsWith(".png")
  );

  if (pngs.length === 0) {
    throw new Error("GitHub texture tree did not contain block PNG files.");
  }

  let saved = 0;
  await fsp.mkdir(targetDir, { recursive: true });
  await mapWithConcurrency(pngs, 12, async (entry) => {
    const name = path.basename(entry.path);
    const output = path.join(targetDir, name);
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
    await fsp.writeFile(output, Buffer.from(await asset.arrayBuffer()));
    saved += 1;
  });

  if (saved === 0) {
    throw new Error("GitHub texture files were found but none could be downloaded.");
  }

  logger.info("Downloaded block textures", {
    targetDir,
    branch,
    saved,
    available: pngs.length
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
  if (await hasPngFiles(targetDir)) {
    logger.info("Texture folder ready", { targetDir });
    return;
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
      logger.info("Extracted block texture zip", { zipPath, targetDir });
      return;
    }

    logger.warn("Texture zip was found, but no PNG block textures were inside it.", {
      zipPath,
      targetDir
    });
  }

  try {
    await downloadGithubBlockTextures(targetDir, textureZipUrl);
    if (await hasPngFiles(targetDir)) return;
  } catch (error) {
    logger.warn("GitHub texture download failed; trying texture zip fallback.", {
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
    logger.info("Texture folder ready", { targetDir });
    return;
  }

  logger.warn("No block textures found; renderer will use generated fallback materials.", {
    targetDir
  });
}
