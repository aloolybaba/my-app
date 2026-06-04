import { loadImage } from 'canvas';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { inflateRawSync } from 'zlib';
import { log } from '../utils/logger.js';

const VERSION = process.env.MINECRAFT_TEXTURE_VERSION ?? '1.21.4';
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const CACHE_ROOT = './cache';
const TEXTURE_DIR = path.join(CACHE_ROOT, 'textures', 'block');
const BLOCKSTATE_DIR = path.join(CACHE_ROOT, 'blockstates');
const MODEL_DIR = path.join(CACHE_ROOT, 'models', 'block');
const JAR_PATH = path.join(CACHE_ROOT, `client-${VERSION}.jar`);
const CACHE_MARKER = path.join(CACHE_ROOT, 'block-assets-v4.ready');
const TEXTURE_PREFIX = 'assets/minecraft/textures/block/';
const BLOCKSTATE_PREFIX = 'assets/minecraft/blockstates/';
const MODEL_PREFIX = 'assets/minecraft/models/block/';
const REQUIRED_ASSETS = [
  path.join(TEXTURE_DIR, 'stone.png'),
  path.join(TEXTURE_DIR, 'grass_block_top.png'),
  path.join(TEXTURE_DIR, 'cobblestone.png'),
  path.join(TEXTURE_DIR, 'rail.png'),
  path.join(TEXTURE_DIR, 'lever.png'),
  path.join(TEXTURE_DIR, 'scaffolding_top.png'),
  path.join(TEXTURE_DIR, 'scaffolding_side.png'),
  path.join(TEXTURE_DIR, 'scaffolding_bottom.png'),
  path.join(TEXTURE_DIR, 'hopper_inside.png'),
  path.join(TEXTURE_DIR, 'hopper_outside.png'),
  path.join(TEXTURE_DIR, 'hopper_top.png'),
  path.join(TEXTURE_DIR, 'piston_top.png'),
  path.join(TEXTURE_DIR, 'piston_top_sticky.png'),
  path.join(TEXTURE_DIR, 'piston_side.png'),
  path.join(TEXTURE_DIR, 'piston_bottom.png'),
  path.join(TEXTURE_DIR, 'piston_inner.png'),
  path.join(TEXTURE_DIR, 'redstone_torch.png'),
  path.join(TEXTURE_DIR, 'redstone_torch_off.png'),
  path.join(TEXTURE_DIR, 'repeater.png'),
  path.join(TEXTURE_DIR, 'repeater_on.png'),
  path.join(TEXTURE_DIR, 'comparator.png'),
  path.join(TEXTURE_DIR, 'comparator_on.png'),
  path.join(TEXTURE_DIR, 'redstone_dust_dot.png'),
  path.join(TEXTURE_DIR, 'redstone_dust_line0.png'),
  path.join(TEXTURE_DIR, 'redstone_dust_line1.png'),
  path.join(TEXTURE_DIR, 'redstone_dust_overlay.png'),
  path.join(TEXTURE_DIR, 'fire_0.png'),
  path.join(TEXTURE_DIR, 'soul_fire_0.png'),
  path.join(BLOCKSTATE_DIR, 'stone.json'),
  path.join(BLOCKSTATE_DIR, 'observer.json'),
  path.join(BLOCKSTATE_DIR, 'hopper.json'),
  path.join(BLOCKSTATE_DIR, 'piston.json'),
  path.join(BLOCKSTATE_DIR, 'sticky_piston.json'),
  path.join(BLOCKSTATE_DIR, 'piston_head.json'),
  path.join(BLOCKSTATE_DIR, 'redstone_torch.json'),
  path.join(BLOCKSTATE_DIR, 'redstone_wall_torch.json'),
  path.join(BLOCKSTATE_DIR, 'repeater.json'),
  path.join(BLOCKSTATE_DIR, 'comparator.json'),
  path.join(BLOCKSTATE_DIR, 'lever.json'),
  path.join(BLOCKSTATE_DIR, 'scaffolding.json'),
  path.join(BLOCKSTATE_DIR, 'redstone_wire.json'),
  path.join(BLOCKSTATE_DIR, 'fire.json'),
  path.join(BLOCKSTATE_DIR, 'soul_fire.json'),
  path.join(MODEL_DIR, 'cube_all.json'),
  path.join(MODEL_DIR, 'observer.json'),
  path.join(MODEL_DIR, 'hopper.json'),
  path.join(MODEL_DIR, 'hopper_side.json'),
  path.join(MODEL_DIR, 'template_piston.json'),
  path.join(MODEL_DIR, 'template_piston_head.json'),
  path.join(MODEL_DIR, 'template_piston_head_short.json'),
  path.join(MODEL_DIR, 'piston.json'),
  path.join(MODEL_DIR, 'piston_base.json'),
  path.join(MODEL_DIR, 'piston_extended.json'),
  path.join(MODEL_DIR, 'sticky_piston.json'),
  path.join(MODEL_DIR, 'piston_head.json'),
  path.join(MODEL_DIR, 'piston_head_short.json'),
  path.join(MODEL_DIR, 'piston_head_sticky.json'),
  path.join(MODEL_DIR, 'piston_head_short_sticky.json'),
  path.join(MODEL_DIR, 'template_torch.json'),
  path.join(MODEL_DIR, 'template_torch_wall.json'),
  path.join(MODEL_DIR, 'template_redstone_torch.json'),
  path.join(MODEL_DIR, 'template_redstone_torch_wall.json'),
  path.join(MODEL_DIR, 'redstone_torch.json'),
  path.join(MODEL_DIR, 'redstone_torch_off.json'),
  path.join(MODEL_DIR, 'redstone_wall_torch.json'),
  path.join(MODEL_DIR, 'redstone_wall_torch_off.json'),
  path.join(MODEL_DIR, 'repeater_1tick.json'),
  path.join(MODEL_DIR, 'repeater_1tick_locked.json'),
  path.join(MODEL_DIR, 'repeater_1tick_on.json'),
  path.join(MODEL_DIR, 'repeater_1tick_on_locked.json'),
  path.join(MODEL_DIR, 'repeater_2tick.json'),
  path.join(MODEL_DIR, 'repeater_2tick_locked.json'),
  path.join(MODEL_DIR, 'repeater_2tick_on.json'),
  path.join(MODEL_DIR, 'repeater_2tick_on_locked.json'),
  path.join(MODEL_DIR, 'repeater_3tick.json'),
  path.join(MODEL_DIR, 'repeater_3tick_locked.json'),
  path.join(MODEL_DIR, 'repeater_3tick_on.json'),
  path.join(MODEL_DIR, 'repeater_3tick_on_locked.json'),
  path.join(MODEL_DIR, 'repeater_4tick.json'),
  path.join(MODEL_DIR, 'repeater_4tick_locked.json'),
  path.join(MODEL_DIR, 'repeater_4tick_on.json'),
  path.join(MODEL_DIR, 'repeater_4tick_on_locked.json'),
  path.join(MODEL_DIR, 'comparator.json'),
  path.join(MODEL_DIR, 'comparator_on.json'),
  path.join(MODEL_DIR, 'comparator_subtract.json'),
  path.join(MODEL_DIR, 'comparator_on_subtract.json'),
  path.join(MODEL_DIR, 'lever.json'),
  path.join(MODEL_DIR, 'lever_on.json'),
  path.join(MODEL_DIR, 'scaffolding_stable.json'),
  path.join(MODEL_DIR, 'scaffolding_unstable.json'),
  path.join(MODEL_DIR, 'redstone_dust_dot.json'),
  path.join(MODEL_DIR, 'redstone_dust_side.json'),
  path.join(MODEL_DIR, 'redstone_dust_side0.json'),
  path.join(MODEL_DIR, 'redstone_dust_side1.json'),
  path.join(MODEL_DIR, 'redstone_dust_side_alt.json'),
  path.join(MODEL_DIR, 'redstone_dust_side_alt0.json'),
  path.join(MODEL_DIR, 'redstone_dust_side_alt1.json'),
  path.join(MODEL_DIR, 'redstone_dust_up.json'),
];

