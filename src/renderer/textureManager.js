import StreamZip from 'node-stream-zip';
import { loadImage } from 'canvas';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
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
  const zip = new StreamZip.async({ file: JAR_PATH });
  try {
    const entries = await zip.entries();
    const textureEntries = Object.values(entries).filter(entry =>
      entry.name.startsWith(TEXTURE_PREFIX) && entry.name.endsWith('.png')
    );

    for (const entry of textureEntries) {
      const destination = path.join(TEXTURE_DIR, path.basename(entry.name));
      if (fs.existsSync(destination)) continue;
      fs.writeFileSync(destination, await zip.entryData(entry.name));
    }
  } finally {
    await zip.close();
  }
}
