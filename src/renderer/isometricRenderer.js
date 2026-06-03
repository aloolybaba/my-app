import { createCanvas } from 'canvas';
import { getTexture } from './textureManager.js';
import { resolveFaces } from './blockFaceResolver.js';
import { getBlockColor } from './blockColors.js';
import { log } from '../utils/logger.js';

const N = 16;
const HW = 16;
const QH = 8;
const BH = 16;
const PAD = 24;
const MAX_CANVAS = 4096;

const SHADE_TOP = 1.0;
const SHADE_LEFT = 0.6;
const SHADE_RIGHT = 0.8;

export async function renderSchematic(schematic) {
  const { blocks, palette, size } = schematic;
  const { x: sizeX, y: sizeY, z: sizeZ } = size;

  const airIndex = palette.findIndex(block => block.name === 'minecraft:air');
  const faceCache = new Map();

  for (let i = 0; i < palette.length; i += 1) {
    if (i === airIndex) continue;
    const raw = palette[i].rawName ?? palette[i].name;
    const faces = resolveFaces(raw);
    const [top, left, right] = await Promise.all([
      getTexture(faces.top?.replace('.png', '')),
      getTexture(faces.left?.replace('.png', '')),
      getTexture(faces.right?.replace('.png', '')),
    ]);
    faceCache.set(i, { top, left, right, raw });
  }

  const drawList = [];
  for (let y = 0; y < sizeY; y += 1) {
    for (let z = 0; z < sizeZ; z += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        const index = x + z * sizeX + y * (sizeX * sizeZ);
        const paletteIndex = blocks[index];
        if (paletteIndex === airIndex || !faceCache.has(paletteIndex)) continue;
        drawList.push({ x, y, z, paletteIndex });
      }
    }
  }

  if (!drawList.length) {
    throw new Error('Schematic contains no non-air blocks to render.');
  }

  if (process.env.DEBUG_BLOCKS === 'true') {
    logTextureMisses(faceCache);
  }

  drawList.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return (b.z - b.x) - (a.z - a.x);
  });

  let tileHW = HW;
  let tileQH = QH;
  let tileBH = BH;
  let bounds = calculateBounds(drawList, tileHW, tileQH, tileBH);
  let canvasWidth = bounds.maxX - bounds.minX + tileHW * 2 + PAD * 2;
  let canvasHeight = bounds.maxY - bounds.minY + tileBH + tileQH + PAD * 2;

  if (canvasWidth > MAX_CANVAS || canvasHeight > MAX_CANVAS) {
    const scale = Math.min(MAX_CANVAS / canvasWidth, MAX_CANVAS / canvasHeight);
    tileHW = Math.max(1, Math.floor(HW * scale));
    tileQH = Math.max(1, Math.floor(QH * scale));
    tileBH = Math.max(1, Math.floor(BH * scale));

    bounds = calculateBounds(drawList, tileHW, tileQH, tileBH);
    canvasWidth = bounds.maxX - bounds.minX + tileHW * 2 + PAD * 2;
    canvasHeight = bounds.maxY - bounds.minY + tileBH + tileQH + PAD * 2;
  }

  const canvas = createCanvas(Math.ceil(canvasWidth), Math.ceil(canvasHeight));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = -bounds.minX + PAD;
  const offsetY = -bounds.minY + PAD;
  const scaleRatio = tileHW / HW;

  for (const { x, y, z, paletteIndex } of drawList) {
    const cx = (x - z) * tileHW + offsetX;
    const cy = (x + z) * tileQH - y * tileBH + offsetY;
    drawBlock(ctx, cx, cy, faceCache.get(paletteIndex), tileHW, tileQH, scaleRatio);
  }

  return canvas.toBuffer('image/png', { compressionLevel: 9 });
}

export const renderIsometric = renderSchematic;

function calculateBounds(drawList, halfWidth, quarterHeight, blockHeight) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y, z } of drawList) {
    const screenX = (x - z) * halfWidth;
    const screenY = (x + z) * quarterHeight - y * blockHeight;
    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  }

  return { minX, minY, maxX, maxY };
}

function drawBlock(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio) {
  ctx.save();
  ctx.setTransform(scaleRatio, scaleRatio * 0.5, -scaleRatio, scaleRatio * 0.5, cx, cy);
  drawFace(ctx, faces.top, faces.raw, SHADE_TOP);
  ctx.restore();

  ctx.save();
  ctx.setTransform(scaleRatio, scaleRatio * 0.5, 0, scaleRatio, cx - halfWidth, cy + quarterHeight);
  drawFace(ctx, faces.left, faces.raw, SHADE_LEFT);
  ctx.restore();

  ctx.save();
  ctx.setTransform(scaleRatio, -scaleRatio * 0.5, 0, scaleRatio, cx, cy + quarterHeight * 2);
  drawFace(ctx, faces.right, faces.raw, SHADE_RIGHT);
  ctx.restore();
}

function drawFace(ctx, image, rawBlockName, shade) {
  if (image) {
    ctx.drawImage(image, 0, 0, N, N);
    if (shade < 1) {
      ctx.globalCompositeOperation = 'multiply';
      const channel = Math.round(255 * shade);
      ctx.fillStyle = `rgb(${channel},${channel},${channel})`;
      ctx.fillRect(0, 0, N, N);
      ctx.globalCompositeOperation = 'source-over';
    }
    return;
  }

  const color = getBlockColor(rawBlockName);
  const fallback = shade >= 1 ? color?.top : shade >= 0.75 ? color?.right : color?.left;
  ctx.fillStyle = fallback ?? '#808080';
  ctx.fillRect(0, 0, N, N);
}

function logTextureMisses(faceCache) {
  const misses = new Set();
  for (const { top, left, right, raw } of faceCache.values()) {
    if (!top || !left || !right) misses.add(raw);
  }

  if (!misses.size) return;
  log.warn('[RENDERER] Blocks with missing texture faces:');
  for (const block of [...misses].sort()) log.warn(`  - ${block}`);
}