const imageCache = new Map();
const jsonCache = new Map();
let ready = false;

export async function initTextures() {
  fs.mkdirSync(TEXTURE_DIR, { recursive: true });
  fs.mkdirSync(BLOCKSTATE_DIR, { recursive: true });
  fs.mkdirSync(MODEL_DIR, { recursive: true });

  const alreadyCached = fs.existsSync(CACHE_MARKER) &&
    fs.existsSync(JAR_PATH) &&
    REQUIRED_ASSETS.every(file => fs.existsSync(file));

  if (!alreadyCached) {
    if (!fs.existsSync(JAR_PATH)) {
      log.info('[TextureManager] Downloading Minecraft client JAR...');
      await downloadJar();
    } else {
      log.info('[TextureManager] Using cached Minecraft client JAR.');
    }

    log.info('[TextureManager] Extracting Minecraft block assets...');
    await extractAssets();
    fs.writeFileSync(CACHE_MARKER, new Date().toISOString());
    log.info('[TextureManager] Extraction complete.');
  } else {
    log.info('[TextureManager] Using cached Minecraft block assets.');
  }

  ready = true;
}

export async function getTexture(name) {
  if (!name) return null;
  const key = normalizeTextureName(name);
  if (imageCache.has(key)) return imageCache.get(key);

  const filePath = path.join(TEXTURE_DIR, `${key}.png`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const image = await loadImage(filePath);
    imageCache.set(key, image);
    return image;
  } catch (error) {
    log.warn(`[TextureManager] Could not load texture ${key}:`, error);
    return null;
  }
}

