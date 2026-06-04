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
const JAR_PATH = path.join(CACHE_ROOT, `client-${VERSION}.jar`);
const TEXTURE_PREFIX = 'assets/minecraft/textures/block/';

const imageCache = new Map();
let ready = false;

export async function initTextures() {
  fs.mkdirSync(TEXTURE_DIR, { recursive: true });

  const alreadyCached = fs.existsSync(JAR_PATH) &&
    fs.readdirSync(TEXTURE_DIR).some(file => file.endsWith('.png'));

  if (!alreadyCached) {
    log.info('[TextureManager] Downloading Minecraft client JAR...');
    await downloadJar();
    log.info('[TextureManager] Extracting block textures...');
    await extractTextures();
    log.info('[TextureManager] Extraction complete.');
  } else {
    log.info('[TextureManager] Using cached textures.');
  }

  ready = true;
}

export async function getTexture(name) {
  if (!name) return null;
  const key = name.replace(/\.png$/, '');
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

async function extractTextures() {
  const jar = fs.readFileSync(JAR_PATH);
  const entries = readZipCentralDirectory(jar);
  let extracted = 0;

  for (const entry of entries) {
    if (!entry.name.startsWith(TEXTURE_PREFIX) || !entry.name.endsWith('.png')) continue;

    const destination = path.join(TEXTURE_DIR, path.basename(entry.name));
    if (fs.existsSync(destination)) continue;

    fs.writeFileSync(destination, readZipEntryData(jar, entry));
    extracted += 1;
  }

  log.info(`[TextureManager] Extracted ${extracted} block texture(s).`);
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
