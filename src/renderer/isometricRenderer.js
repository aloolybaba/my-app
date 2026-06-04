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

const faceCanvas = createCanvas(N, N);
const faceCtx = faceCanvas.getContext('2d');
faceCtx.imageSmoothingEnabled = false;

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
    faceCache.set(i, {
      top,
      left,
      right,
      raw,
      shape: faces.shape ?? 'cube',
      half: faces.half ?? 'bottom',
      side: faces.side ?? 'both',
    });
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
  let canvasHeight = bounds.maxY - bounds.minY + tileBH + tileQH * 2 + PAD * 2;

  if (canvasWidth > MAX_CANVAS || canvasHeight > MAX_CANVAS) {
    const scale = Math.min(MAX_CANVAS / canvasWidth, MAX_CANVAS / canvasHeight);
    tileHW = Math.max(1, Math.floor(HW * scale));
    tileQH = Math.max(1, Math.floor(QH * scale));
    tileBH = Math.max(1, Math.floor(BH * scale));

    bounds = calculateBounds(drawList, tileHW, tileQH, tileBH);
    canvasWidth = bounds.maxX - bounds.minX + tileHW * 2 + PAD * 2;
    canvasHeight = bounds.maxY - bounds.minY + tileBH + tileQH * 2 + PAD * 2;
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
    drawBlock(ctx, cx, cy, faceCache.get(paletteIndex), tileHW, tileQH, tileBH, scaleRatio);
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

function drawBlock(ctx, cx, cy, faces, halfWidth, quarterHeight, blockHeight, scaleRatio) {
  if (faces.shape === 'top_flat') {
    drawTopFace(ctx, cx, cy + blockHeight - 1, faces, scaleRatio);
    return;
  }

  if (faces.shape === 'side_flat') {
    drawVisibleSides(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, 1);
    return;
  }

  if (faces.shape === 'cross') {
    drawSideFace(ctx, cx, cy, faces.left, faces.raw, SHADE_LEFT, 'left', halfWidth, quarterHeight, scaleRatio, 1);
    drawSideFace(ctx, cx, cy, faces.right, faces.raw, SHADE_RIGHT, 'right', halfWidth, quarterHeight, scaleRatio, 1);
    return;
  }

  if (faces.shape === 'slab') {
    const slabCy = faces.half === 'top' ? cy : cy + blockHeight / 2;
    drawCube(ctx, cx, slabCy, faces, halfWidth, quarterHeight, scaleRatio, 0.5);
    return;
  }

  drawCube(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, 1);
}

function drawCube(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, heightRatio) {
  drawTopFace(ctx, cx, cy, faces, scaleRatio);
  drawSideFace(ctx, cx, cy, faces.left, faces.raw, SHADE_LEFT, 'left', halfWidth, quarterHeight, scaleRatio, heightRatio);
  drawSideFace(ctx, cx, cy, faces.right, faces.raw, SHADE_RIGHT, 'right', halfWidth, quarterHeight, scaleRatio, heightRatio);
}

function drawTopFace(ctx, cx, cy, faces, scaleRatio) {
  ctx.save();
  ctx.setTransform(scaleRatio, scaleRatio * 0.5, -scaleRatio, scaleRatio * 0.5, cx, cy);
  drawFace(ctx, faces.top, faces.raw, SHADE_TOP);
  ctx.restore();
}

function drawVisibleSides(ctx, cx, cy, faces, halfWidth, quarterHeight, scaleRatio, heightRatio) {
  if (faces.side === 'left' || faces.side === 'both') {
    drawSideFace(ctx, cx, cy, faces.left, faces.raw, SHADE_LEFT, 'left', halfWidth, quarterHeight, scaleRatio, heightRatio);
  }

  if (faces.side === 'right' || faces.side === 'both') {
    drawSideFace(ctx, cx, cy, faces.right, faces.raw, SHADE_RIGHT, 'right', halfWidth, quarterHeight, scaleRatio, heightRatio);
  }
}

function drawSideFace(ctx, cx, cy, image, rawBlockName, shade, side, halfWidth, quarterHeight, scaleRatio, heightRatio) {
  ctx.save();
  if (side === 'left') {
    ctx.setTransform(scaleRatio, scaleRatio * 0.5, 0, scaleRatio * heightRatio, cx - halfWidth, cy + quarterHeight);
  } else {
    ctx.setTransform(scaleRatio, -scaleRatio * 0.5, 0, scaleRatio * heightRatio, cx, cy + quarterHeight * 2);
  }
  drawFace(ctx, image, rawBlockName, shade);
  ctx.restore();
}

function drawFace(ctx, image, rawBlockName, shade) {
  if (image) {
    faceCtx.globalCompositeOperation = 'source-over';
    faceCtx.clearRect(0, 0, N, N);
    faceCtx.drawImage(image, 0, 0, Math.min(N, image.width), Math.min(N, image.height), 0, 0, N, N);
    if (shade < 1) {
      faceCtx.globalCompositeOperation = 'source-atop';
      faceCtx.fillStyle = `rgba(0,0,0,${1 - shade})`;
      faceCtx.fillRect(0, 0, N, N);
      faceCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(faceCanvas, 0, 0, N, N);
    return;
  }

  const color = getBlockColor(rawBlockName);
  const fallback = shade >= 1 ? color?.top : shade >= 0.75 ? color?.right : color?.left;
  ctx.fillStyle = fallback ?? '#808080';
  ctx.fillRect(0, 0, N, N);
}

function logTextureMisses(faceCache) {
  const misses = new Set();
  for (const faces of faceCache.values()) {
    if (hasMissingRequiredTexture(faces)) misses.add(faces.raw);
  }

  if (!misses.size) return;
  log.warn('[RENDERER] Blocks with missing texture faces:');
  for (const block of [...misses].sort()) log.warn(`  - ${block}`);
}

function hasMissingRequiredTexture(faces) {
  if (faces.shape === 'top_flat') return !faces.top;
  if (faces.shape === 'side_flat') {
    if (faces.side === 'left') return !faces.left;
    if (faces.side === 'right') return !faces.right;
    return !faces.left || !faces.right;
  }
  if (faces.shape === 'cross') return !faces.left || !faces.right;
  return !faces.top || !faces.left || !faces.right;
}