export function isReady() {
  return ready;
}

export function getBlockstateJson(name) {
  return readJson(path.join(BLOCKSTATE_DIR, `${cleanJsonName(name)}.json`));
}

export function getBlockModelJson(name) {
  return readJson(path.join(MODEL_DIR, `${cleanJsonName(name)}.json`));
}

async function downloadJar() {
  const manifestResponse = await fetch(MANIFEST_URL);
  if (!manifestResponse.ok) throw new Error(`Version manifest download failed: ${manifestResponse.status}`);

  const manifest = await manifestResponse.json();
  const versionMeta = manifest.versions.find(version => version.id === VERSION);
  if (!versionMeta) throw new Error(`Minecraft version ${VERSION} not found in manifest`);

  const versionResponse = await fetch(versionMeta.url);
  if (!versionResponse.ok) throw new Error(`Version JSON download failed: ${versionResponse.status}`);

  const versionJson = await versionResponse.json();
  const clientUrl = versionJson.downloads.client.url;
  const jarResponse = await fetch(clientUrl);
  if (!jarResponse.ok) throw new Error(`JAR download failed: ${jarResponse.status}`);

  fs.writeFileSync(JAR_PATH, Buffer.from(await jarResponse.arrayBuffer()));
}

async function extractAssets() {
  const jar = fs.readFileSync(JAR_PATH);
  const entries = readZipCentralDirectory(jar);
  let extractedTextures = 0;
  let extractedBlockstates = 0;
  let extractedModels = 0;

  for (const entry of entries) {
    const destination = getAssetDestination(entry.name);
    if (!destination) continue;
    if (fs.existsSync(destination)) continue;

    fs.writeFileSync(destination, readZipEntryData(jar, entry));
    if (entry.name.startsWith(TEXTURE_PREFIX)) extractedTextures += 1;
    else if (entry.name.startsWith(BLOCKSTATE_PREFIX)) extractedBlockstates += 1;
    else if (entry.name.startsWith(MODEL_PREFIX)) extractedModels += 1;
  }

  log.info(`[TextureManager] Extracted ${extractedTextures} texture(s), ${extractedBlockstates} blockstate(s), ${extractedModels} model(s).`);
}

function getAssetDestination(entryName) {
  if (entryName.startsWith(TEXTURE_PREFIX) && entryName.endsWith('.png')) {
    return path.join(TEXTURE_DIR, path.basename(entryName));
  }
  if (entryName.startsWith(BLOCKSTATE_PREFIX) && entryName.endsWith('.json')) {
    return path.join(BLOCKSTATE_DIR, path.basename(entryName));
  }
  if (entryName.startsWith(MODEL_PREFIX) && entryName.endsWith('.json')) {
    return path.join(MODEL_DIR, path.basename(entryName));
  }
  return null;
}

function normalizeTextureName(name) {
  return name
    .replace(/\.png$/, '')
    .replace(/^minecraft:/, '')
    .replace(/^block\//, '')
    .replace(/^textures\/block\//, '');
}

function cleanJsonName(name) {
  return name
    .replace(/^minecraft:/, '')
    .replace(/^block\//, '')
    .replace(/\.json$/, '');
}

function readJson(filePath) {
  if (jsonCache.has(filePath)) return jsonCache.get(filePath);
  if (!fs.existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    jsonCache.set(filePath, parsed);
    return parsed;
  } catch (error) {
    log.warn(`[TextureManager] Could not parse JSON asset ${filePath}:`, error);
    jsonCache.set(filePath, null);
    return null;
  }
}

function readZipCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory entry');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');

    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xFFFF - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }

  throw new Error('Could not find ZIP end of central directory');
}

function readZipEntryData(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header for ${entry.name}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateRawSync(compressed);

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}`);
}
